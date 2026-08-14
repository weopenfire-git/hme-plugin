import type { ArchiveCategory } from '../types.ts'
import { applyMutation, charCount } from './facts.ts'

/** The four archive sections, in canonical render order. */
export const ARCHIVE_CATEGORIES = ['facts', 'preferences', 'methods', 'lessons'] as const

const CATEGORY_HEADINGS: Record<ArchiveCategory, string> = {
  facts: '## Facts',
  preferences: '## Preferences',
  methods: '## Methods',
  lessons: '## Lessons',
}

/** Map a heading line back to its category; unknown headings return undefined. */
function headingToCategory(heading: string): ArchiveCategory | undefined {
  const norm = heading.trim().toLowerCase()
  for (const cat of ARCHIVE_CATEGORIES) {
    if (norm === CATEGORY_HEADINGS[cat].toLowerCase()) return cat
  }
  return undefined
}

/** Parsed archive document: one §-terminated fact list per section. */
export interface ArchiveDocument {
  facts: string[]
  preferences: string[]
  methods: string[]
  lessons: string[]
}

/** An empty archive document. */
export function emptyArchive(): ArchiveDocument {
  return { facts: [], preferences: [], methods: [], lessons: [] }
}

/**
 * Parse archive text into a document. Facts before the first known heading,
 * and facts under unknown headings, are dropped. Blank lines are ignored.
 */
export function parseArchive(text: string): ArchiveDocument {
  const doc = emptyArchive()
  let current: ArchiveCategory | undefined
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    if (line.startsWith('## ')) {
      current = headingToCategory(line)
      continue
    }
    if (current !== undefined) doc[current].push(line)
  }
  return doc
}

/** Render a document back to archive text; empty sections are omitted. */
export function renderArchive(doc: ArchiveDocument): string {
  const parts: string[] = []
  for (const cat of ARCHIVE_CATEGORIES) {
    const facts = doc[cat]
    if (facts.length === 0) continue
    parts.push(CATEGORY_HEADINGS[cat])
    parts.push(...facts)
    parts.push('')
  }
  return parts.join('\n')
}

/** Outcome of mutating one archive section. */
export interface ArchiveOutcome {
  readonly ok: boolean
  readonly doc: ArchiveDocument
  readonly message: string
}

/**
 * Apply one add/replace/remove to a section, then enforce the whole-document
 * cap. The per-section list itself is uncapped; only the total matters.
 */
export function mutateArchive(
  doc: ArchiveDocument,
  action: 'add' | 'replace' | 'remove',
  category: ArchiveCategory,
  content: string | undefined,
  oldText: string | undefined,
  limit: number,
): ArchiveOutcome {
  const outcome = applyMutation(doc[category], action, content, oldText, Number.POSITIVE_INFINITY)
  if (!outcome.ok) return { ok: false, doc, message: outcome.message }
  const next: ArchiveDocument = { ...doc, [category]: outcome.facts }
  const size = charCount(renderArchive(next))
  if (size > limit) {
    return { ok: false, doc, message: 'archive over limit: ' + size + ' > ' + limit + ' chars; remove stale facts first' }
  }
  return { ok: true, doc: next, message: outcome.message }
}

/** One keyword hit inside an archive document. */
export interface RecallHit {
  readonly category: ArchiveCategory | undefined
  readonly line: number
  readonly text: string
}

/** Case-insensitive substring search over archive text, tagging each hit's section. */
export function searchArchive(text: string, query: string): RecallHit[] {
  const q = query.trim().toLowerCase()
  const hits: RecallHit[] = []
  let current: ArchiveCategory | undefined
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      current = headingToCategory(trimmed)
      continue
    }
    if (trimmed.length === 0) continue
    if (q.length > 0 && trimmed.toLowerCase().includes(q)) {
      hits.push({ category: current, line: i + 1, text: trimmed })
    }
  }
  return hits
}
