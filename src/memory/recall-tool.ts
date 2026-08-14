import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { MemoryStore } from './store.ts'

/** Register the recall tool bound to one store. */
export function recallTool(store: MemoryStore) {
  return defineTool({
    name: 'recall',
    description:
      'Search the workspace archive for previously stored facts, methods, or lessons by keyword. Use before redoing work or when a detail is not in core memory.',
    parameters: {
      query: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const workspaceRoot = exec.agent?.session.header.cwd
      return store.recall(args.query, workspaceRoot)
    },
  })
}
