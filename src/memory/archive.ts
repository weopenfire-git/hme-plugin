import type { ArchiveTag } from '../types.ts'

/**
 * Archive moved to per-topic files (P2.1). Every entry line carries one or
 * more topic tags as a leading '[#tag]' prefix. The directory root keeps an
 * INDEX.md mapping tags to filenames. Overwrite policy: writing an entry that
 * collides on an existing tag replaces the old entry.
 */

/** Tag delimiter inside an entry line. */
export const TAG_OPEN = '[#'
const TAG_CLOSE = ']'

/** Extract leading tags from a raw entry line (before the § fact body). */
export function extractTags(line: string): ArchiveTag[] {
  const tags: ArchiveTag[] = []
  let rest = line
  while (rest.startsWith(TAG_OPEN)) {
    const close = rest.indexOf(TAG_CLOSE)
    if (close < 0) break
    const tag = rest.slice(2, close).trim().toLowerCase()
    if (tag.length > 0) tags.push(tag)
    rest = rest.slice(close + 1).trimStart()
  }
  return tags
}

/** Strip leading tags, returning the bare fact body. */
export function stripTags(line: string): string {
  let rest = line
  while (rest.startsWith(TAG_OPEN)) {
    const close = rest.indexOf(TAG_CLOSE)
    if (close < 0) break
    rest = rest.slice(close + 1).trimStart()
  }
  return rest
}

/** Normalize tags: lower, clean, drop empties, cap at 3. */
export function normalizeTags(tags: readonly ArchiveTag[]): ArchiveTag[] {
  const unique = new Set<ArchiveTag>()
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (tag.length > 0) unique.add(tag)
  }
  return [...unique].slice(0, 3)
}

/** Filename for a tag (kebab, no extension). */
export function tagFilename(tag: ArchiveTag): string {
  return tag + '.md'
}

/** Options for rendering an entry with optional value tier and TTL. */
export interface EntryMeta {
  value?: MemoryValue
  ttl?: string
}

/** Render one entry line: tags, value+tll markers (if any), then a §-terminated fact body. */
export function renderEntry(tags: readonly ArchiveTag[], body: string, meta?: EntryMeta): string {
  const tagPrefix = tags.map((t) => TAG_OPEN + t + TAG_CLOSE).join(' ')
  const valueMark = meta?.value === undefined ? '' : renderValueMarker(meta.value)
  const expiryMark = meta?.ttl === undefined ? '' : renderExpiryMarker(meta.ttl)
  const bodyLine = body.trim().endsWith('§') ? body.trim() : body.trim() + ' §'
  const parts = [tagPrefix, valueMark, expiryMark].filter((s) => s.length > 0).join(' ')
  return (parts.length > 0 ? parts + ' ' : '') + bodyLine
}

/** The per-topic index: tag → filename + last-updated. Lives in INDEX.md. */
export interface TopicIndexEntry {
  filename: string
  lastUpdated: string
}

export interface ArchiveIndex {
  entries: Record<ArchiveTag, TopicIndexEntry>
}

export function emptyIndex(): ArchiveIndex {
  return { entries: {} }
}

export function parseIndex(text: string): ArchiveIndex {
  const entries: ArchiveIndex['entries'] = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const [tag, lastUpdated, filename] = trimmed.split('\t')
    if (tag && filename) entries[tag] = { filename, lastUpdated: lastUpdated ?? '' }
  }
  return { entries }
}

export function renderIndex(index: ArchiveIndex): string {
  const lines = Object.entries(index.entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, { lastUpdated, filename }]) => tag + '\t' + lastUpdated + '\t' + filename)
  return lines.length === 0 ? '' : lines.join('\n') + '\n'
}

/**
 * Apply a tagged entry to one topic file's existing entries. Entry lines that
 * carry any of the new tags are replaced by the new entry (tag-based overwrite);
 * otherwise the entry is appended. Returns the new list and flags.
 */
export function applyTaggedWrite(
  existing: readonly string[],
  tags: readonly ArchiveTag[],
  body: string,
  meta?: EntryMeta,
): { entries: string[]; replaced: boolean; added: boolean } {
  const normTags = normalizeTags(tags)
  const newEntry = renderEntry(normTags, body, meta)
  if (normTags.length === 0) {
    const dedup = stripTags(newEntry).trim()
    if (existing.some((e) => stripTags(e).trim() === dedup)) return { entries: [...existing], replaced: false, added: false }
    return { entries: [...existing, newEntry], replaced: false, added: true }
  }
  const toReplace = existing.filter((entry) => {
    const entryTags = extractTags(entry)
    return normTags.some((t) => entryTags.includes(t))
  })
  if (toReplace.length > 0) {
    const kept = existing.filter((entry) => !toReplace.includes(entry))
    kept.push(newEntry)
    return { entries: kept, replaced: true, added: false }
  }
  const dedupKey = stripTags(newEntry).trim()
  if (existing.some((e) => stripTags(e).trim() === dedupKey)) return { entries: [...existing], replaced: false, added: false }
  const entries = [...existing, newEntry]
  return { entries, replaced: false, added: true }
}

/** One keyword hit inside a topic file. */
export interface RecallHitV2 {
  readonly tags: ArchiveTag[]
  readonly filename: string
  readonly line: number
  readonly text: string
}

export function searchEntries(filename: string, entries: readonly string[], query: string): RecallHitV2[] {
  const q = query.trim().toLowerCase()
  const hits: RecallHitV2[] = []
  for (let i = 0; i < entries.length; i++) {
    const text = entries[i]
    const trimmed = text.trim()
    if (trimmed.length === 0) continue
    const body = stripTags(trimmed).toLowerCase()
    if (q.length > 0 && body.includes(q)) {
      hits.push({ tags: extractTags(trimmed), filename, line: i + 1, text: trimmed })
    }
  }
  return hits
}
/**
 * Memory value tiers (your 'keep only the precious 1/10' insight).
 * Higher tier = more worth keeping when the archive must shrink.
 */
export type MemoryValue = 1 | 2 | 3

/** Render the value marker, or '' when not provided (defaults to 3/casual). */
export function renderValueMarker(value: MemoryValue | undefined): string {
  return value === undefined ? '' : '[v:' + value + ']'
}

/** Parse a leading '\[v:N]' marker; returns undefined when absent. */
export function parseValueMarker(line: string): MemoryValue | undefined {
  const m = /^\[v:([123])\]/.exec(line.trim())
  return m ? (Number(m[1]) as MemoryValue) : undefined
}

/** Render the TTL marker, or '' when no TTL. */
export function renderTtlMarker(ttl: string | undefined): string {
  return ttl === undefined ? '' : '[ttl:' + ttl + ']'
}

/** Parse a leading '\[ttl:XXX]' marker; returns undefined when absent. */
export function parseTtlMarker(line: string): string | undefined {
  const m = /^\[ttl:([^\]]+)\]/.exec(line.trim())
  return m ? m[1].trim() : undefined
}

/**
 * Parse a human-friendly TTL (e.g. '30d', '1w', '12h') into millisecond duration.
 * Unsupported or invalid input returns undefined.
 */
export function parseTtlMs(ttl: string | undefined): number | undefined {
  if (!ttl) return undefined
  const m = /^(\d+)([mdhwy]?)$/.exec(ttl.trim())
  if (!m) return undefined
  const n = Number(m[1])
  const unit = m[2] || 'd'
  const mult: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 7 * 86_400_000, m: 30 * 86_400_000, y: 365 * 86_400_000 }
  return n * (mult[unit] ?? mult.d)
}

/**
 * Compute the absolute expiry marker for a TTL, or '' when no TTL.
 * Stores \[expires:<epoch-ms>] so expiry is fixed at write time and
 * survives across sessions.
 */
export function renderExpiryMarker(ttl: string | undefined, now: number = Date.now()): string {
  const ms = parseTtlMs(ttl)
  if (ms === undefined) return ''
  return '[expires:' + (now + ms) + ']'
}

/** Parse an absolute \[expires:<epoch-ms>] marker; undefined when absent. */
export function parseExpiry(line: string): number | undefined {
  const m = /^\[expires:(\d+)\]/.exec(line.trim())
  return m ? Number(m[1]) : undefined
}

/** Whether an entry has expired, judged by its absolute expiry marker. */
export function isExpired(line: string, now: number = Date.now()): boolean {
  const exp = parseExpiry(line)
  return exp !== undefined && exp <= now
}