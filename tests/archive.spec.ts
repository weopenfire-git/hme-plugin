import { describe, expect, it } from 'vitest'
import {
  applyTaggedWrite, extractTags, normalizeTags, parseIndex, renderIndex,
  renderEntry, searchEntries, stripTags, tagFilename,
} from '../src/memory/archive.ts'

describe('extractTags / stripTags', () => {
  it('extracts leading tags', () => {
    expect(extractTags('[#build] use pnpm run test §')).toEqual(['build'])
    expect(extractTags('[#a][#b] needs run §')).toEqual(['a', 'b'])
  })
  it('strips tags to the fact body', () => {
    expect(stripTags('[#build] use pnpm run test §')).toBe('use pnpm run test §')
  })
})

describe('normalizeTags', () => {
  it('lowercases, cleans, and caps at 3', () => {
    expect(normalizeTags(['Build', ' migration!! '])).toEqual(['build', 'migration'])
    expect(normalizeTags(['a', 'b', 'c', 'd']).length).toBe(3)
  })
})

describe('renderEntry', () => {
  it('prepends tags and normalizes terminator', () => {
    expect(renderEntry(['build'], 'use pnpm test')).toBe('[#build] use pnpm test §')
  })
})

describe('applyTaggedWrite', () => {
  it('appends on new tag', () => {
    const out = applyTaggedWrite([], ['build'], 'use pnpm test')
    expect(out.added).toBe(true)
    expect(out.replaced).toBe(false)
    expect(out.entries).toEqual(['[#build] use pnpm test §'])
  })
  it('replaces on existing tag', () => {
    const out = applyTaggedWrite(['[#build] old note §'], ['build'], 'new note')
    expect(out.replaced).toBe(true)
    expect(out.entries).toEqual(['[#build] new note §'])
  })
  it('dedupes exact body on tagless write', () => {
    const out = applyTaggedWrite(['no tag note §'], [], 'no tag note')
    expect(out.added).toBe(false)
  })
})

describe('tagFilename', () => {
  it('returns kebab with extension', () => {
    expect(tagFilename('build')).toBe('build.md')
  })
})

describe('INDEX', () => {
  it('round-trips index', () => {
    const index = { entries: { build: { filename: 'build.md', lastUpdated: 'x' } } }
    const text = renderIndex(index)
    expect(parseIndex(text).entries['build']?.filename).toBe('build.md')
  })
})

describe('searchEntries', () => {
  it('finds hits and tags', () => {
    const hits = searchEntries('build.md', ['[#build] use pnpm test §'], 'pnpm')
    expect(hits.length).toBe(1)
    expect(hits[0]?.tags).toEqual(['build'])
    expect(hits[0]?.text).toContain('use pnpm test')
  })
})