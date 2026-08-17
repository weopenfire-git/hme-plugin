import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { Config } from './config.ts'
import { injectMemoryContext } from './memory/injector.ts'
import { archiveTool } from './memory/archive-tool.ts'
import { recallTool } from './memory/recall-tool.ts'
import { statusTool } from './memory/status-tool.ts'
import { MemoryStore } from './memory/store.ts'
import { memoryTool } from './memory/tool.ts'
import { renderStatus } from './status.ts'

export const name = 'hme-plugin'
export const inject = ['systemPrompt', 'tools']

export { Config }

/** Minimal structural view of the optional dsh-commands registry (no hard dependency). */
interface StatusCommandRuntime {
  register(def: {
    name: string
    description: string
    recordInput?: boolean
    handler: (inv: { agent: Agent }) => { kind: 'success'; text?: string } | { kind: 'error'; text: string }
  }): () => void
}

/** Register the optional /hme-status slash command when the commands service is mounted. */
function registerStatusCommand(ctx: Context, store: MemoryStore): void {
  const commands = ctx.get('commands') as StatusCommandRuntime | undefined
  if (commands === undefined) return
  commands.register({
    name: 'hme-status',
    description: 'Show the HME memory system status dashboard.',
    recordInput: false,
    handler: ({ agent }) => ({
      kind: 'success',
      text: renderStatus(store.status(agent.session.header.cwd)),
    }),
  })
}

/**
 * HME plugin: a memory tool plus two frozen per-session context blocks over
 * USER.md (global) and MEMORY.md (per-workspace), plus an archive overflow
 * layer with archive / recall tools, plus the v0.5 status dashboard (banner,
 * hme-status tool, and optional /hme-status command).
 */
export function apply(ctx: Context, config: Config): void {
  const store = new MemoryStore(config)
  injectMemoryContext(ctx, store)
  ctx.tools.register(memoryTool(store))
  ctx.tools.register(archiveTool(store))
  ctx.tools.register(recallTool(store))
  if (config.enableStatus) {
    ctx.tools.register(statusTool(store))
    registerStatusCommand(ctx, store)
  }
  if (config.enableBanner) {
    console.log(renderStatus(store.status(undefined)))
  }
  ctx.on('agent/session-start', (payload) => {
    const agent: Agent = payload.agent
    const scope = scopeOf(agent.ctx)
    if (scope !== undefined) store.freeze(scope, agent.session.header.cwd)
  })
  ctx.on('agent/disposed', (payload) => {
    const agent: Agent = payload.agent
    const scope = scopeOf(agent.ctx)
    if (scope !== undefined) store.unfreeze(scope)
  })
}
