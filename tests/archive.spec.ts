import { describe, expect, it } from 'vitest'
import { mutateArchive, parseArchive, renderArchive, searchArchive } from '../src/memory/archive.ts'

describe('parseArchive / renderArchive', () => {
  it('round-trips sections', () => {
    const text = '## Facts\nuses Axum §\n\n## Lessons\nhad a SQLx error §\n'
    const doc = parseArchive(text)
    expect(doc.facts).toEqual(['uses Axum §'])
    expect(doc.lessons).toEqual(['had a SQLx error §'])
    expect(renderArchive(doc)).toBe(text)
  })

  it('drops facts before any heading and under unknown headings', () => {
    const text = 'orphan §\n## Unknown\nnoise §\n## Facts\nreal §\n'
    const doc = parseArchive(text)
    expect(doc.facts).toEqual(['real §'])
    expect(doc.preferences).toEqual([])
  })
})

describe('mutateArchive', () => {
  const doc = parseArchive('## Facts\na §\n\n## Methods\nm §\n')

  it('adds to a section', () => {
    const out = mutateArchive(doc, 'add', 'facts', 'b', undefined, 100000)
    expect(out.ok).toBe(true)
    expect(out.doc.facts).toEqual(['a §', 'b §'])
  })

  it('enforces the whole-document cap', () => {
    const out = mutateArchive(doc, 'add', 'facts', 'a very long fact that exceeds the cap', undefined, 30)
    expect(out.ok).toBe(false)
    expect(out.message).toContain('archive over limit')
    expect(out.doc).toEqual(doc)
  })

  it('removes from a section', () => {
    const out = mutateArchive(doc, 'remove', 'facts', undefined, 'a', 100000)
    expect(out.ok).toBe(true)
    expect(out.doc.facts).toEqual([])
  })
})

describe('searchArchive', () => {
  it('finds hits with their section tag', () => {
    const text = '## Facts\nuses Axum §\n\n## Lessons\nSQLx migration error §\n'
    const hits = searchArchive(text, 'axum')
    expect(hits.length).toBe(1)
    expect(hits[0]?.category).toBe('facts')
    expect(hits[0]?.text).toBe('uses Axum §')
  })

  it('returns empty for no match and for blank query', () => {
    expect(searchArchive('## Facts\na §\n', 'zzz')).toEqual([])
    expect(searchArchive('## Facts\na §\n', '  ')).toEqual([])
  })
})
