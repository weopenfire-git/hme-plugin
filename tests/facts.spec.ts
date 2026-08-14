import { describe, expect, it } from 'vitest'
import { applyMutation, charCount, normalizeFact, parseFacts, renderFacts } from '../src/memory/facts.ts'

describe('normalizeFact', () => {
  it('appends the separator when missing', () => {
    expect(normalizeFact('user prefers tabs')).toBe('user prefers tabs §')
  })
  it('keeps an existing separator', () => {
    expect(normalizeFact('user prefers tabs §')).toBe('user prefers tabs §')
  })
})

describe('charCount', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(charCount('中文记忆')).toBe(4)
    expect(charCount('😀')).toBe(1)
  })
})

describe('parseFacts and renderFacts', () => {
  it('round-trip facts and drop blank lines', () => {
    expect(parseFacts('a §\n\nb §\n')).toEqual(['a §', 'b §'])
    expect(renderFacts(['a §', 'b §'])).toBe('a §\nb §\n')
  })
})

describe('applyMutation', () => {
  const facts = ['project uses Axum §', 'api keys in ~/.env §']

  it('add appends a normalized fact', () => {
    const out = applyMutation(facts, 'add', 'deploy on Friday', undefined, 1000)
    expect(out.ok).toBe(true)
    expect(out.facts).toEqual(['project uses Axum §', 'api keys in ~/.env §', 'deploy on Friday §'])
  })

  it('add rejects over the hard cap without mutating', () => {
    const out = applyMutation(facts, 'add', 'a fact that is far too long for twenty chars', undefined, 20)
    expect(out.ok).toBe(false)
    expect(out.facts).toEqual(facts)
    expect(out.message).toContain('over limit')
  })

  it('replace swaps the single matching fact', () => {
    const out = applyMutation(facts, 'replace', 'project uses Tokio §', 'Axum', 1000)
    expect(out.ok).toBe(true)
    expect(out.facts).toEqual(['project uses Tokio §', 'api keys in ~/.env §'])
  })

  it('replace reports ambiguity when several facts match', () => {
    const dup = ['project uses Axum §', 'api keys in ~/.env §', 'project uses Axum again §']
    const out = applyMutation(dup, 'replace', 'x §', 'Axum', 1000)
    expect(out.ok).toBe(false)
    expect(out.message).toContain('ambiguous')
  })

  it('remove deletes the single matching fact', () => {
    const out = applyMutation(facts, 'remove', undefined, 'Axum', 1000)
    expect(out.ok).toBe(true)
    expect(out.facts).toEqual(['api keys in ~/.env §'])
  })

  it('remove reports a missing fact', () => {
    const out = applyMutation(facts, 'remove', undefined, 'does not exist', 1000)
    expect(out.ok).toBe(false)
    expect(out.message).toContain('no fact')
  })
})
