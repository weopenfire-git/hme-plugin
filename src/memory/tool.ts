import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { MemoryStore } from './store.ts'

/** Register the \`memory\` tool bound to one store. */
export function memoryTool(store: MemoryStore) {
  return defineTool({
    name: 'memory',
    description:
      'Persist or edit a durable fact across sessions. target selects the file: user is the global user profile, memory is per-workspace project facts. One fact per line, §-terminated. Files have a hard character cap; over-cap writes are rejected rather than truncated, so consolidate existing facts first. Facts are injected at the next session start, not the current one.',
    parameters: {
      action: { type: 'string', enum: ['add', 'replace', 'remove'], required: true },
      target: { type: 'string', enum: ['memory', 'user'], required: true },
      content: { type: 'string' },
      old_text: { type: 'string' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const workspaceRoot = exec.agent?.session.header.cwd
      return store.mutate(args.target, args.action, args.content, args.old_text, workspaceRoot)
    },
  })
}
