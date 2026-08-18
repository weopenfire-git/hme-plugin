---
name: dsh-plugin-skeleton
description: Use when scaffolding a new DeepSeek Harness plugin repository, auditing an existing one, or moving a plugin out of a shared checkout — hme-style standalone layout, tsc+tsdown build pipeline, cordis.patch.yml loading, npm publishing, and the Windows/pnpm pitfalls that silently break builds and publishes.
---

# dsh-plugin-skeleton — hme 式 dsh 插件仓库骨架

用久经考验的布局搭建独立的 DeepSeek Harness 插件仓库（hme-plugin 是参考实现：`@yinging/dsh-hme`，仓库 weopenfire-git/hme-plugin）。以下内容在 Windows 上全部可用，并能干净地发布到 npm + GitHub。

## 什么时候用
- 新建一个 dsh 插件仓库
- 审计已有插件仓库是否符合这些约定
- 把插件从一个共享 checkout（如 DSHarness/prototypes）抽成独立仓库

## 0. 先决定
- **动工前先读 §8 协作与避让**：确认没做重、别误动别人的插件
- npm scope 与包名：`@<scope>/<plugin>`；开源记得 `publishConfig.access: "public"`
- 注入哪些服务：插件用到哪些 `ctx.*`（systemPrompt / tools / agent / scope / commands …）——见 §3
- 是否需要运行时显示自身版本：需要则维护 `src/version.ts` 的 `VERSION` 常量，与 package.json 同步

## 1. 仓库布局
```text
<plugin>/
├─ package.json          # name / type:module / main:lib/index.js / types:lib/types/index.d.ts / files / scripts
├─ tsconfig.json         # 自包含：es2024 / esnext / bundler / strict / declaration / outDir lib/types / rootDir src
├─ tsdown.config.ts      # entry ['lib/types/index.js']，clean: false（关键！）
├─ vitest.config.ts      # root: fileURLToPath(...)，include tests/**/*.spec.ts
├─ .gitignore            # node_modules/ lib/ .dsh/
├─ src/
│  ├─ index.ts           # { name, inject, apply(ctx, config) }
│  ├─ config.ts          # Config interface + schemastery z.object（每个字段 .default）
│  └─ ...                # 按功能分模块
├─ tests/                # vitest 用例
└─ README.md / README.en.md   # 双语、changelog、安装说明
```

## 2. 文件模板

### package.json（要点；完整参考 hme-plugin/package.json）
```json
{
  "name": "@scope/my-plugin",
  "version": "0.1.0",
  "publishConfig": { "access": "public" },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": { ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" }, "./package.json": "./package.json" },
  "files": ["lib/index.js", "lib/types/**/*.d.ts"],
  "scripts": {
    "build": "tsc -p tsconfig.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "prepare": "pnpm run build"
  },
  "dependencies": { "@deepseek-ai/schemastery": "3.18.1" },
  "peerDependencies": {
    "@deepseek-ai/cordis": ">=4.0.0 <5.0.0",
    "@deepseek-ai/dsh-agent": ">=0.1.0-rc.6 <0.2.0",
    "@deepseek-ai/dsh-home-paths": ">=0.1.0-rc.6 <0.2.0",
    "@deepseek-ai/dsh-llm": ">=0.1.0-rc.6 <0.2.0",
    "@deepseek-ai/dsh-scope": ">=0.1.0-rc.6 <0.2.0",
    "@deepseek-ai/dsh-system-prompt": ">=0.1.0-rc.6 <0.2.0",
    "@deepseek-ai/dsh-tools": ">=0.1.0-rc.6 <0.2.0"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.1",
    "@deepseek-ai/dsh-agent": "0.1.0-rc.6",
    "@deepseek-ai/dsh-home-paths": "0.1.0-rc.6",
    "@deepseek-ai/dsh-llm": "0.1.0-rc.6",
    "@deepseek-ai/dsh-scope": "0.1.0-rc.6",
    "@deepseek-ai/dsh-system-prompt": "0.1.0-rc.6",
    "@deepseek-ai/dsh-tools": "0.1.0-rc.6",
    "@types/node": "^22.20.0",
    "tsdown": "^0.22.2",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "declaration": true,
    "outDir": "lib/types",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### tsdown.config.ts
```ts
import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false, // 关键：clean:true 会删掉 tsc 刚产出的 entry → UNRESOLVED_ENTRY
})
```

### vitest.config.ts
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const dir = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  test: { root: dir, include: ['tests/**/*.spec.ts'] },
})
```

### .gitignore
```
node_modules/
lib/
*.tsbuildinfo
.dsh/
```

### src/index.ts（最小插件入口）
```ts
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'

export const name = 'my-plugin'
export const inject = ['systemPrompt', 'tools'] // 只列实际注入的服务

export { Config }

export function apply(ctx: Context, config: Config): void {
  // ctx.tools.register(defineTool({ ... }))
  // ctx.systemPrompt.context({ name: 'my:block', order: 50, text: (context) => '...' })
  ctx.on('agent/session-start', () => { /* 冻结每会话状态 */ })
  ctx.on('agent/disposed', () => { /* 清理 */ })
}
```

### src/config.ts
```ts
import z from '@deepseek-ai/schemastery'

export interface Config {
  // 必填字段（接口是严格类型）
}

export const Config: z<Config> = z.object({
  // 每个字段都要 .default(...)，这样 schema 推断类型里它们是可选
})
```

## 3. 插件入口约定
- `name` / `inject` / `apply(ctx, config)` 三件套；Config 由 schemastery schema 解析。
- 工具：`ctx.tools.register(defineTool({ name, description, parameters, output: { schema, render }, execute }))`；execute 里拿工作区根：`exec.agent?.session.header.cwd`。
- 上下文块：`ctx.systemPrompt.context({ name, order, text })`，text 返回空串则不注入。
- 会话生命周期用 `agent/session-start` / `agent/disposed`（宿主层拿不到 session/created 的 scope），配合 `scopeOf(agent.ctx)`。
- 可选服务软集成：`ctx.get('commands')` 未挂载时返回 undefined —— 用最小结构类型调用，不引入硬依赖（hme 的 /hme-status 命令就是这么做的）。

## 4. 坑（按杀伤力排序）

| # | 坑 | 症状 | 解法 |
|---|---|---|---|
| 1 | tsdown `clean: true` | 构建报 `UNRESOLVED_ENTRY` | 必须 `clean: false`（tsc 先产 entry，tsdown 再打包） |
| 2 | cordis.patch.yml 的 Windows 绝对路径 | `ERR_UNSUPPORTED_ESM_URL_SCHEME` | 写成 `file:///D:/.../src/index.ts`；相对路径按 profile 目录解析，不是 cwd |
| 3 | 未装 `@types/node` | `NodeJS.ErrnoException` 等类型报错 | devDeps 加 `@types/node` |
| 4 | vitest 没设 root | 测试路径解析错 | `root: fileURLToPath(new URL('.', import.meta.url))` |
| 5 | 构建两步缺一 | 入口缺失或 .d.ts 没产出 | build 用 `tsc -p tsconfig.json && tsdown`；相对导入带 `.ts` 后缀 |
| 6 | `files` 漏配 | 发布包缺 lib 或混入 src/tests | `files: ["lib/index.js", "lib/types/**/*.d.ts"]`，发布前 `npm pack --dry-run` |
| 7 | 忘加 `prepare` | 发布的是旧构建 | `"prepare": "pnpm run build"`（publish 时自动跑） |
| 8 | peer/dep 放错位置 | 重复安装、版本冲突 | 注入的 dsh-* 服务 + cordis → peerDependencies（用范围）；schemastery 等直接依赖 → dependencies |
| 9 | 版本双源不同步 | 横幅/状态显示旧版本 | package.json 与 src/version.ts 一起改 |
| 10 | Windows 终端中文乱码 | 中文变乱码 | 显示层问题、不是数据损坏；用 read 工具或 `-Encoding UTF8` 读 |
| 11 | Windows 沙箱（agent 环境） | node/pnpm "Access is denied"；子进程 pipe 输出 EPERM | 开发环境约束；stdio 用 inherit/ignore 或提权；不是插件代码问题 |
| 12 | 把 `.dsh/` 提交 | 个人记忆/运行数据进公共仓库 | gitignore 掉 `node_modules/ lib/ .dsh/` |
| 13 | `--follow-tags` 推 tag | lightweight tag 没到远端 | `git push origin v0.x.y` 显式推 |
| 14 | vitest 不 typecheck | 测试里的类型错误没被抓 | 测试文件也过 `tsc --noEmit`（含 tests）或靠自觉 |
| 15 | 发布前漏验证「装上后能看到的安装提示/启动横幅/状态」 | 用户装完一头雾水，或不显示任何活性 | 发布前手动走一遍安装流程，确认启动横幅/状态/命令真的出现在终端或页面里 |

## 5. 验证（每次提交/推送前，「test OK then push」）
```sh
pnpm install
pnpm run typecheck && pnpm run test && pnpm run build
npm pack --dry-run   # 发布前检查包内容
```

### 5.1 发布前验收清单（别只跑测试）
- [ ] `npm pack --dry-run`：包内只有 lib + LICENSE + README，无 src/tests
- [ ] **装上后用户能看到活性**：启动横幅、`hme-status` 类状态、或 `/命令` —— 在真实 dsh（或模拟 ctx）里跑一遍 `apply()` 确认横幅真的打印，别只在代码里写了就发
- [ ] 依赖：注入的 dsh-* 服务 + cordis 在 peerDependencies；schemastery 等在 dependencies
- [ ] 版本：package.json 与 src/version.ts 一致
- [ ] 手动执行一次发布命令序列，确认每步能过（git tag + push + pnpm publish）

## 6. 加载进 dsh
- 开发期：profile 的 `cordis.patch.yml` 加 host 行 `name: file:///<绝对路径>/src/index.ts`
- 发布后：`dsh plugin --profile web add @scope/my-plugin`（npm）或 `github:user/repo`（GitHub）
- 改源码后要重启 dsh web（config-HMR 只重载 patch 行，不重载插件源码）

## 6.5 推广收录（发布后可选）
- 想让插件出现在 awesome 榜单：开 PR 把条目加进 `README.md` 的对应分类段。
- **先确认仓库再开 PR**：GitHub 有十几个 `awesome-deepseek-harness` 变体，真实仓库不是 `deepseek-ai/...`。hme 实际是 <https://github.com/0xsline/awesome-deepseek-harness>（PR #276 已合并）。动手前用 GitHub 检查该 PR 是否已存在/已合并，避免重复开。
- PR 合并只是开始：确认目标仓库 README 里真的出现你的条目，才算收录完成。

## 7. 发布
```sh
git add -A && git commit -m "feat: initial"
git tag v0.1.0
git push origin main
git push origin v0.1.0   # lightweight tag 不会被 --follow-tags 推，要显式推
pnpm publish             # 需要 2FA；prepare 会自动 build
```

## 8. 协作与避让（多人 / 多插件开发时必读）

两个窗口做重、或误动别人插件，是最容易浪费整段工期的坑。动手前先过这几条：

1. **先查清单再动手**：确认要做的功能没被「我们已发布/在建的插件」覆盖；先搜 npm + GitHub 同名/同功能。
2. **一个插件一个主仓库 / 主窗口**：以先建立的那个为准，不要在另一窗口另起同名同功能的仓库（曾发生 doctor / pub-review 两边各做一个同源插件的情况）。
3. **命名前查占用**：`npm view <name>`、GitHub 搜索，确认 scope/包名/仓库名未被占。
4. **改共享资源只加自己的**：awesome 榜单、workspace（如 prototypes/）里，只追加自己的条目，绝不编辑/删除他人条目；先确认目标仓库/PR 状态（见 §6.5）。
5. **发布后回填清单**：新插件发布后更新下面的清单，免得下个人又做重。

### 我们已发布 / 在建的插件（示例清单，以 GitHub/npm 为准，发布后回填）

| 插件 | npm | GitHub | 状态 |
|---|---|---|---|
| hme-plugin（跨会话记忆） | `@yinging/dsh-hme` | `weopenfire-git/hme-plugin` | 已发布 v0.5.1 |
| 发布检查 | — | `weopenfire-git/dsh-plugin-pub-review` | 在建（另一窗口维护） |

> 别的团队应维护自己的清单，删掉/替换上表即可；上表只是示例。
