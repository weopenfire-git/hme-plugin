import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { Config } from './config.ts'
import { injectMemoryContext } from './memory/injector.ts'
import { archiveTool } from './memory/archive-tool.ts'
import { recallTool } from './memory/recall-tool.ts'
import { MemoryStore } from './memory/store.ts'
import { memoryTool } from './memory/tool.ts'

export const name = 'hme-plugin'
export const inject = ['systemPrompt', 'tools']

export { Config }

/**
 * HME plugin: a memory tool plus two frozen per-session context blocks over
 * USER.md (global) and MEMORY.md (per-workspace), plus an archive overflow
 * layer with archive / recall tools.
 */
export function apply(ctx: Context, config: Config): void {
  const store = new MemoryStore(config)
  injectMemoryContext(ctx, store)
  ctx.tools.register(memoryTool(store))
  ctx.tools.register(archiveTool(store))
  ctx.tools.register(recallTool(store))
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
