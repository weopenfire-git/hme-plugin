import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { Config } from '../config.ts'
import type { ArchiveCategory, FrozenSnapshot, MemoryAction, MemoryTarget } from '../types.ts'
import {
  applyTaggedWrite, emptyIndex, normalizeTags, parseIndex, renderIndex,
  renderEntry, searchEntries, stripTags, extractTags, tagFilename, isExpired,
} from './archive.ts'
import type { ArchiveTag } from '../types.ts'
import type { MemoryValue, EntryMeta, RecallHitV2 } from './archive.ts'
import { DEFAULT_RULES, parseRules, renderRules, ttlForTier } from './rules.ts'
import { applyMutation, parseFacts, renderFacts } from './facts.ts'
import { VERSION } from '../version.ts'
import type { StatusReport } from '../status.ts'

/** Per-fact usage statistics, kept in a metadata file beside archive.md. */
interface FactUsage {
  uses: number
  lastUsed: number
}

/** Metadata map: fact text → usage. */
type ArchiveMeta = Record<string, FactUsage>

/** Read a file as UTF-8, returning '' when it is absent and rethrowing real errors. */
function readFileIfPresent(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

/** Best-effort read for freezing: an unreadable file degrades to an empty snapshot. */
function readForFreeze(path: string): string {
  try {
    return readFileIfPresent(path)
  } catch {
    // A permission or mid-read race must not block session start; the next session re-reads.
    return ''
  }
}

/** Write UTF-8 content, creating parent directories first. */
function writeFileEnsured(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

/**
 * Read-merge-write store over the two core files plus the archive. All I/O is
 * synchronous so a read-then-write mutation is atomic within this process.
 */
export class MemoryStore {
  private readonly frozen = new WeakMap<ScopeKey, FrozenSnapshot>()

  constructor(private readonly config: Config) {}

  /** Absolute path of the global USER.md. */
  private userPath(): string {
    return resolve(this.config.userMemoryFile)
  }

  /** Absolute path of the workspace MEMORY.md for one session workspace root. */
  private memoryPath(workspaceRoot: string | undefined): string {
    const root = workspaceRoot ?? process.cwd()
    return resolve(root, this.config.workspaceMemoryFile)
  }

  /** Absolute path of the workspace archive.md (legacy single file). */
  private legacyArchivePath(workspaceRoot: string | undefined): string {
    const root = workspaceRoot ?? process.cwd()
    return resolve(root, this.config.archiveMemoryFile)
  }

  /** Root directory holding per-topic archive files (P2.1). */
  private archiveDir(workspaceRoot: string | undefined): string {
    const root = workspaceRoot ?? process.cwd()
    return resolve(root, this.config.archiveDirectory)
  }

  /** Absolute path of one topic file inside the archive directory. */
  private topicPath(filename: string, workspaceRoot: string | undefined): string {
    return resolve(this.archiveDir(workspaceRoot), filename)
  }

  /** Absolute path of INDEX.md. */
  private indexPath(workspaceRoot: string | undefined): string {
    return resolve(this.archiveDir(workspaceRoot), 'INDEX.md')
  }

  /** Absolute path of the archive metadata JSON, derived from the archive path. */
  private metaPath(workspaceRoot: string | undefined): string {
    return resolve(this.archiveDir(workspaceRoot), 'META.json')
  }

  /** Synchronous freeze of both core files for one scope, at session start. */
  freeze(scope: ScopeKey, workspaceRoot: string | undefined): void {
    this.frozen.set(scope, {
      user: readForFreeze(this.userPath()),
      memory: readForFreeze(this.memoryPath(workspaceRoot)),
    })
  }

  /** Drop one scope's frozen snapshot. */
  unfreeze(scope: ScopeKey): void {
    this.frozen.delete(scope)
  }

  /** Frozen raw facts for one scope, or empty before freeze. */
  snapshotFor(scope: ScopeKey | undefined, target: MemoryTarget): string {
    if (scope === undefined) return ''
    return this.frozen.get(scope)?.[target] ?? ''
  }

  /** Read-merge-write one core mutation against the latest on-disk content. */
  mutate(target: MemoryTarget, action: MemoryAction, content: string | undefined, oldText: string | undefined, workspaceRoot: string | undefined): string {
    const path = target === 'user' ? this.userPath() : this.memoryPath(workspaceRoot)
    const limit = target === 'user' ? this.config.userCharLimit : this.config.memoryCharLimit
    const outcome = applyMutation(parseFacts(readFileIfPresent(path)), action, content, oldText, limit)
    if (outcome.ok) writeFileEnsured(path, renderFacts(outcome.facts))
    return outcome.message
  }

  /** Migrate a legacy single archive.md into per-topic files (idempotent). */
  ensureMigrated(workspaceRoot: string | undefined): void {
    const legacyPath = this.legacyArchivePath(workspaceRoot)
    const legacyText = readFileIfPresent(legacyPath)
    if (legacyText.trim().length === 0) return
    const migDir = this.archiveDir(workspaceRoot)
    const indexPath = this.indexPath(workspaceRoot)
    const index = parseIndex(readFileIfPresent(indexPath))
    // Migrate each non-empty § line under one migrated topic bucket.
    for (const raw of legacyText.split(/\r?\n/)) {
      const line = raw.trim()
      if (line.length === 0 || line.startsWith('## ')) continue
      // Bucket by a heuristic tag derived from first word; default 'legacy'.
      const tag = normalizeTags([line.split(/\s+/)[0] ?? 'legacy'])[0] ?? 'legacy'
      const filename = tagFilename(tag)
      const targetPath = resolve(migDir, filename)
      const existing = readFileIfPresent(targetPath) ? readFileIfPresent(targetPath).trim().split(/\r?\n/) : []
      const outcome = applyTaggedWrite(existing, [tag], stripTags(line))
      writeFileEnsured(targetPath, outcome.entries.join('\n') + '\n')
      index.entries[tag] = { filename, lastUpdated: new Date().toISOString() }
    }
    writeFileEnsured(indexPath, renderIndex(index))
    // Rename legacy file out of the way so a later call is idempotent.
    try {
      writeFileSync(legacyPath + '.migrated', legacyText)
    } catch { /* already handled by backup */ }
    writeFileSync(legacyPath, '')
  }

  /** Write one tagged entry into the archive directory, overwriting same-tag entries. */
  mutateTopic(tags: readonly ArchiveTag[], content: string | undefined, workspaceRoot: string | undefined, value?: MemoryValue, ttl?: string): string {
    if (content === undefined || content.trim().length === 0) return 'archive requires non-empty content'
    this.ensureMigrated(workspaceRoot)
    const norm = normalizeTags(tags)
    if (norm.length === 0) {
      const err = 'archive requires at least one tag'
      return err
    }
    const tag = norm[0]
    const filename = tagFilename(tag)
    const targetPath = this.topicPath(filename, workspaceRoot)
    const existing = readFileIfPresent(targetPath).trim().split(/\r?\n/).filter((l) => l.length > 0)
    const effectiveTtl = (value === undefined && ttl === undefined)
      ? undefined
      : (ttl ?? ttlForTier(this.readRules(workspaceRoot), value))
    const meta: EntryMeta = { value, ttl: effectiveTtl }
    const outcome = applyTaggedWrite(existing, norm, content, meta)
    writeFileEnsured(targetPath, outcome.entries.join('\n') + '\n')
    // update index
    const indexPath = this.indexPath(workspaceRoot)
    const index = parseIndex(readFileIfPresent(indexPath))
    index.entries[tag] = { filename, lastUpdated: new Date().toISOString() }
    writeFileEnsured(indexPath, renderIndex(index))
    return outcome.replaced ? 'replaced existing ' + tag : 'added to ' + tag
  }

  /** Move one core fact into the archive (tag-based). */
  moveFromCore(oldText: string | undefined, tag: ArchiveTag | undefined, workspaceRoot: string | undefined): string {
    if (oldText === undefined || oldText.trim().length === 0) return 'move requires non-empty old_text'
    if (tag === undefined) return 'move requires a destination tag'
    this.ensureMigrated(workspaceRoot)
    const corePath = this.memoryPath(workspaceRoot)
    const coreFacts = parseFacts(readFileIfPresent(corePath))
    const matches = coreFacts.filter((fact) => fact.includes(oldText))
    if (matches.length === 0) return 'no fact contains "' + oldText + '"'
    if (matches.length > 1) return 'ambiguous: ' + matches.length + ' facts match "' + oldText + '"; narrow old_text'
    const moved = matches[0]
    const remaining = coreFacts.filter((fact) => fact !== moved)
    // add to archive then remove from core only if archive accepted
    const filename = tagFilename(tag)
    const targetPath = this.topicPath(filename, workspaceRoot)
    const existing = readFileIfPresent(targetPath).trim().split(/\r?\n/).filter((l) => l.length > 0)
    const outcome = applyTaggedWrite(existing, [tag], stripTags(moved))
    writeFileEnsured(targetPath, outcome.entries.join('\n') + '\n')
    const indexPath = this.indexPath(workspaceRoot)
    const index = parseIndex(readFileIfPresent(indexPath))
    index.entries[tag] = { filename, lastUpdated: new Date().toISOString() }
    writeFileEnsured(indexPath, renderIndex(index))
    writeFileEnsured(corePath, renderFacts(remaining))
    return 'moved "' + stripTags(moved) + '" to archive ' + tag
  }

  /** Case-insensitive keyword search across all topic files, recording usage. */
  recall(query: string, workspaceRoot: string | undefined): string {
    this.ensureMigrated(workspaceRoot)
    const dir = this.archiveDir(workspaceRoot)
    let files: string[] = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    const allHits: RecallHitV2[] = []
    for (const file of files) {
      const text = readFileIfPresent(resolve(dir, file))
      const entries = text.trim().split(/\r?\n/).filter((l) => l.length > 0)
      allHits.push(...searchEntries(file, entries, query))
    }
    if (allHits.length === 0) return 'no archive facts match "' + query + '"'
    this.bumpUsage(allHits, workspaceRoot)
    return allHits.map((h) => '[' + (h.tags.length > 0 ? h.tags.join(',') : '?') + '] ' + h.filename + ':' + h.line + ' ' + h.text).join('\n')
  }

  /** Read the metadata map, degrading to empty when absent or corrupt. */
  /** Read the expiry rules file, degrading to defaults when absent/corrupt. */
  private readRules(workspaceRoot: string | undefined) {
    const dir = this.archiveDir(workspaceRoot)
    const rulesPath = resolve(dir, 'RULES.md')
    return parseRules(readFileIfPresent(rulesPath))
  }

  private readMeta(workspaceRoot: string | undefined): ArchiveMeta {
    const text = readFileIfPresent(this.metaPath(workspaceRoot))
    if (text.trim().length === 0) return {}
    try {
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null ? parsed as ArchiveMeta : {}
    } catch {
      // A corrupt metadata file degrades to empty; archive facts are unaffected and usage rebuilds on next recall.
      return {}
    }
  }

  /** Persist the metadata map. */
  private writeMeta(workspaceRoot: string | undefined, meta: ArchiveMeta): void {
    writeFileEnsured(this.metaPath(workspaceRoot), JSON.stringify(meta, null, 2) + '\n')
  }

  /** Increment use counts for recall hits. */
  private bumpUsage(hits: readonly RecallHitV2[], workspaceRoot: string | undefined): void {
    const meta = this.readMeta(workspaceRoot)
    const now = Date.now()
    for (const hit of hits) {
      const entry = meta[hit.text] ?? { uses: 0, lastUsed: 0 }
      entry.uses += 1
      entry.lastUsed = now
      meta[hit.text] = entry
    }
    this.writeMeta(workspaceRoot, meta)
  }

  /**
   * Rank every entry across topic files by least-used then oldest. Used as an
   * advisory helper; the tagged archive rejects overflow rather than deleting.
   */
  async suggestEvictions(workspaceRoot: string | undefined, n = 5): Promise<string> {
    const meta = this.readMeta(workspaceRoot)
    const dir = this.archiveDir(workspaceRoot)
    let allFacts: string[] = []
    try {
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md')) {
        const text = readFileIfPresent(resolve(dir, file))
        allFacts.push(...text.trim().split(/\r?\n/).filter((l) => l.length > 0))
      }
    } catch { /* dir may not exist yet */ }
    const ranked = allFacts
      .map((fact) => ({ fact, usage: meta[fact] ?? { uses: 0, lastUsed: 0 } }))
      .sort((a, b) => a.usage.uses - b.usage.uses || a.usage.lastUsed - b.usage.lastUsed)
      .slice(0, n)
    if (ranked.length === 0) return ''
    return 'candidates to remove (least used, then oldest):\n' + ranked.map((r) => '- ' + r.fact).join('\n')
  }

  /** Collect a best-effort status snapshot for the dashboard; never throws. */
  status(workspaceRoot: string | undefined): StatusReport {
    let rules = DEFAULT_RULES
    try {
      rules = this.readRules(workspaceRoot)
    } catch {
      // RULES.md present but unreadable: the dashboard degrades to defaults.
    }
    const dir = this.archiveDir(workspaceRoot)
    let topicCount = 0
    let entryCount = 0
    try {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.md') || file === 'INDEX.md') continue
        topicCount += 1
        const text = readFileIfPresent(resolve(dir, file))
        entryCount += text.trim().split(/\r?\n/).filter((l) => l.length > 0).length
      }
    } catch {
      // Archive directory absent or unreadable: report zero topics and entries.
    }
    const memoryChars = workspaceRoot === undefined ? null : readForFreeze(this.memoryPath(workspaceRoot)).length
    return {
      version: VERSION,
      memoryCharLimit: this.config.memoryCharLimit,
      userCharLimit: this.config.userCharLimit,
      archiveCharLimit: this.config.archiveCharLimit,
      userMemoryFile: this.config.userMemoryFile,
      workspaceMemoryFile: this.config.workspaceMemoryFile,
      archiveDirectory: this.config.archiveDirectory,
      enableBanner: this.config.enableBanner,
      enableStatus: this.config.enableStatus,
      userChars: readForFreeze(this.userPath()).length,
      memoryChars,
      topicCount,
      entryCount,
      rules: { v1Ttl: rules.v1Ttl, v2Ttl: rules.v2Ttl, v3Ttl: rules.v3Ttl },
    }
  }
}