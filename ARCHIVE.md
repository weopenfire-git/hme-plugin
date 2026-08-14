# HME Archive 设计（记忆扩容层）

> 补 DESIGN.md Phase 1 的「承载上限」短板。core 有界（拒绝式），archive 无界（大容量 + 按需检索）。
> 结论：DeepSeek Harness 无内置等价物——`session-query` 搜原始对话日志、`skill` 仅人类手写、`mcp-memory` 接第三方。archive 需自建，但检索可复用 `tool-fs-search`。

## 决策记录（2026-08-14）

| 决策 | 选择 | 理由 |
|---|---|---|
| 是否做 | 做 | core 有界后缺「溢出出口」，承载不住海量记忆 |
| 存储 | 单文件 `<workspace>/.dsh/hme/archive.md`，按工作区 | 与 MEMORY.md 同目录、可人工审计 |
| 上限 | `archiveCharLimit` 默认 131072（2¹⁷ ≈ 128K 字符 ≈ 一个满上下文窗口） | 「等于上下文大小」；部署级常量防振荡 |
| 分类 | Facts / Preferences / Methods / Lessons 四类 | 覆盖事实/偏好/方法/教训 |
| 降级 | core 满 → move 到 archive；明显时效性的直接删 | 参考 KV-cache 淘汰思路 |
| 淘汰 | archive 满 → 拒绝 + LRU/LFU 建议（不自动删） | 保持纯文本可审计 |

## 1. 定位：core 小而硬，archive 大而软

| | core（USER.md / MEMORY.md） | archive |
|---|---|---|
| 注入 | 每会话全量注入 | 不注入，`recall` 按需检索 |
| 上限 | 1597 / 2584（硬） | 131072（软，可配） |
| 内容 | 少而确定、高价值 | 海量、低频、细节 |
| 满时 | 拒绝 + move 降级 | 拒绝 + LRU 建议 |

## 2. 核心思想：蒸馏，不存原始数据

archive 存「方法论」，不存「原始数据」。写一条进 archive 前，模型自问 4 条，任一「否」就不存：

1. **跨会话还用吗？** 一次性任务细节 → 否。
2. **能从文件/代码/文档查到吗？** 能 → 存「结论/索引」，不存原文。
3. **是方法/约定，还是具体实例？** 存前者（如「迁移用 sqlx migrate」），不存后者（某段 SQL）。
4. **会很快过时吗？** 会 → 不存，或标注时效。

（这 4 条写进 `archive` 工具的 description，让模型写入时自我筛选。）

## 3. 存储与分类

单文件 `<workspace>/.dsh/hme/archive.md`，按 4 类分节，每节仍是 `§` 分隔事实（复用 facts.ts 增删改）：

```
## Facts        稳定事实：技术栈、路径、版本、约定常量
## Preferences  项目偏好：命名、工具、流程（非全局，全局在 USER.md）
## Methods      方法/流程：怎么做某件事的步骤（轻量，一条 §，不写成完整 SKILL.md）
## Lessons      坑/教训：现象 → 原因 → 解法
```

- **Facts**：可被 grep/读 package.json 等「查证」的结论，存结论不存原文。
- **Preferences**：这个项目特有的约定，区别于全局 USER.md。
- **Methods**：可复用操作流程，比 skill 更轻。
- **Lessons**：踩坑三要素「现象 → 原因 → 解法」。

## 4. 工具 API（三个工具）

### memory（不变，core）
现有 add/replace/remove，target = memory / user。

### archive（写 archive + 降级）
```
action: add | replace | remove | move
category: facts | preferences | methods | lessons
content?: string    # add / replace 的新内容
old_text?: string   # replace / remove 定位 archive；move 定位 MEMORY.md 的一条
```

- add：写一条到 archive 的 category。
- replace / remove：改/删 archive 里一条。
- move：从 MEMORY.md 移一条（old_text）到 archive 的 category —— core 满时降级用。

### recall（读 archive）
```
query: string
```
薄封装 `tool-fs-search` grep，搜 archive.md，返回命中片段 + 所在分类。不注入 = 不占 token。命中时更新元数据（§5）。

## 5. 降级与淘汰（KV-cache 式）

### 降级（core → archive）
core 满时，模型用 `archive move` 把低频事实从 MEMORY.md 移到 archive 对应分类，而非硬删。明显时效性的（如「本周末发布 v2」）直接 remove。

### 淘汰（archive 满时）
- archive 满，add 拒绝（和 core 一致）。
- 元数据文件 `<workspace>/.dsh/hme/archive.meta.json` 记录每条：内容 hash、使用计数（recall 命中）、最后使用时间。
- 满时，`archive add` 返回「满 + 按 LRU/LFU 排序的最久未用 N 条」，模型决定删哪些（不自动删）。

## 6. 配置（DESIGN.md §7 扩展）

```
archiveCharLimit: z.number().default(131072)
```

## 7. 实现分级

- **Phase A（核心）**：archive.md 存储 + 4 分类 + archive 工具（add/replace/remove/move）+ recall 工具（grep）+ 蒸馏判据注入 + 配置。
- **Phase B（进阶）**：archive.meta.json 元数据 + LRU/LFU 建议。

## 8. 测试

- 单元：4 分类解析/写；move（core→archive）；archive 满拒绝。
- 集成：recall grep 命中；move 后 core 减少、archive 增加。
- 快照：archive/recall 的模型可见输出。
