# hme-plugin — Harness-Memory-Evolution

[English](README.en.md) | [中文](README.md)

*Give your DeepSeek a mind of its own.*

> **Current version v0.5.1** · requires DeepSeek Harness `dsh-* >=0.1.0-rc.6 <0.2.0`

## Changelog

| Version | Highlights |
|---|---|
| **v0.5.1** | **Core-layer convergence**: banner and hme-status promoted to the core layer (alongside memory/archive/recall); `enableBanner` / `enableStatus` toggles removed — always on |
| **v0.5.0** | **Startup banner + status dashboard**: a dashboard banner lights up on start; a `hme-status` tool and `/hme-status` command report version, memory usage, archive counts, and rules |
| **v0.3.0** | **TTL expiry + value tiers**: memories can expire (V1 identity/lessons never; V2/V3 default 365d/90d, rules editable); entries carry `[v:N]` tier markers so the precious 1/10 is kept |
| **v0.2.0** | **Tag-indexed archive**: per-topic files + tag overwrite (same tag replaces old entry, self-consolidating); multi-tier architecture doc |
| v0.1.0 | Initial: core memory (USER/MEMORY) + archive overflow + recall |

## Dependency matrix

| Package | Range |
|---|---|
| `@deepseek-ai/cordis` | `>=4.0.0 <5.0.0` |
| `@deepseek-ai/dsh-agent` / `dsh-home-paths` / `dsh-llm` / `dsh-scope` / `dsh-system-prompt` / `dsh-tools` | `>=0.1.0-rc.6 <0.2.0` |
| `@deepseek-ai/schemastery` | `3.18.1` |

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

Once installed, every DeepSeek Harness start lights up a **status dashboard** in the terminal:

```text
╭──────────────────────────────────────────────────────────╮
│                                                          │
│   HME · Harness-Memory-Evolution                  v0.5.1 │
│ Give your DeepSeek a mind of its own.                    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ core memory                                              │
│   USER.md                               210 / 1597 chars │
│   C:\Users\demo\.dsh\hme\USER.md                      │
│   MEMORY.md                              91 / 2584 chars │
│   .dsh/hme/MEMORY.md                                     │
│ archive                                                  │
│   dir                                   .dsh/hme/archive │
│   entries                              0 across 0 topics │
│ rules                                                    │
│   V1 never · V2 365d · V3 90d                            │
╰──────────────────────────────────────────────────────────╯
```

### Step 1 · Install the plugin

**From GitHub (recommended, works right now):**

```sh
dsh plugin --profile web add github:weopenfire-git/hme-plugin
```

**Or from npm (released):**

```sh
dsh plugin --profile web add @yinging/dsh-hme
```

### Step 2 · Add one loader row

Open the profile's `cordis.patch.yml` and add a host row:

```yaml
- insert:
    - id: hme-plugin
      name: '@yinging/dsh-hme'  # package name for npm; use github:weopenfire-git/hme-plugin for GitHub
      config:
        memoryCharLimit: 2584
        userCharLimit: 1597
```

### Step 3 · Restart and behold

Restart dsh — the banner means it's working. At any time, ask for `hme-status` or type `/hme-status` to inspect memory state.

Give your DeepSeek a mind of its own.

---

# Technical reference

Cross-session long-term memory for DeepSeek Harness, as an out-of-tree plugin. It gives an agent two bounded plain-text memory files plus a `memory` tool, so user preferences and project facts survive across sessions instead of being relearned every time.

> **Status:** v0.5 — core memory (Phase 1) + archive overflow layer (Phase 1.5) + status dashboard (startup banner, `hme-status` tool, `/hme-status` command). Developer preview: the Harness APIs this plugin builds on are still changing. See [DESIGN.md](./DESIGN.md) and [ARCHIVE.md](./ARCHIVE.md).

## What it ships

- A `memory` tool that adds, replaces, and removes durable facts.
- An `archive` tool (add/replace/remove/move) plus a `recall` tool over a larger per-workspace overflow layer.
- An `hme-status` tool (plus an optional `/hme-status` slash command) reporting version, memory usage against caps, archive counts, and expiry rules.
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
| `archiveDirectory` | `.dsh/hme/archive` | Workspace-relative directory holding per-topic archive files. |

## How it works

At `agent/session-start` the plugin freezes both files into a per-scope snapshot, and the two context blocks serve that snapshot for the whole session. Writes go straight to disk with read-merge-write, so the current session's view stays stable while the next session sees the latest facts. Injection uses `systemPrompt.context()`, which records the memory as a persistent user-role snapshot rather than re-reading the files each turn.

## Develop / verify

`hme-plugin` is a pnpm workspace member for dependency resolution only, not a build target. Run `pnpm install` once so its `@deepseek-ai/*` dependencies link, then:

```sh
pnpm exec tsc -p hme-plugin
pnpm exec vitest run --config hme-plugin/vitest.config.ts
```

### Developing alongside other plugins in the same repo

If you develop several independent plugins inside one workspace checkout (for
example under `DSHarness/prototypes/`), follow the shared collaboration rules
in `DSHarness/prototypes/AGENTS.md` — each plugin stays self-contained with its
own `node_modules`, workspace entries append without touching others', and
shared files such as `pnpm-workspace.yaml` / `pnpm-lock.yaml` are only
appended, never rewritten.

## Roadmap

- **Phase 1.5** — archive overflow layer (`archive` / `recall` tools); see [ARCHIVE.md](./ARCHIVE.md).
- **Phase 2** — skill evolution: generate, optimize, and curate skills.
- **Phase 3** — reflection and maintenance in background jobs.

## License

[MIT](../LICENSE)
