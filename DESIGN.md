# Harness-Memory-Evolution（HME）插件设计

## 决策记录（2026-08-14，实现前冻结）

| 决策 | 选择 | 理由与影响 |
|---|---|---|
| 挂载方案 | **A2：全局 host 行 + 按会话冻结快照** | 一行 patch 全模式通用（web/CLI/headless 均以 `- id: hme-plugin, name: file:///D:/work/ClaudeCode/DSHarness/hme-plugin/src/index.ts` 挂进各自 cordis 组合，见 §8）；快照冻结改为 scope 键控缓存（见 §4.2），插件保持全局单实例；代价：memory 工具与注入对所有会话可见 |
| 记忆文件位置 | **B2：USER.md 全局 + MEMORY.md 按工作区** | USER.md（用户画像，1597 字符）存 `$DSH_HOME/hme/USER.md` 跨工作区共享；MEMORY.md（项目事实，2584 字符）存 `<workspace>/.dsh/hme/MEMORY.md` 随项目走、可人工编辑、可 gitignore；与 Codex 实践一致，不同工作区的会话互不覆盖 |
| 并发写策略 | **read-merge-write** | 每次写操作先重读最新文件，在 § 分隔的事实行级别应用增删改，再整体写回；不基于会话快照写回，避免覆盖其他会话的更新 |
| 数字设定 | **φ 斐波那契 2584 / 1597** | MEMORY = F₁₈ = 2584、USER = F₁₇ = 1597，比值 = 黄金比例 φ；均为字符上限，中文约 2 token/字，2584 字每会话注入最多 ≈5K token |

实现要点（随 A2/B2 派生）：

- 注入拆为 `hme:user` 与 `hme:memory` 两个 context 块（order 50/51），各自按 scope 冻结：`agent/session-start` 冻结、`agent/disposed` 解冻，未冻结的 scope 返回空。
- `systemPrompt.context` 的 `text` 用 `(c) => store.snapshotFor(c.scope, kind)`，scope 来自每次 assembly 的 `AssembleContext.scope`。
- memory 工具的 `target` 解析：`user` → USER.md（全局）；`memory` → 当前会话工作区的 MEMORY.md。
- 配置字段相应改为 `userMemoryFile` / `workspaceMemoryFile`（§7）。

## 1. 定位与设计原则

Harness-Memory-Evolution（HME）是一个树外插件，为 DeepSeek Harness 增加跨会话长期记忆与后台自我进化能力。它使 Agent 能跨会话记住用户偏好、项目事实与环境信息，能从执行经验中提炼可复用技能，并通过持续反思实现"越用越强"。

设计遵循四条原则，与 Harness 自身的架构约定一致：

- **有界记忆**：用硬字符上限迫使 Agent 筛选高价值信息，而非无限制累积。
- **渐进式披露**：技能与记忆按需分层加载，最小化 token 消耗。
- **可审计性**：所有记忆与技能均为人类可读的纯文本文件。
- **可逆副作用**：插件的一切注册走 `ctx.effect()` / `ctx.on()`，卸载时自动清理。

HME 是树外插件，放在仓库根的 `hme-plugin/` 目录，通过 cordis.yml 按路径加载，不接受树内命名与覆盖率的门禁约束。

## 2. 架构总览

插件分为三个模块，共享一个存储后端：

```
hme-plugin/
  src/
    memory/     MemoryStore + memory 工具 + 提示词注入
    evolution/  SkillGenerator / SkillOptimizer / NudgeEngine / Curator
    config.ts   配置类型（schemastery）
    types.ts    共享类型
  DESIGN.md
```

记忆层与进化层由 HME 自己实现；技能的检索与加载复用 Harness 原生 skill 系统，HME 只负责生成、优化与维护技能内容。这个分工是本设计与常见"记忆插件"最大的差异，详见第 5 节。

## 3. 与 Harness 的集成点

HME 通过以下真实 API 集成：

| 需求 | 机制 |
|---|---|
| 记忆读写工具 | `ctx.tools.register(defineTool({ ... }))` |
| 记忆注入 | `ctx.systemPrompt.context({ name, order, text })`，物化为持久 user-role 快照 |
| 技能生成/优化/维护 | 写 `<dshHome>/skills` 文件，或 `ctx.skills.register()` 注册运行时技能 |
| 技能检索/加载 | 原生 `@deepseek-ai/dsh-tool-skill`（目录摘要 + `skill` 工具） |
| 反思/生成的模型调用 | `ctx.llm.stream(options)`，在 `ctx.jobs` 后台任务中运行 |
| 快照冻结/解冻 | `agent/session-start`、`agent/disposed` |
| 任务完成检测 | `session/event` 中 `event.type === 'turn/end'` |
| 技能使用追踪 | `tools/result` 观察 `skill` 工具的结果 |

### 插件形态

一个 HME 插件是一个 Cordis 插件对象：`name`、`inject`、`apply(ctx)`。依赖的服务键按驼峰命名，缺失时插件不加载。

```ts
export const name = 'hme-plugin'
export const inject = ['systemPrompt', 'tools']  // Phase 1；Phase 2 加 skills/llm，Phase 3 加 jobs/sessions

export function apply(ctx: Context, config: Config) {
  // 注册即副作用：dispose 时全部回滚
}
```

## 4. 记忆层

### 4.1 数据

记忆是两份纯文本文件，每份有硬字符上限：

- `MEMORY.md`：环境与项目事实，上限 2584 字符。按工作区一份：`<workspace>/.dsh/hme/MEMORY.md`，随项目走、可人工编辑、可加入 .gitignore。
- `USER.md`：用户画像，上限 1597 字符。全局一份：`$DSH_HOME/hme/USER.md`，跨工作区共享。

路径均可用配置覆盖（见 §7）。每条事实一行，以 `§` 结尾分隔，便于子串匹配的增删改。

```markdown
══════════════════════════════════════════════
MEMORY [57% — 1,474/2,584 chars]
══════════════════════════════════════════════
User's project is a Rust web service at ~/code/myapi using Axum + SQLx §
This machine runs Ubuntu 22.04, has Docker and Podman installed §
API keys are stored in ~/.env, never commit them to git §
```

### 4.2 快照与注入

记忆按"会话启动时冻结快照"注入：`agent/session-start` 时读取文件生成该会话的快照，会话内写入不更新当前会话的注入；新会话重新读取，看到最新记忆。

插件是全局单实例（决策记录 A2），冻结按 scope 键控：`systemPrompt.context()` 的 `text` 函数接收每次 assembly 的 `AssembleContext.scope`，返回该 scope 的冻结快照；快照在 `agent/session-start` 冻结、`agent/disposed` 失效。未冻结的 scope 返回空，因此不存在 scope 的组装不注入记忆。

注入使用 `ctx.systemPrompt.context()` 而非 `section()`：记忆是事实而非指令，`context()` 将内容物化为持久 user-role 快照，天然满足"model-visible ⟺ logged"的不变量。

```ts
export function apply(ctx: Context, config: Config) {
  const store = new MemoryStore(config)
  // scope 键来自 agent 的 scoped ctx（host 层监听 session/created 拿不到该 scope）
  ctx.on('agent/session-start', ({ agent }) => store.freeze(scopeOf(agent.ctx), agent.session.header.cwd))
  ctx.on('agent/disposed', ({ agent }) => store.unfreeze(scopeOf(agent.ctx)))
  ctx.systemPrompt.context({
    name: 'hme:user',
    order: 50,
    text: (c) => store.snapshotFor(c.scope, 'user'),      // 未冻结返回空
  })
  ctx.systemPrompt.context({
    name: 'hme:memory',
    order: 51,
    text: (c) => store.snapshotFor(c.scope, 'memory'),
  })
}
```

持久化不依赖 dispose 钩子：每次 memory 工具写操作直接 read-merge-write 到最新文件（§4.3），`agent/disposed` 只解冻快照缓存。

### 4.3 memory 工具

工具用 `defineTool` 注册，参数由 schema 自动校验，返回值走 `output.schema` 与 `output.render`。

```ts
ctx.tools.register(defineTool({
  name: 'memory',
  description: 'Persist a durable fact or preference across sessions.',
  parameters: {
    action: { type: 'string', enum: ['add', 'replace', 'remove'], required: true },
    target: { type: 'string', enum: ['memory', 'user'], required: true },
    content: { type: 'string' },
    old_text: { type: 'string' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    return store[args.action](args.target, args.content, args.old_text)
  },
}))
```

写入行为：`add` 超限返回错误，由 Agent 自行整理；`replace`/`remove` 用子串匹配，匹配多条时返回歧义错误。所有写操作采用 read-merge-write：先重读文件最新内容，在 § 分隔的事实行级别应用增删改，再整体写回——不基于会话冻结快照写回，避免覆盖其他会话的更新（决策记录）。

### 4.4 archive（记忆扩容层）

core 有界后，海量/低频/细节记忆下沉到 archive：单文件 `<workspace>/.dsh/hme/archive.md`、4 分类（Facts/Preferences/Methods/Lessons）、`recall` grep 检索、core 满时 move 降级 + LRU 淘汰。独立设计见 [ARCHIVE.md](ARCHIVE.md)。

## 5. 技能进化层（复用原生 skill 系统）

Harness 已有完整的技能能力，HME 不重新实现它：

- `ctx.skills`（`@deepseek-ai/dsh-skill`）是技能提供者注册表，支持 `registerProvider` / `snapshot` / `list` / `get`，定义按需渐进加载。
- `@deepseek-ai/dsh-skill-filesystem` 提供 `<dshHome>/skills` 本地来源。
- `@deepseek-ai/dsh-tool-skill` 消费注册表，在 `agent/pre-step` 注入持久 `<available_skills>` 目录摘要，并通过 `skill` 工具按需加载完整正文。

这恰好就是本设计想要的三级加载：目录只含名称与描述（L1），完整正文在模型调用 `skill` 工具时加载（L3），中间不再需要单独的 L2 层。因此 HME 的技能模块只做三件事：

- **SkillGenerator**：任务完成后，从执行轨迹提炼技能，写入 `<dshHome>/skills/<name>.md`（或 `ctx.skills.register()` 注册运行时技能）。写文件后调用提供者的 `invalidate()` 刷新目录。
- **SkillOptimizer**：技能使用达到阈值后，用新反馈重写技能正文。
- **Curator**：标记长期未用技能、归档过期技能、合并语义重复项。

技能使用追踪通过观察 `tools/result`（`skill` 工具的结果）实现，使用计数存于技能正文之外的一份额外元数据文件。

### 触发条件（SkillGenerator）

满足任一即触发：单次任务调用 5 次以上工具；执行中出现错误并自行修复；用户提供纠正反馈；任务耗时超过 3 分钟。

### 生成流程

`turn/end`（经 `session/event` 过滤）后，若满足触发条件，把执行轨迹提交给后台任务，由 `ctx.llm.stream()` 调用模型提炼技能，写文件后更新目录。

## 6. 反思与维护

### 6.1 模型调用

没有 `ctx.llm.complete()`。模型调用接口是 `ctx.llm.stream(options): AsyncIterable<StreamChunk>`，插件累积 `text-delta` 分片得到正文。反思与生成都走这个接口，也可改为 spawn 一个 subagent 获得更完整的上下文。

### 6.2 后台任务

反思、优化、维护都注册到 `ctx.jobs` 后台任务，获得 id、取消、通知与 owner 隔离。插件声明自己的 `JobKindMap` 命名空间（如 `hme:reflect`、`hme:curate`）。

```ts
ctx.jobs.start({
  kind: 'hme:reflect',
  label: 'reflect on last turn',
  owner: agent,
  run: async () => { /* llm.stream + write skill */ },
})
```

### 6.3 Nudge Engine

Nudge 是任务后反思的提示层，不是定时器：`turn/end` 后检查该回合是否有可提炼经验，有则把提示注入下一轮（`agent.inject()`，不唤醒空闲 Agent）。需要用户确认时，走 `tools/pre-execute` 返回 `ask` 决策，经 `ctx.approval` 应答。

需要真正按时间触发的场景，用 `@deepseek-ai/dsh-schedule`（`schedule_create` 等工具，`after_seconds` / `at` / `every_seconds`）。它是会话本地投递，只在会话存活时触发，冷会话恢复后补处理过期记录。

## 7. 配置

配置用 `@deepseek-ai/schemastery` 声明，从 cordis.yml 的 `config` 读取。部署差异都走配置字段，不用硬编码常量。

```ts
import z from '@deepseek-ai/schemastery'

export const Config: z<Config> = z.object({
  memoryCharLimit: z.number().default(2584),
  userCharLimit: z.number().default(1597),
  userMemoryFile: z.string().default(dshHomePath('hme', 'USER.md')),
  workspaceMemoryFile: z.string().default('.dsh/hme/MEMORY.md'),
  autoSkillGeneration: z.boolean().default(true),
  autoSkillOptimization: z.boolean().default(true),
  nudgeEnabled: z.boolean().default(true),
  curatorEnabled: z.boolean().default(true),
  staleDays: z.number().default(30),
  archiveDays: z.number().default(90),
  maxSkills: z.number().default(100),
})
```

不再有 `skillsDir`：技能位置由原生 `dsh-skill-filesystem` 决定（`<dshHome>/skills`）。

> Phase 1 只实现前四个记忆字段，其余进化开关留待 Phase 2。实际默认值语义：`userMemoryFile` 在代码中解析为 `dshHomePath('hme', 'USER.md')`（绝对路径）；`workspaceMemoryFile` 是工作区相对路径 `.dsh/hme/MEMORY.md`。

## 8. 目录结构与加载

```
hme-plugin/
  package.json
  src/
    index.ts       # name/inject/apply
    memory/
      store.ts     # MemoryStore
      tool.ts      # memory 工具
      injector.ts  # systemPrompt.context 注入
    evolution/
      generator.ts
      optimizer.ts
      nudge.ts
      curator.ts
    config.ts
    types.ts
  tests/
  DESIGN.md
```

cordis.yml 的条目是 `id` + `name` + `config` 三字段行；`name` 的相对路径相对 profile 目录解析、Windows 绝对路径须写 `file:///D:/...`（裸 `D:/...` 会被当成 URL 协议报错）、裸包名对 profile 的 node_modules 解析。补丁层（`cordis.patch.yml`）用 `insert` 增加条目、用 id 定向替换整个 `config`，`!!js` 表达式插值。

挂载按决策记录 A2：web、CLI、headless 各自在组合的 `cordis.patch.yml` 中以 host 行加入；web profile 的 preset 不参与本插件挂载——memory 工具与注入是全局能力，对所有会话可见。

```yaml
- id: hme-plugin
  name: file:///D:/work/ClaudeCode/DSHarness/hme-plugin/src/index.ts
  config:
    memoryCharLimit: 2584
    userCharLimit: 1597
```

## 9. 测试策略

树外插件不触发树内的 100% 覆盖率门禁，但仍需覆盖核心行为：

- **单元测试**：MemoryStore 增删改与超限处理；快照冻结语义；Curator 过期标记与归档。
- **集成测试**：会话 1 写入 → 会话 2 能回忆；复杂任务后生成技能文件；`skill` 工具结果驱动使用计数。
- **快照测试**：memory 工具与注入内容是可观察的模型输出，配 keyless 快照断言。

## 10. 风险与应对

| 风险 | 应对 |
|---|---|
| Token 成本失控 | 硬字符上限；技能目录摘要由原生 tool-skill 注入，正文按需加载 |
| 技能质量参差 | Curator 清理 + 人工可编辑的纯文本 |
| 隐私泄露 | 敏感词过滤 + 写入前确认；记忆路径显式区分全局与 per-workspace |
| 原生 API 变动 | 本仓库处于开发者预览，接口有破坏性变更；跟随架构文档更新，锁定到具体版本 |

## 11. 里程碑

- **Phase 1 记忆层**：MemoryStore、memory 工具、`context()` 注入、单元测试。作为纵向切片，验证本文档的 API 假设。
- **Phase 1.5 archive 扩容层**：archive.md + 4 分类 + archive/recall 工具 + move 降级。见 [ARCHIVE.md](ARCHIVE.md)。
- **Phase 2 技能进化**：SkillGenerator 写入原生 skill、使用追踪、Curator。
- **Phase 3 反思与维护**：`ctx.jobs` 后台任务、`ctx.llm.stream` 提炼、Nudge。
- **Phase 4 集成**：端到端测试、文档、性能核对。
