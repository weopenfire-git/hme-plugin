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

/** Render one entry line: optional tags then a §-terminated fact body. */
export function renderEntry(tags: readonly ArchiveTag[], body: string): string {
  const tagPrefix = tags.map((t) => TAG_OPEN + t + TAG_CLOSE).join(' ')
  const bodyLine = body.trim().endsWith('§') ? body.trim() : body.trim() + ' §'
  return (tagPrefix.length > 0 ? tagPrefix + ' ' : '') + bodyLine
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
): { entries: string[]; replaced: boolean; added: boolean } {
  const normTags = normalizeTags(tags)
  const newEntry = renderEntry(normTags, body)
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
