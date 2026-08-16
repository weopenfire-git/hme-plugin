import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { MemoryStore } from './store.ts'

/** Register the archive tool bound to one store. */
export function archiveTool(store: MemoryStore) {
  return defineTool({
    name: 'archive',
    description:
      'Store durable project knowledge in the workspace archive, the larger overflow layer for what does not fit in core memory. Each entry carries 1-3 topic tags (#tag); writing with a tag that already exists replaces (overwrites) the old entry for that tag, keeping archives from bloating. Before adding, ask four questions: will a later session need this? can it be looked up from files/code/docs (if so store only the conclusion)? is it a method or principle rather than a one-off instance (store the former)? will it go stale soon? Use action move to relocate a core fact into the archive under a tag.',
    parameters: {
      action: { type: 'string', enum: ['add', 'replace', 'remove', 'move'], required: true },
      tag: { type: 'string' },
      content: { type: 'string' },
      old_text: { type: 'string' },
      value: { type: 'integer', enum: [1, 2, 3] },
      ttl: { type: 'string' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const workspaceRoot = exec.agent?.session.header.cwd
      if (args.action === 'move') {
        return store.moveFromCore(args.old_text, args.tag, workspaceRoot)
      }
      if (args.action === 'remove') {
        // remove is not yet implemented in the tagged model; support via recall+manual
        return 'remove is not supported in the tagged archive yet; overwrite via add with same tag'
      }
      const tag = args.tag
      if (!tag) return 'archive add requires a tag'
      return store.mutateTopic([tag], args.content, workspaceRoot, args.value, args.ttl)
    },
  })
}