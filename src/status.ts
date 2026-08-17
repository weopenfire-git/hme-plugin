/** A point-in-time snapshot of the memory system, rendered by {@link renderStatus}. */
export interface StatusReport {
  readonly version: string
  readonly memoryCharLimit: number
  readonly userCharLimit: number
  readonly archiveCharLimit: number
  readonly userMemoryFile: string
  readonly workspaceMemoryFile: string
  readonly archiveDirectory: string
  /** Character count of the global USER.md (0 when absent or unreadable). */
  readonly userChars: number
  /** Character count of the workspace MEMORY.md, or null without a workspace root. */
  readonly memoryChars: number | null
  /** Number of topic files in the archive directory (excludes INDEX.md). */
  readonly topicCount: number
  /** Total archive entries across all topic files. */
  readonly entryCount: number
  readonly rules: { readonly v1Ttl: string; readonly v2Ttl: string; readonly v3Ttl: string }
}

/** Inner content width in terminal cells (borders add two more columns). */
const INNER = 56

/** Approximate terminal cell width; exact for ASCII, best-effort for wide glyphs. */
function cells(text: string): number {
  return [...text].length
}

/** Left-align text to a fixed cell width. */
function pad(text: string, width: number): string {
  const extra = width - cells(text)
  return extra > 0 ? text + ' '.repeat(extra) : text
}

/** Truncate text to a maximum cell width, appending an ellipsis. */
function clip(text: string, max: number): string {
  if (cells(text) <= max) return text
  return [...text].slice(0, Math.max(0, max - 3)).join('') + '...'
}

/** One label left-aligned with its value right-aligned, rendered as a full bordered row. */
function kv(label: string, value: string): string {
  const left = '  ' + label
  const gap = Math.max(1, INNER - cells(left) - cells(value))
  return '│ ' + left + ' '.repeat(gap) + value + ' │'
}

/**
 * Render a status dashboard as box-drawing text. Pure and deterministic so
 * the startup banner and the hme-status tool share the exact same layout.
 */
export function renderStatus(report: StatusReport): string {
  const bar = '─'.repeat(INNER + 2)
  const top = '╭' + bar + '╮'
  const mid = '├' + bar + '┤'
  const bottom = '╰' + bar + '╯'
  const row = (s: string) => '│ ' + pad(s, INNER) + ' │'
  const blank = row('')
  const memoryChars = report.memoryChars === null ? '--' : String(report.memoryChars)
  const rules = 'V1 ' + report.rules.v1Ttl + ' · V2 ' + report.rules.v2Ttl + ' · V3 ' + report.rules.v3Ttl

  const lines = [
    top,
    blank,
    kv('HME · Harness-Memory-Evolution', 'v' + report.version),
    row('Give your DeepSeek a mind of its own.'),
    blank,
    mid,
    row('core memory'),
    kv('USER.md', report.userChars + ' / ' + report.userCharLimit + ' chars'),
    row('  ' + clip(report.userMemoryFile, 46)),
    kv('MEMORY.md', memoryChars + ' / ' + report.memoryCharLimit + ' chars'),
    row('  ' + clip(report.workspaceMemoryFile, 46)),
    row('archive'),
    kv('dir', clip(report.archiveDirectory, 44)),
    kv('entries', report.entryCount + ' across ' + report.topicCount + ' topics'),
    row('rules'),
    row('  ' + rules),
    bottom,
  ]
  return lines.join('\n')
}
