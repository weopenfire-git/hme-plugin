# HME — 给 DeepSeek 装上大脑

> 别人家的 AI 每次对话都失忆，你的它，什么都记得。

## 你大概率也被这事逼疯过

你跟 AI 磨了半小时：定好命名规范、敲定技术选型、复盘了三个血泪坑。

第二天打开，它一脸无辜地问："请问这个项目用什么框架？"

那一刻，你想砸键盘。

DeepSeek Harness 很强，但有个硬伤：**会话一结束，记忆清零。** 偏好、约定、教训全部蒸发，下次从头再来。

HME（Harness-Memory-Evolution）就是来治这个的。

## 它凭什么不一样

**别的 agent 记「过程」，HME 记「经验」。**

- 不把代码、日志、对话原文一股脑塞进去——那叫备份，不叫记忆
- 只蒸馏三条：**怎么做的、为什么、坑在哪**

就像人脑记得「红灯停」，而不是记下每次过马路的录像。

## 三个硬核优势

**① 有界，不膨胀**
核心记忆用 φ 斐波那契上限（1597 / 2584 字符）。超了拒绝写入、绝不截断——记忆永远精炼，不会被垃圾淹没。

**② 无界，不丢失**
档案记忆约一个上下文窗口（128K）。装不下的方法、教训、细节统统下沉，`recall` 关键词一搜就回来。满的时候按 LRU 提醒该清谁，而不是暴力删。

**③ 可审计，纯文本**
所有记忆都是人类可读的 `.md` 文件，`§` 分隔、记事本就能改。你的记忆你做主，不是锁在模型里的黑盒。

## 装上之后

- 你："这项目用什么框架？" → 它秒答："Vue 3"（注入的记忆，零延迟）
- 你："怎么跑测试？" → 它翻出："pnpm run test"（从 archive 检索）
- 你："上次那个坑怎么解决的？" → 它调出教训，不重蹈覆辙

**对话越久，它越懂你。这才是真正的「越用越强」。**

## 30 秒装上

```sh
dsh plugin --profile web add @yinging/dsh-hme
```

给你的 DeepSeek 装上大脑。

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
