# HME — 给 DeepSeek 装上大脑

> **Harness-Memory-Evolution**：让 DeepSeek Harness 的 Agent 拥有跨会话长期记忆。

别的 Agent 每次对话都像失忆——忘了你是谁、项目怎么写的、踩过哪些坑。HME 让它「记得」。

## 它解决什么

DeepSeek Harness 会话一结束，Agent 就清零，下次从头再来。HME 给它两层记忆：

- **核心记忆 core**：小而硬、永远在场。用户画像（`USER.md`，全局）+ 项目事实（`MEMORY.md`，按工作区），每会话自动注入。
- **档案记忆 archive**：大而软、按需检索。方法、教训、细节沉淀到 archive，需要时用 `recall` 查。

## 核心思路

**存方法论，不存原始数据。** 不塞代码、日志、对话原文，而是蒸馏成「怎么做的」「为什么」「坑在哪」——像人脑记经验，不记录像。

- 有界 core：φ 斐波那契上限（1597 / 2584 字符），拒绝式、不截断
- 无界 archive：≈ 一个上下文窗口（128K），满时按 LRU 给出淘汰建议
- 会话启动冻结快照，会话内写入不污染当前上下文
- 全部纯文本、`§` 分隔、人类可读可编辑

## 功能

| 工具 | 作用 |
|---|---|
| `memory` | 读写核心记忆（USER.md / MEMORY.md） |
| `archive` | 写档案（事实/偏好/方法/教训）+ 从 core 降级 |
| `recall` | 按关键词检索档案 |

---

# hme-plugin — Harness-Memory-Evolution

Cross-session long-term memory for DeepSeek Harness, as an out-of-tree plugin. It gives an agent two bounded plain-text memory files plus a `memory` tool, so user preferences and project facts survive across sessions instead of being relearned every time.

> **Status:** Phase 1 + Phase 1.5 — core memory plus the archive overflow layer. Developer preview: the Harness APIs this plugin builds on are still changing. See [DESIGN.md](./DESIGN.md) and [ARCHIVE.md](./ARCHIVE.md).

## What it ships

- A `memory` tool that adds, replaces, and removes durable facts.
- An `archive` tool (add/replace/remove/move) plus a `recall` tool over a larger per-workspace overflow layer.
- Two context blocks, frozen at session start and injected into every turn of that session:
  - `hme:user` — the global user profile.
  - `hme:memory` — the current workspace's project facts.

## Memory files

| File | Location | Hard cap |
|---|---|---|
| `USER.md` | `$DSH_HOME/hme/USER.md` (global, shared across workspaces) | 1,597 chars (F₁₇) |
| `MEMORY.md` | `<workspace>/.dsh/hme/MEMORY.md` (per workspace) | 2,584 chars (F₁₈) |

Facts are one per line, `§`-terminated, and human-editable. Caps count Unicode code points. A write that would exceed the cap is rejected, never truncated. Every write re-reads the latest file and merges at the fact level, so concurrent sessions do not clobber each other's edits.

## Install

Install from npm or Git into a profile, then reference it by package name:

```sh
dsh plugin --profile web add @yinging/dsh-hme
# or from Git: dsh plugin --profile web add github:weopenfire-git/hme-plugin
```

Add a host row to the profile's `cordis.patch.yml` (web, CLI, and headless alike):

```yaml
- id: hme-plugin
  name: '@yinging/dsh-hme'
  config:
    memoryCharLimit: 2584
    userCharLimit: 1597
```

`userMemoryFile` and `workspaceMemoryFile` have sensible defaults; override them to relocate the files.

## The `memory` tool

| Parameter | Type | Required | Meaning |
|---|---|---|---|
| `action` | `add` \| `replace` \| `remove` | yes | Mutation to apply. |
| `target` | `memory` \| `user` | yes | `memory` → workspace `MEMORY.md`; `user` → global `USER.md`. |
| `content` | string | for `add` / `replace` | New fact text. |
| `old_text` | string | for `replace` / `remove` | Substring that locates the fact to change or drop. |

`replace` and `remove` locate a fact by substring; if several facts match, the tool reports ambiguity and asks for a narrower `old_text`. A write never changes the current session's injection — the next session re-reads the files.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `memoryCharLimit` | `2584` | Hard character cap for `MEMORY.md` (F₁₈). |
| `userCharLimit` | `1597` | Hard character cap for `USER.md` (F₁₇). |
| `userMemoryFile` | `<dshHome>/hme/USER.md` | Global user-profile path. |
| `workspaceMemoryFile` | `.dsh/hme/MEMORY.md` | Workspace-relative project-memory path. |
| `archiveCharLimit` | `131072` | Soft character cap for the archive (2¹⁷ ≈ one context window). |
| `archiveMemoryFile` | `.dsh/hme/archive.md` | Workspace-relative archive path. |

## How it works

At `agent/session-start` the plugin freezes both files into a per-scope snapshot, and the two context blocks serve that snapshot for the whole session. Writes go straight to disk with read-merge-write, so the current session's view stays stable while the next session sees the latest facts. Injection uses `systemPrompt.context()`, which records the memory as a persistent user-role snapshot rather than re-reading the files each turn.

## Develop / verify

`hme-plugin` is a pnpm workspace member for dependency resolution only, not a build target. Run `pnpm install` once so its `@deepseek-ai/*` dependencies link, then:

```sh
pnpm exec tsc -p hme-plugin
pnpm exec vitest run --config hme-plugin/vitest.config.ts
```

## Roadmap

- **Phase 1.5** — archive overflow layer (`archive` / `recall` tools); see [ARCHIVE.md](./ARCHIVE.md).
- **Phase 2** — skill evolution: generate, optimize, and curate skills.
- **Phase 3** — reflection and maintenance in background jobs.

## License

[MIT](../LICENSE)
