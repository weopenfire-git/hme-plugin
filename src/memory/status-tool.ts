import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { renderStatus } from '../status.ts'
import type { MemoryStore } from './store.ts'

/** Register the hme-status tool bound to one store. */
export function statusTool(store: MemoryStore) {
  return defineTool({
    name: 'hme-status',
    description:
      'Report the HME memory system status: plugin version, core memory file sizes against their caps, archive topic and entry counts, and expiry rules.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      const workspaceRoot = exec.agent?.session.header.cwd
      return renderStatus(store.status(workspaceRoot))
    },
  })
}
