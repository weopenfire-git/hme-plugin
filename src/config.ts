import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'

const DEFAULT_WORKSPACE_MEMORY_FILE = '.dsh/hme/MEMORY.md'
const DEFAULT_ARCHIVE_FILE = '.dsh/hme/archive.md'

/**
 * HME plugin configuration. Phase 1 ships the core memory layer; Phase 1.5
 * adds the archive overflow layer.
 *
 * Core caps are the φ Fibonacci hard character limits (MEMORY.md = F₁₈ = 2584,
 * USER.md = F₁₇ = 1597). The archive cap is a large soft limit (2¹⁷ ≈ 128K
 * chars, about one full context window). Writes are rejected over the cap,
 * never truncated.
 */
export interface Config {
  /** Hard character cap for MEMORY.md (F₁₈). */
  memoryCharLimit: number
  /** Hard character cap for USER.md (F₁₇). */
  userCharLimit: number
  /** Absolute path of the global USER.md. */
  userMemoryFile: string
  /** Workspace-relative path of MEMORY.md. */
  workspaceMemoryFile: string
  /** Soft character cap for the workspace archive.md. */
  archiveCharLimit: number
  /** Workspace-relative path of archive.md. */
  archiveMemoryFile: string
}

export const Config: z<Config> = z.object({
  memoryCharLimit: z.number().step(1).min(1).default(2584),
  userCharLimit: z.number().step(1).min(1).default(1597),
  userMemoryFile: z.string().default(dshHomePath('hme', 'USER.md')),
  workspaceMemoryFile: z.string().default(DEFAULT_WORKSPACE_MEMORY_FILE),
  archiveCharLimit: z.number().step(1).min(1).default(131072),
  archiveMemoryFile: z.string().default(DEFAULT_ARCHIVE_FILE),
})
