import { assertNever } from '@deepseek-ai/dsh-llm'

/** Trailing fact separator; the file holds one fact per line, each ending in \`§\`. */
export const FACT_SEPARATOR = '§'

/** Count Unicode code points so a CJK fact is not over-counted as UTF-16 units or bytes. */
export function charCount(text: string): number {
  return [...text].length
}

/** Normalize one fact to a single line ending in the separator. */
export function normalizeFact(content: string): string {
  const trimmed = content.trim()
  return trimmed.endsWith(FACT_SEPARATOR) ? trimmed : trimmed + ' ' + FACT_SEPARATOR
}

/** Split file content into non-empty fact lines (surrounding whitespace dropped). */
export function parseFacts(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
}

/** Render facts back to file text with a single trailing newline. */
export function renderFacts(facts: readonly string[]): string {
  return facts.length === 0 ? '' : facts.join('\n') + '\n'
}

/** Outcome of applying one mutation to a fact list. */
export interface MutationOutcome {
  /** Whether the mutation produced a new fact list to persist. */
  readonly ok: boolean
  /** New fact list; equal to the input when \`ok\` is false. */
  readonly facts: string[]
  /** Model-facing description of what happened (or why not). */
  readonly message: string
}

/** Apply one add/replace/remove to a fact list, enforcing the hard char cap. */
export function applyMutation(
  facts: readonly string[],
  action: 'add' | 'replace' | 'remove',
  content: string | undefined,
  oldText: string | undefined,
  limit: number,
): MutationOutcome {
  switch (action) {
    case 'add': {
      if (content === undefined || content.trim().length === 0) {
        return { ok: false, facts: [...facts], message: 'add requires non-empty content' }
      }
      const next = [...facts, normalizeFact(content)]
      const size = charCount(renderFacts(next))
      if (size > limit) {
        return { ok: false, facts: [...facts], message: 'over limit: ' + size + ' > ' + limit + ' chars; consolidate existing facts first' }
      }
      return { ok: true, facts: next, message: 'added ' + charCount(normalizeFact(content)) + ' chars' }
    }
    case 'replace': {
      if (content === undefined || content.trim().length === 0) {
        return { ok: false, facts: [...facts], message: 'replace requires non-empty content' }
      }
      if (oldText === undefined || oldText.trim().length === 0) {
        return { ok: false, facts: [...facts], message: 'replace requires non-empty old_text' }
      }
      const matches = facts.filter((fact) => fact.includes(oldText))
      if (matches.length === 0) return { ok: false, facts: [...facts], message: 'no fact contains "' + oldText + '"' }
      if (matches.length > 1) return { ok: false, facts: [...facts], message: 'ambiguous: ' + matches.length + ' facts match "' + oldText + '"; narrow old_text' }
      const next = facts.map((fact) => (fact === matches[0] ? normalizeFact(content) : fact))
      const size = charCount(renderFacts(next))
      if (size > limit) return { ok: false, facts: [...facts], message: 'over limit after replace (' + size + ' > ' + limit + ' chars)' }
      return { ok: true, facts: next, message: 'replaced' }
    }
    case 'remove': {
      if (oldText === undefined || oldText.trim().length === 0) {
        return { ok: false, facts: [...facts], message: 'remove requires non-empty old_text' }
      }
      const matches = facts.filter((fact) => fact.includes(oldText))
      if (matches.length === 0) return { ok: false, facts: [...facts], message: 'no fact contains "' + oldText + '"' }
      if (matches.length > 1) return { ok: false, facts: [...facts], message: 'ambiguous: ' + matches.length + ' facts match "' + oldText + '"; narrow old_text' }
      const next = facts.filter((fact) => fact !== matches[0])
      return { ok: true, facts: next, message: 'removed' }
    }
    default:
      return assertNever(action)
  }
}
