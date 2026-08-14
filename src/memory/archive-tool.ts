import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { MemoryStore } from './store.ts'

/** Register the archive tool bound to one store. */
export function archiveTool(store: MemoryStore) {
  return defineTool({
    name: 'archive',
    description:
      'Store durable project knowledge in the workspace archive, the larger overflow layer for what does not fit in core memory. Sections: facts (stable facts), preferences (project conventions), methods (how-to steps), lessons (pitfalls: symptom, cause, fix). Before adding, ask: will a later session need this? can it be looked up from files/code/docs (if so store only the conclusion)? is it a method or principle rather than a one-off instance (store the former)? will it go stale soon? Use action move to relocate one fact from core memory into a section when core is full.',
    parameters: {
      action: { type: 'string', enum: ['add', 'replace', 'remove', 'move'], required: true },
      category: { type: 'string', enum: ['facts', 'preferences', 'methods', 'lessons'] },
      content: { type: 'string' },
      old_text: { type: 'string' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const workspaceRoot = exec.agent?.session.header.cwd
      if (args.action === 'move') {
        return store.moveFromCore(args.old_text, args.category, workspaceRoot)
      }
      if (args.category === undefined) {
        return 'category is required for add/replace/remove'
      }
      return store.mutateArchive(args.category, args.action, args.content, args.old_text, workspaceRoot)
    },
  })
}
