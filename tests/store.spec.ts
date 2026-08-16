import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    archiveDirectory: '.dsh/hme/archive',
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

  it('mutateTopic writes a tagged entry into a topic file', () => {
    const store = new MemoryStore(makeConfig())
    const message = store.mutateTopic(['migration'], 'uses Axum', dir)
    expect(message).toContain('added')
    expect(readFileSync(join(dir, '.dsh', 'hme', 'archive', 'migration.md'), 'utf8')).toContain('[#migration] uses Axum')
  })

  it('mutateTopic overwrites when the tag already exists', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateTopic(['build'], 'old build note', dir)
    const message = store.mutateTopic(['build'], 'new build note §', dir)
    expect(message).toContain('replaced')
    const content = readFileSync(join(dir, '.dsh', 'hme', 'archive', 'build.md'), 'utf8')
    expect(content).toContain('new build note')
    expect(content).not.toContain('old build note')
  })

  it('migrates legacy archive.md into topic files', () => {
    mkdirSync(join(dir, '.dsh', 'hme'), { recursive: true })
    writeFileSync(join(dir, '.dsh', 'hme', 'archive.md'), '## Facts\nuses Axum §\n')
    const store = new MemoryStore(makeConfig())
    store.ensureMigrated(dir)
    expect(readFileSync(join(dir, '.dsh', 'hme', 'archive', 'uses.md'), 'utf8')).toContain('uses Axum')
    expect(readFileSync(join(dir, '.dsh', 'hme', 'archive.md'), 'utf8')).toBe('')
  })

  it('moveFromCore relocates a core fact into the archive under a tag', () => {
    const store = new MemoryStore(makeConfig())
    store.mutate('memory', 'add', 'migrate with sqlx §', undefined, dir)
    const message = store.moveFromCore('sqlx', 'migration', dir)
    expect(message).toContain('moved')
    expect(readFileSync(join(dir, '.dsh', 'hme', 'MEMORY.md'), 'utf8')).toBe('')
    expect(readFileSync(join(dir, '.dsh', 'hme', 'archive', 'migration.md'), 'utf8')).toContain('migrate with sqlx')
  })

  it('recall finds a keyword across topic files', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateTopic(['build'], 'SQLx migration error', dir)
    const result = store.recall('sqlx', dir)
    expect(result).toContain('[build]')
  })

  it('recall reports no match', () => {
    const store = new MemoryStore(makeConfig())
    expect(store.recall('zzz', dir)).toContain('no archive facts match')
  })

  it('recall bumps usage and returns hits', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateTopic(['axum'], 'uses Axum', dir)
    const result = store.recall('axum', dir)
    expect(result).toContain('[axum]')
  })

  it('suggestEvictions ranks least-used entries', async () => {
    const store = new MemoryStore(makeConfig())
    store.mutateTopic(['a'], 'aaa', dir)
    store.mutateTopic(['b'], 'bbb', dir)
    const suggestion = await store.suggestEvictions(dir)
    expect(suggestion).toContain('candidates')
  })

  it('value tier 2 applies a TTL expiry marker', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateTopic(['method'], 'build steps', dir, 2)
    const content = readFileSync(join(dir, '.dsh', 'hme', 'archive', 'method.md'), 'utf8')
    expect(content).toContain('[v:2]')
    expect(content).toMatch(/\[expires:\d+\]/)
  })

  it('no value means no expiry marker', () => {
    const store = new MemoryStore(makeConfig())
    store.mutateTopic(['plain'], 'a plain note', dir)
    const content = readFileSync(join(dir, '.dsh', 'hme', 'archive', 'plain.md'), 'utf8')
    expect(content).not.toContain('expires')
    expect(content).not.toContain('[v:')
  })
})