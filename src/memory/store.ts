import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { Config } from '../config.ts'
import type { ArchiveCategory, FrozenSnapshot, MemoryAction, MemoryTarget } from '../types.ts'
import { mutateArchive as mutateArchiveDoc, parseArchive, renderArchive, searchArchive } from './archive.ts'
import type { ArchiveDocument, RecallHit } from './archive.ts'
import { applyMutation, parseFacts, renderFacts } from './facts.ts'

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

  /** Absolute path of the workspace archive.md for one session workspace root. */
  private archivePath(workspaceRoot: string | undefined): string {
    const root = workspaceRoot ?? process.cwd()
    return resolve(root, this.config.archiveMemoryFile)
  }

  /** Absolute path of the archive metadata JSON, derived from the archive path. */
  private metaPath(workspaceRoot: string | undefined): string {
    return this.archivePath(workspaceRoot).replace(/\.md$/, '.meta.json')
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

  /** Read-merge-write one archive-section mutation, appending eviction hints when full. */
  mutateArchive(category: ArchiveCategory, action: 'add' | 'replace' | 'remove', content: string | undefined, oldText: string | undefined, workspaceRoot: string | undefined): string {
    const path = this.archivePath(workspaceRoot)
    const doc = parseArchive(readFileIfPresent(path))
    const outcome = mutateArchiveDoc(doc, action, category, content, oldText, this.config.archiveCharLimit)
    if (!outcome.ok) {
      if (outcome.message.includes('archive over limit')) {
        const suggestion = this.suggestEvictions(doc, workspaceRoot)
        return outcome.message + (suggestion.length > 0 ? '\n' + suggestion : '')
      }
      return outcome.message
    }
    writeFileEnsured(path, renderArchive(outcome.doc))
    this.reconcileMeta(outcome.doc, workspaceRoot)
    return outcome.message
  }

  /** Move one core fact into an archive section (core-overflow downgrade). */
  moveFromCore(oldText: string | undefined, category: ArchiveCategory | undefined, workspaceRoot: string | undefined): string {
    if (oldText === undefined || oldText.trim().length === 0) return 'move requires non-empty old_text'
    if (category === undefined) return 'move requires a destination category'
    const corePath = this.memoryPath(workspaceRoot)
    const coreFacts = parseFacts(readFileIfPresent(corePath))
    const matches = coreFacts.filter((fact) => fact.includes(oldText))
    if (matches.length === 0) return 'no fact contains "' + oldText + '"'
    if (matches.length > 1) return 'ambiguous: ' + matches.length + ' facts match "' + oldText + '"; narrow old_text'
    const moved = matches[0]
    const remaining = coreFacts.filter((fact) => fact !== moved)
    const archivePath = this.archivePath(workspaceRoot)
    const doc = parseArchive(readFileIfPresent(archivePath))
    const outcome = mutateArchiveDoc(doc, 'add', category, moved, undefined, this.config.archiveCharLimit)
    if (!outcome.ok) return outcome.message
    writeFileEnsured(corePath, renderFacts(remaining))
    writeFileEnsured(archivePath, renderArchive(outcome.doc))
    return 'moved "' + moved + '" to archive ' + category
  }

  /** Case-insensitive keyword search over the workspace archive, recording usage. */
  recall(query: string, workspaceRoot: string | undefined): string {
    const path = this.archivePath(workspaceRoot)
    const hits = searchArchive(readFileIfPresent(path), query)
    if (hits.length === 0) return 'no archive facts match "' + query + '"'
    this.bumpUsage(hits, workspaceRoot)
    return hits.map((hit) => '[' + (hit.category ?? '?') + '] line ' + hit.line + ': ' + hit.text).join('\n')
  }

  /** Read the metadata map, degrading to empty when absent or corrupt. */
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
  private bumpUsage(hits: readonly RecallHit[], workspaceRoot: string | undefined): void {
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

  /** Rank facts by least-used then oldest, returning the top n as removal candidates. */
  private suggestEvictions(doc: ArchiveDocument, workspaceRoot: string | undefined, n = 5): string {
    const meta = this.readMeta(workspaceRoot)
    const allFacts = [...doc.facts, ...doc.preferences, ...doc.methods, ...doc.lessons]
    const ranked = allFacts
      .map((fact) => ({ fact, usage: meta[fact] ?? { uses: 0, lastUsed: 0 } }))
      .sort((a, b) => a.usage.uses - b.usage.uses || a.usage.lastUsed - b.usage.lastUsed)
      .slice(0, n)
    if (ranked.length === 0) return ''
    return 'candidates to remove (least used, then oldest):\n' + ranked.map((r) => '- ' + r.fact).join('\n')
  }

  /** Drop metadata entries whose fact no longer exists after a remove/replace. */
  private reconcileMeta(doc: ArchiveDocument, workspaceRoot: string | undefined): void {
    const meta = this.readMeta(workspaceRoot)
    const live = new Set([...doc.facts, ...doc.preferences, ...doc.methods, ...doc.lessons])
    let changed = false
    for (const key of Object.keys(meta)) {
      if (!live.has(key)) {
        delete meta[key]
        changed = true
      }
    }
    if (changed) this.writeMeta(workspaceRoot, meta)
  }
}
