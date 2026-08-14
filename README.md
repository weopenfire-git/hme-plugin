# HME — 给 DeepSeek 装上大脑

DeepSeek Harness 很强，但有个硬伤：**会话结束，记忆清零** ，下次从头再来。

HME（Harness-Memory-Evolution）就是来治这个的。

## 鲸宝的三重记忆

1. **你是谁** —— 你的身份、偏好、习惯，跨项目记住你这个人。
2. **这个项目是什么** —— 每个项目不可替代的技术栈、约定、核心要点。
3. **你踩过的所有坑** —— 优秀经验、核心方法论，只要真有用，就往里记。

但它不臃肿。核心记忆用有界上限锁死、只留精华；海量经验沉进档案层，按需检索、满时提醒清理——就像 CPU 的多级缓存：**小而快的常驻，大而全的按需取**。

借鉴 Codex、Claude Code、OpenClaw、Hermes Agent 等成熟记忆系统的优点，让鲸宝**不会失忆，也不会被杂事烦扰**。

## 和别家比有什么不同？

| 维度 | Codex CLI | Claude Code | OpenClaw | **HME** |
|---|---|---|---|---|
| 记忆结构 | MEMORY + USER 两文件 | CLAUDE.md + skills | 分层记忆 | USER + MEMORY + archive 三层 |
| 防膨胀 | 硬上限（拒绝式） | 无上限 | 向量库 | **有界 core + 扩容 archive** |
| 检索 | 无（全量注入） | skills 按需 | 向量检索 | recall 关键词检索 |
| 经验进去 | 模型主动写 | 人类手写 | 自动 | **模型主动写 + 4 条蒸馏判据** |
| 可审计 | 纯文本 | 纯文本 | 结构化/黑盒 | **纯文本 § 分隔** |

## 30 秒装上

**从 GitHub 装（推荐，立即可用）：**

```sh
dsh plugin --profile web add github:weopenfire-git/hme-plugin
```

**或从 npm 装（发布后可用）：**

```sh
dsh plugin --profile web add @ymw/dsh-hme
```

### 然后补一行加载配置

打开 profile 的 \`cordis.patch.yml\`，加一条 host 行：

```yaml
- insert:
    - id: hme-plugin
      name: '@ymw/dsh-hme'  # npm 装用包名；GitHub 装改为 github:weopenfire-git/hme-plugin
      config:
        memoryCharLimit: 2584
        userCharLimit: 1597
```

给你的 DeepSeek 装上大脑。

---

# hme-plugin — Harness-Memory-Evolution

*Give your DeepSeek a mind of its own.*

DeepSeek Harness is formidable — yet it harbors one flaw: **the moment a session ends, the memory resets.** Preferences, conventions, hard-won lessons all evaporate, and the next session starts from blank.

Enter HME (Harness-Memory-Evolution).

## The Whale's Threefold Memory

1. **Who you are** — your identity, your preferences, your habits, remembered across every project.
2. **What this project is** — the irreplaceable tech stack, conventions, and core points of each workspace.
3. **The pits you've fallen into** — proven lessons and core methodology; anything genuinely useful, commit to memory.

Yet it never grows bloated. Core memory is sealed by bounded caps to keep only the essence; the flood of experience sinks into an archive tier, retrieved on demand and pruned by suggestion when full — like a CPU's multi-level cache: **the small and fast stay resident, the vast stay within reach.**

Drawing on the strengths of Codex, Claude Code, OpenClaw, and Hermes Agent, HME lets your whale **never forget — and never be distracted by trivia.**

## How it stacks up

| Dimension | Codex CLI | Claude Code | OpenClaw | **HME** |
|---|---|---|---|---|
| Memory shape | MEMORY + USER two files | CLAUDE.md + skills | layered memory | USER + MEMORY + archive three-tier |
| Against bloat | hard cap (reject) | unbounded | vector store | **bounded core + elastic archive** |
| Retrieval | none (full injection) | skills on demand | vector search | recall keyword search |
| Expertise in | model writes manually | human hand-writes | automatic | **model writes + 4 distillation criteria** |
| Auditability | plain text | plain text | structured / black-box | **plain text §-delimited** |

## Install in 30 seconds

**From GitHub (recommended, works right now):**

```sh
dsh plugin --profile web add github:weopenfire-git/hme-plugin
```

**Or from npm (once released):**

```sh
dsh plugin --profile web add @ymw/dsh-hme
```

### Then add one loader row

Open the profile's `cordis.patch.yml` and add a host row:

```yaml
- insert:
    - id: hme-plugin
      name: '@ymw/dsh-hme'  # package name for npm; use github:weopenfire-git/hme-plugin for GitHub
      config:
        memoryCharLimit: 2584
        userCharLimit: 1597
```

Give your DeepSeek a mind of its own.

---

# Technical reference

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
