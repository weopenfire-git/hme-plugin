# dsh 插件仓库骨架清单（hme 式）

> 完整可执行版见 skill：`dsh-plugin-skeleton`（本仓库 `.agents/skills/dsh-plugin-skeleton/SKILL.md`，已全局安装到 `~/.agents/skills/`）。这是给人类的速查清单。

## 仓库布局
```text
<plugin>/
├─ package.json / tsconfig.json / tsdown.config.ts / vitest.config.ts / .gitignore
├─ src/index.ts (name+inject+apply) · src/config.ts (schemastery z.object)
├─ tests/ · README.md + README.en.md
```

## 构建管线（两步）
```sh
pnpm run build   # = tsc -p tsconfig.json && tsdown
```
- tsc 产出 `lib/types/**/*.d.ts` 与入口 `lib/types/index.js`
- tsdown 把入口打包成 `lib/index.js`（`clean: false`，别改）

## 坑速查
1. **tsdown `clean: false`** —— clean:true 会删 entry → UNRESOLVED_ENTRY
2. **cordis.patch.yml Windows 路径** —— 必须 `file:///D:/...`，否则 ERR_UNSUPPORTED_ESM_URL_SCHEME
3. **`@types/node`** 别忘加（NodeJS.ErrnoException 等）
4. **vitest 设 root** —— `root: fileURLToPath(new URL('.', import.meta.url))`
5. **相对导入带 `.ts`** —— allowImportingTsExtensions + rewriteRelativeImportExtensions
6. **`files` 只发 lib** —— `["lib/index.js","lib/types/**/*.d.ts"]`，先 `npm pack --dry-run`
7. **`prepare: pnpm run build`** —— publish 自动构建
8. **peer vs dep** —— 注入的 dsh-* 服务 + cordis 放 peerDependencies；schemastery 放 dependencies
9. **版本双源** —— package.json 与 src/version.ts 一起改
10. **`.dsh/` 别提交** —— 个人记忆/运行数据
11. **Windows 乱码是显示问题** —— 文件是 UTF-8，用 read 工具读
12. **lightweight tag 要显式推** —— `git push origin v0.x.y`
13. **沙箱 EPERM/拒绝** —— 开发环境约束，不是插件代码问题

## 验证 + 发布
```sh
pnpm run typecheck && pnpm run test && pnpm run build   # test OK then push
npm pack --dry-run
git add -A && git commit -m "feat: initial"
git tag v0.1.0 && git push origin main && git push origin v0.1.0
pnpm publish   # 2FA；prepare 自动 build
```

## 加载进 dsh
- 开发：`cordis.patch.yml` 加 `name: file:///<绝对路径>/src/index.ts`
- 发布：`dsh plugin --profile web add @scope/<plugin>` 或 `github:user/repo`
- 改源码后重启 dsh web（HMR 不重载插件源码）
