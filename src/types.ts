import type { ScopeKey } from '@deepseek-ai/dsh-scope'

/** Which memory file a mutation or snapshot targets. */
export type MemoryTarget = 'user' | 'memory'

/** Mutation action the memory tool performs. */
export type MemoryAction = 'add' | 'replace' | 'remove'

/** One of the four archive sections. */
export type ArchiveCategory = 'facts' | 'preferences' | 'methods' | 'lessons'

/** Action the archive tool performs (move relocates a core fact). */
export type ArchiveToolAction = 'add' | 'replace' | 'remove' | 'move'

/** A normalized archive topic tag (lowercase, kebab-case). */
export type ArchiveTag = string

/** One per-scope frozen snapshot of both memory files, taken at session start. */
export interface FrozenSnapshot {
  /** Global USER.md content, frozen. */
  readonly user: string
  /** Workspace MEMORY.md content, frozen. */
  readonly memory: string
}
