import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import { MemoryStore } from '../src/memory/store.ts'
import { renderStatus } from '../src/status.ts'
import type { StatusReport } from '../src/status.ts'
import { VERSION } from '../src/version.ts'

function makeReport(overrides: Partial<StatusReport> = {}): StatusReport {
  return {
    version: VERSION,
    memoryCharLimit: 2584,
    userCharLimit: 1597,
    archiveCharLimit: 131072,
    userMemoryFile: 'C:\\Users\\demo\\hme\\USER.md',
    workspaceMemoryFile: '.dsh/hme/MEMORY.md',
    archiveDirectory: '.dsh/hme/archive',
    userChars: 12,
    memoryChars: null,
    topicCount: 0,
    entryCount: 0,
    rules: { v1Ttl: 'never', v2Ttl: '365d', v3Ttl: '90d' },
    ...overrides,
  }
}

describe('renderStatus', () => {
  it('shows version and tagline', () => {
    const text = renderStatus(makeReport())
    expect(text).toContain('HME · Harness-Memory-Evolution')
    expect(text).toContain('v' + VERSION)
    expect(text).toContain('Give your DeepSeek a mind of its own.')
  })

  it('shows core file counts against caps', () => {
    const text = renderStatus(makeReport({ userChars: 7, memoryChars: 42 }))
    expect(text).toContain('7 / 1597 chars')
    expect(text).toContain('42 / 2584 chars')
  })

  it('renders a dash for a missing workspace', () => {
    expect(renderStatus(makeReport({ memoryChars: null }))).toContain('-- / 2584 chars')
  })

  it('shows archive counts and rules', () => {
    const text = renderStatus(makeReport({ topicCount: 3, entryCount: 9 }))
    expect(text).toContain('9 across 3 topics')
    expect(text).toContain('V1 never · V2 365d · V3 90d')
  })

  it('clips long paths so every line is the same width', () => {
    const long = 'C:\\very\\long\\' + 'x'.repeat(80) + '\\USER.md'
    const lines = renderStatus(makeReport({ userMemoryFile: long })).split('\n')
    const widths = new Set(lines.map((l) => [...l].length))
    expect(widths.size).toBe(1)
  })
})

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
  dir = mkdtempSync(join(tmpdir(), 'hme-status-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('MemoryStore.status', () => {
  it('counts USER.md chars and reports null memory without a workspace', () => {
    writeFileSync(join(dir, 'USER.md'), 'likes tabs §\n')
    const store = new MemoryStore(makeConfig())
    const report = store.status(undefined)
    expect(report.version).toBe(VERSION)
    expect(report.userChars).toBe('likes tabs §\n'.length)
    expect(report.memoryChars).toBeNull()
  })

  it('counts memory chars and archive topics for a workspace', () => {
    const store = new MemoryStore(makeConfig())
    store.mutate('memory', 'add', 'uses Rust §', undefined, dir)
    store.mutateTopic(['migration'], 'uses Axum', dir)
    store.mutateTopic(['deploy'], 'docker only', dir)
    const report = store.status(dir)
    expect(report.memoryChars).toBe('uses Rust §\n'.length)
    expect(report.topicCount).toBe(2)
    expect(report.entryCount).toBe(2)
  })
})
