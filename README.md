# HME — 给 DeepSeek 装上大脑

[English](README.en.md) | [中文](README.md)

> 跨会话长期记忆插件：让 DeepSeek Harness 的 Agent 记住你是谁、项目怎么写的、踩过哪些坑——**不会失忆，也不会被杂事烦扰**。

> **当前版本 v0.5.0** · 运行依赖 DeepSeek Harness `dsh-* >=0.1.0-rc.6 <0.2.0`

## 🚀 最近更新

| 版本 | 亮点 |
|---|---|
| **v0.5.0** | **启动横幅 + 状态面板**：启动时亮起「状态仪表盘」横幅；新增 `hme-status` 工具与可选 `/hme-status` 命令，随时查看版本、记忆容量、档案统计与规则；`enableBanner` / `enableStatus` 开关（默认开启） |
| **v0.3.0** | **TTL 到期 + 价值分层**：记忆可设过期（V1 身份/教训永不过期，V2/V3 默认 365d/90d），规则可自定义；写入打 `[v:N]` 价值标记，越重要的越留住 |
| **v0.2.0** | **标签索引 archive**：archive 升级为按主题分文件 + 标签覆盖（同标签写入自动替换旧的，自我收敛不臃肿）；附多级记忆架构文档 |
| v0.1.0 | 首个版本：core 记忆（USER/MEMORY）+ archive 扩容 + recall 检索 |

## 依赖矩阵

| 依赖包 | 版本范围 |
|---|---|
| `@deepseek-ai/cordis` | `>=4.0.0 <5.0.0` |
| `@deepseek-ai/dsh-agent` / `dsh-home-paths` / `dsh-llm` / `dsh-scope` / `dsh-system-prompt` / `dsh-tools` | `>=0.1.0-rc.6 <0.2.0` |
| `@deepseek-ai/schemastery` | `3.18.1` |

## 一句话定位

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

## 安装仪式（30 秒）

装好后，每次启动 DeepSeek Harness，终端会先亮起一面**状态仪表盘**：

```text
╭──────────────────────────────────────────────────────────╮
│   HME · Harness-Memory-Evolution                  v0.5.0 │
│ Give your DeepSeek a mind of its own.                    │
├──────────────────────────────────────────────────────────┤
│ core memory                                              │
│   USER.md                               137 / 1597 chars │
│   MEMORY.md                             412 / 2584 chars │
│ archive      dir .dsh/hme/archive · 23 across 5 topics   │
│ rules        V1 never · V2 365d · V3 90d                 │
├──────────────────────────────────────────────────────────┤
│ banner:on   status:on                                    │
╰──────────────────────────────────────────────────────────╯
```

### 第一步 · 装插件

**GitHub 装（推荐，立即可用）：**

```sh
dsh plugin --profile web add github:weopenfire-git/hme-plugin
```

**或 npm 装（已发布）：**

```sh
dsh plugin --profile web add @yinging/dsh-hme
```

### 第二步 · 补一行加载配置

打开 profile 的 `cordis.patch.yml`，加一条 host 行：

```yaml
- insert:
    - id: hme-plugin
      name: '@yinging/dsh-hme'  # npm 用包名；GitHub 装改为 github:weopenfire-git/hme-plugin
      config:
        enableBanner: true    # 启动横幅（默认开）
        enableStatus: true    # hme-status 工具 + /hme-status 命令（默认开）
```

### 第三步 · 重启，见证

重启 dsh，看到横幅即成功。之后随时在对话里喊 `hme-status` 或输入 `/hme-status` 查看记忆状态。

给你的 DeepSeek 装上大脑。

---
