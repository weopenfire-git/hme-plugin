import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import { MemoryStore } from '../src/memory/store.ts'

let dir: string

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    memoryCharLimit: 2584,
    userCharLimit: 1597,
    userMemoryFile: join(dir, 'USER.md'),
    workspaceMemoryFile: '.dsh/hme/MEMORY.md',
    archiveCharLimit: 131072,
    archiveMemoryFile: '.dsh/hme/archive.md',
    ...overrides,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hme-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('MemoryStore', () => {
  it('freeze captures both files, unfreeze clears', () => {
    writeFileSync(join(dir, 'USER.md'), 'likes §\n')
    const store = new MemoryStore(makeConfig())
    const scope: ScopeKey = {}
    store.freeze(scope, dir)
    expect(store.snapshotFor(scope, 'user')).toContain('likes §')
    expect(store.snapshotFor(scope, 'memory')).toBe('')
    store.unfreeze(scope)
    expect(store.snapshotFor(scope, 'user')).toBe('')
  })

  it('snapshotFor is empty for an unknown scope', () => {
    const store = new MemoryStore(makeConfig())
    expect(store.snapshotFor({}, 'user')).toBe('')
  })

  it('mutate add persists and reappears on the next freeze', () => {
    const store = new MemoryStore(makeConfig())
    const message = store.mutate('user', 'add', 'prefers tabs', undefined, dir)
    expect(message).toContain('added')
    expect(readFileSync(join(dir, 'USER.md'), 'utf8')).toBe('prefers tabs §\n')
    const scope: ScopeKey = {}
    store.freeze(scope, dir)
    expect(store.snapshotFor(scope, 'user')).toContain('prefers tabs §')
  })

  it('mutate over limit leaves the file unchanged', () => {
    writeFileSync(join(dir, 'USER.md'), 'existing §\n')
    const store = new MemoryStore(makeConfig({ userCharLimit: 15 }))
    const message = store.mutate('user', 'add', 'a fact much longer than fifteen chars', undefined, dir)
    expect(message).toContain('over limit')
    expect(readFileSync(join(dir, 'USER.md'), 'utf8')).toBe('existing §\n')
  })

  it('workspace memory lands under the session workspace root', () => {
    const store = new MemoryStore(makeConfig())
    store.mutate('memory', 'add', 'project uses Rust §', undefined, dir)
    expect(readFileSync(join(dir, '.dsh', 'hme', 'MEMORY.md'), 'utf8')).toBe('project uses Rust §\n')
  })

  it('mutateArchive adds to a section and renders headings', () => {
    const store = new MemoryStore(makeConfig())
    const message = store.mutateArchive('facts', 'add', 'uses Axum', undefined, dir)
    expect(message).toContain('added')
    expect(readFileSync(join(dir, '.dsh', 'hme', 'archive.md'), 'utf8')).toBe('## Facts\nuses Axum §\n')
  })

  it('moveFromCore relocates a core fact into archive', () => {
    const store = new MemoryStore(makeConfig())
    store.mutate('memory', 'add', 'migrate with sqlx §', undefined, dir)
    const message = store.moveFromCore('sqlx', 'methods', dir)
    expect(message).toContain('moved')
    expect(readFileSync(join(dir, '.dsh', 'hme', 'MEMORY.md'), 'utf8')).toBe('')
    const archive = readFileSync(join(dir, '.dsh', 'hme', 'archive.md'), 'utf8')
    expect(archive).toContain('## Methods')
    expect(archive).toContain('migrate with sqlx §')
  })

  it('recall finds a keyword with its section', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateArchive('lessons', 'add', 'SQLx migration error', undefined, dir)
    const result = store.recall('sqlx', dir)
    expect(result).toContain('[lessons]')
    expect(result).toContain('SQLx migration error §')
  })

  it('recall reports no match', () => {
    const store = new MemoryStore(makeConfig())
    expect(store.recall('zzz', dir)).toContain('no archive facts match')
  })

  it('recall bumps per-fact usage metadata', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateArchive('facts', 'add', 'uses Axum', undefined, dir)
    store.recall('axum', dir)
    store.recall('axum', dir)
    const meta = JSON.parse(readFileSync(join(dir, '.dsh', 'hme', 'archive.meta.json'), 'utf8'))
    expect(meta['uses Axum §'].uses).toBe(2)
  })

  it('mutateArchive over limit suggests least-used evictions', () => {
    const store = new MemoryStore(makeConfig({ archiveCharLimit: 40 }))
    store.mutateArchive('facts', 'add', 'aaa', undefined, dir)
    store.mutateArchive('facts', 'add', 'bbb', undefined, dir)
    const message = store.mutateArchive('facts', 'add', 'a very long third fact that overflows', undefined, dir)
    expect(message).toContain('archive over limit')
    expect(message).toContain('candidates to remove')
  })
})
