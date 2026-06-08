# BanLea 开发计划

> 个人专属学习助手 · 本地优先桌面应用
> 版本：v0.3 ｜ 最后更新：2026-06-08
> 本文档既是**产品/功能说明**，也是**开发流程记录**。后续每阶段的决策、变更追加到本目录。
> 变更见文末「决策记录」。**v0.3 起视为可开工版本。**

---

## 1. 项目目标

构建一个**个人专属**的学习助手 BanLea，核心能力：

- 为用户绘制并**持续自迭代**的"学习画像"（多维、带版本）；
- 实时、多维度地了解用户的学习底细（思维、掌握、能力、偏好、价值倾向…）；
- 用**更温和、更贴合用户学习习惯**的方式辅助学习；
- 在用户还不主动学时，**主动猜测并推荐**该学/该看的内容，靠行为反馈不断变准。

设计原则：**本地优先、隐私至上、单用户、可自我进化、低主动门槛**。

---

## 2. 名词定义（统一术语）

> "harness" 在本项目里是**自定义术语**——形似通用工程含义，但被赋予了新意义：一套"持续评估并维护某层画像"的引擎。

| 术语 | 含义 |
|---|---|
| **画像（Portrait）** | 对用户某一层面的多维度刻画，由 LLM 评估生成，**带版本、可演化**。 |
| **主 harness（Master）** | 针对"用户这个人"的整体画像引擎。刻画跨学科稳定特质（如"逻辑强→用逻辑化方式教"），产出**通用学习人格**。 |
| **子 harness（Sub）** | 针对某个方向/学科的画像引擎（物理、计算机…）。刻画该领域的掌握、思维、价值倾向等多维分析。 |
| **维度（Dimension）** | 画像里的一个分析视角。**全量 ≥20 维**，见 §4。 |
| **证据（Evidence）** | 更新画像的原始信号：对话、自评、测验、阅读停留、推荐点击/停留等。 |
| **推荐候选（Candidate）** | 信息流里"猜你想学/想看"的一条待推荐项。 |

### 双层关系（关键）

```
                 ┌──────────────────────────────┐
                 │   主 harness（用户整体人格）    │
                 │  逻辑强 / 偏好类比 / 自驱型…    │
                 └───────────────┬──────────────┘
                                 │ 向下注入"该怎么教这个人"
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ┌───────────┐     ┌───────────┐      ┌───────────┐
        │ 子:计算机  │     │  子:物理   │      │  子:英语   │
        │ 掌握/思维  │     │ 掌握/思维  │      │ 掌握/思维  │
        │ 价值倾向…  │     │ 价值倾向…  │      │ 价值倾向…  │
        └───────────┘     └───────────┘      └───────────┘
```

- **主 harness 决定"风格与方法"**：怎么沟通、用什么类比、讲多深、语气如何。
- **子 harness 决定"内容与进度"**：在这个学科到哪了、卡在哪、下一步学什么。
- 辅导/推荐时，**两层画像同时注入**：主层给"教法"，子层给"教什么"。

---

## 3. 产品形态与入口

BanLea 是一个有两个主入口的桌面应用。

### 3.1 入口一：提问式学习（日常主入口）

```
┌──────────────┬────────────────────────────────┬──────────────────┐
│ 左栏:对话历史  │  对话区（中央）                   │ 右栏:待读书单     │
│ (按方向分块)   │                                │                  │
│ ▾ 计算机       │  用户：帮我入门 k8s              │ 📕《K8s概念》知乎 │
│   · k8s 入门   │  BanLea：                       │ 📺 B站 入门视频   │
│   · Rust所有权 │   ├ 学习计划（按画像定深浅/节奏）  │ 💻 GitHub 示例    │
│ ▾ 物理         │   ├ 学习内容（个性化，流式）      │ 📄 官方 docs 选段 │
│   · 量子入门   │   └ 配套资料 → 自动进右栏书单     │ ──────────────   │
│ ▾ 化学         │                                │ [标记已读][稍后] │
│   · 有机反应   │  用户随时复述/被出题验证 → 证据    │                  │
│ [+ 新对话]     │                                │                  │
└──────────────┴────────────────────────────────┴──────────────────┘
```

要点：
- **左栏：按方向/学科分块的对话历史**（类似 Gemini 的历史侧栏，但**分类归块**：计算机/物理/化学…）。方便随时点回某个主题继续（如 k8s）。
- **设计上的统一**：一个对话**归属一个方向（domain）**，左栏的分类块 = 方向 = **子 harness**。所以"对话历史分类"和"画像/证据归属"是同一套 domain 体系——左栏点开某方向，等于进入该方向的子 harness 上下文，新对话产生的证据自动归到对应子画像（§5）。方向可由 LLM 对首句自动判定 + 用户可改。
- **中央：一次提问 → 学习计划 + 个性化讲解 + 配套资料**。资料自动进**右栏"待读书单"**（按方向分类、可标记已读/稍后）。
- 用户可**随时发起复述对话**（"这篇讲了啥、我学到了啥"），BanLea **出题或要求总结来验证**，结果作为证据回流画像（§5）。
- 讲解的深浅、风格、类比由**主+子画像**驱动（§4）。

### 3.2 入口二：画像 / 看板 / 推荐流

三块并列，给用户"被理解 + 有掌控 + 有动力"的感受：

1. **我的画像（可视化 + AI 协商修改）**
   - 雷达图/卡片展示各维度 + 历史版本演化曲线。
   - **用户不能手动直接改**画像；只能**通过和 AI 对话**提出（"我觉得我数学没那么差"），AI 评估后**带理由地**写入新版本（保留可解释性与可回溯）。这避免用户随手乱改破坏数据可信度。

2. **数据看板（成就/安全感）**
   - 已读书单按方向分类统计、学习时长、连续天数、各领域掌握度变化。
   - 目标是**正反馈**：让用户直观看到"我读了这么多、进步了多少"。

3. **猜你想学 / 猜你想看（主动推荐信息流）** —— 见 §6
   - 脉脉式**逐条冒出**的卡片流，降低"不知道学什么"的启动门槛。

---

## 4. 多维画像（≥20 维）

画像是**结构化 JSON**，由 Claude 的 **Structured Outputs（`output_config.format` + `json_schema`）** 强约束生成。维度分两层，**合计 27 维**（15 主 + 12 子，满足"至少 20 维"并预留扩展）。

### 4.1 主 harness 维度（跨领域人格层，15 维）

| # | 维度 | key | 刻画什么 |
|---|---|---|---|
| 1 | 逻辑推理 | `logical_reasoning` | 演绎/归纳/条理性 |
| 2 | 抽象思维 | `abstraction` | 概念化、举一反三 |
| 3 | 学习动机/自驱 | `motivation` | 内驱 vs 外驱、主动性 |
| 4 | 专注与持续 | `focus_persistence` | 单次专注时长、坚持度 |
| 5 | 元认知 | `metacognition` | 对"自己会不会"的判断准确度 |
| 6 | 抗挫韧性 | `resilience` | 遇难题的情绪/坚持反应 |
| 7 | 好奇广度 | `curiosity_breadth` | 兴趣面宽窄、跨界倾向 |
| 8 | 记忆/留存 | `retention` | 遗忘速度、需复习频率 |
| 9 | 偏好模态 | `preferred_modality` | 文字/代码/图示/视频/类比 |
| 10 | 学习节奏 | `pace` | 快/慢、喜欢循序还是跳跃 |
| 11 | 深度偏好 | `depth_preference` | 浅尝即止 vs 钻到底 |
| 12 | 价值取向 | `value_orientation` | 实用 / 理论 / 美感 |
| 13 | 沟通风格偏好 | `communication_style` | 鼓励型 / 直接型 / 苏格拉底式 |
| 14 | 时间投入模式 | `time_pattern` | 何时学、单次多长、碎片 vs 整块 |
| 15 | 学习目标取向 | `goal_orientation` | 为什么学：职业 / 考试 / 兴趣 / 项目所需——强烈左右教法（考试→刷题、职业→实战项目、兴趣→广度） |

### 4.2 子 harness 维度（每个领域各一份，12 维）

| # | 维度 | key | 刻画什么 |
|---|---|---|---|
| 16 | 掌握程度 | `mastery` | 该领域整体水平 |
| 17 | 知识盲区 | `gaps` | 缺失的关键知识点 |
| 18 | 误区/卡点 | `misconceptions` | 错误理解、反复卡住处 |
| 19 | 领域思维模式 | `domain_thinking` | 在该领域的思考习惯 |
| 20 | 学习进度 | `progress` | 学到哪、下一里程碑 |
| 21 | 应用能力 | `application` | 能否动手用 |
| 22 | 迁移能力 | `transfer` | 跨情境迁移 |
| 23 | 严谨度 | `rigor` | 重实现轻证明？反之？ |
| 24 | 兴趣强度 | `interest` | 对该领域的热度（喂推荐） |
| 25 | 学习速度/曲线 | `velocity` | 进步斜率 |
| 26 | 领域价值倾向 | `domain_values` | 该领域里更看重什么 |
| 27 | 资料偏好 | `resource_preference` | 在该领域喜欢什么形式的资料 |

### 4.3 画像 JSON（结构示例，节选）

```jsonc
{
  "scope": "domain",                 // "global"=主harness | "domain"=子harness
  "domain": "computer_science",
  "portrait_version": 7,
  "updated_at": "2026-06-08T12:00:00Z",
  "confidence": 0.55,                // 整体可信度
  "dimensions": {
    "mastery":        { "score": 0.62, "confidence": 0.8, "summary": "数据结构扎实，算法分析偏弱", "evidence_ids": [12,18] },
    "interest":       { "score": 0.80, "confidence": 0.6, "trend": "rising", "summary": "最近频繁问云原生" },
    "domain_thinking":{ "tags": ["自底向上","重实现轻证明"], "confidence": 0.3, "summary": "..." }
    // …其余维度同构：score/tags/summary/trend/evidence_ids + 每维独立 confidence
  },
  "next_focus": "补强算法复杂度分析",
  "change_summary": "interest 由 0.6→0.8：本周 5 次 k8s 相关提问"   // 相比上版的变化与原因
}
```

> 每个维度统一携带 `summary`（可读结论）+ `evidence_ids`（可追溯）+（数值维度）`score`/`trend` + **每维独立 `confidence`**。
> **为什么每维都要 confidence**：27 维里有的证据充足、有的还是早期猜测。没有逐维可信度，雷达图会把"瞎猜的 0.7"和"扎实的 0.7"画得一样，辅导注入也会把两者当同样可靠——直接削弱"真实了解用户底细"这个核心卖点。UI 对低可信度维度**淡化/折叠**，辅导注入时低可信度维度只作弱提示。

### 4.4 维度分析（怎么用、怎么省）

**(1) 按功能分组——每维"喂"给谁**

| 用途 | 主要相关维度 | 注入到哪 |
|---|---|---|
| **教法（怎么教）** | communication_style / preferred_modality / pace / depth_preference / value_orientation / resilience / goal_orientation | 辅导 system prompt 的"风格"段 |
| **内容与规划（教什么/下一步）** | mastery / gaps / misconceptions / progress / transfer / velocity | 学习计划 + 辅导 system prompt 的"内容"段 |
| **推荐（猜想学/想看）** | interest / curiosity_breadth / goal_orientation / velocity | §6 候选生成 + 排序特征 |
| **可视化/安全感** | 全部（雷达图） + mastery/progress 趋势 | §3.2 画像页 + 看板 |

> 这套映射也是"双层 harness"的落地：教法多来自**主**层，内容多来自**子**层。

**(2) 按变化速度分层——决定重评估节奏（省钱核心）**

| 层 | 维度（举例） | 变化速度 | 重评估策略 |
|---|---|---|---|
| **慢变（人格特质）** | logical_reasoning / abstraction / metacognition / preferred_modality / communication_style | 月级 | 极少重算；累计大量证据或显著矛盾才动 |
| **中变（能力/偏好）** | mastery / application / rigor / depth_preference / goal_orientation | 周级 | 该领域学习活跃时偶尔重算 |
| **快变（状态/兴趣）** | interest / progress / velocity / gaps / misconceptions | 天级/会话级 | 高频更新（但优先用便宜模型 / 局部更新） |

**(3) 局部重评估，不是整张表重算**
每次只重评估**被新证据触及的维度**（如一次 k8s 提问→只动该子画像的 interest/progress/gaps），不把 27 维整体丢给模型重算。好处：省 token、稳定慢变维度、变更可解释。慢变维度长期不动 = 几乎不花钱。详见 §5③。

---

## 5. 自迭代闭环（"harness 自评估"机制）

BanLea 的心脏。不是偶尔重算，而是明确闭环：

```
 ① 采集证据 ─▶ ② 触发判断 ─▶ ③ LLM 重评估 ─▶ ④ 版本化落库 ─▶ ⑤ 注入辅导/推荐
      ▲                                                              │
      └──────────────────────────────────────────────────────────────┘
```

| 环节 | 设计 |
|---|---|
| **① 证据采集** | 来源：辅导对话提问/回答、用户自评、内置测验结果、阅读资料停留/标记、**推荐流的点击率/停留率**。每条落 `evidence` 表（domain、类型、摘要、时间）。 |
| **② 触发判断** | 触发条件（可配）：累计 N 条新证据 / 出现矛盾信号（一直答对突然连错）/ 用户手动刷新 / 进入新方向首次建档 / **推荐行为显著（强点击或强跳过）**。**不每轮重算**，省 token、省钱。 |
| **③ LLM 重评估** | "旧画像 + 新证据" → Claude 结构化输出。**只重评估被证据触及的维度**（局部更新，见 §4.4(3)），其余维度原样保留；要求模型说明"哪些维度变了、为什么"（可解释）。慢变人格维度几乎不动 → 省 token。 |
| **④ 版本化落库** | 画像**不覆盖**，每次存新版本（`portrait_versions`）。演化轨迹可见、可回溯、可向用户展示成长曲线、可回滚。 |
| **⑤ 注入** | 最新主画像 + 对应子画像写入辅导/推荐的 system prompt（配合 Prompt Caching 降本，§9）。 |

---

## 6. 推荐引擎：猜你想学 / 猜你想看

解决"用户一开始不会主动学"。脉脉式**逐条冒出**的卡片流。

### 6.1 两类候选

| 类型 | 含义 | 候选来源 |
|---|---|---|
| **猜你想学（学什么）** | 下一步该掌握的**主题/技能**（例：之前只随口提过 k8s → 主动推 k8s 入门） | 画像兴趣维度 + 已学方向的**邻近主题** + **用户提过但没学**的词 + 领域热点 |
| **猜你想看（看什么）** | 正在学的东西的**具体资料** | 待读书单未读项 + 资料源（§7）按画像筛 |

### 6.2 生成 → 排序 → 反馈 闭环

```
候选生成(LLM,便宜模型) → 本地打分排序 → 信息流逐条展示
        ▲                                      │
        │                          点击率 / 停留率 / 跳过
        │                                      │
        └── 更新 ①画像(兴趣维度) + ②排序算法权重 ◀┘
```

- **候选生成**：用 `claude-haiku-4-5`（便宜）基于画像产出候选 + 一句"为什么推荐你"。
- **排序（本地、零 token）**：每个候选有特征向量——`画像兴趣匹配 / 与已学邻近度 / 是否用户提过 / 难度匹配 / 新鲜度`。打分 = 加权和。
- **反馈双更新**（你的核心要求）：
  1. **更新画像**：点击+长停留 = 该方向兴趣↑（喂 §5 的 `interest` 维度）；秒跳 = 兴趣↓。
  2. **更新算法**：把点击/停留当作 reward，用**轻量在线学习（多臂老虎机 / 逻辑回归式权重更新）**调整上面各特征的权重。单用户本地，无需重型 ML，纯 SQLite + 内存即可。
- **冷启动（关键）**：空画像时"纯画像驱动"是空话——真正的冷启动机制是**首次引导建档（onboarding seed）**：开局先问几个问题（你做什么、擅长什么、想学什么），用回答**初始化主画像 + 建首批方向**，再叠加"提过但没学"的词。有了种子画像，推荐才有依据。

> 设计目的：不仅省得用户想"学什么"，还能**用别的内容勾起学习动力**（你提到的"让你更有动力学别的"）。

---

## 7. 资料源适配层（可插拔）

需求 #3 接外部 API 推荐资料、点名知乎。现实约束：

- **知乎**：官方 **API v4**（OAuth2，需开放平台 `client_id/secret`）对个人开发者**基本不开放**；第三方接口靠浏览器模拟/爬取，**违反 ToS、不稳定、限速（~30 req/min）**。
- 结论：统一 `ResourceSource` 适配接口，先接稳定合规源；知乎做**可选适配器**——有官方凭据就启用，否则不依赖、不爬虫。

```ts
interface ResourceSource {
  id: string;                 // "github" | "arxiv" | "bilibili" | "zhihu" | "web"
  search(query: string, ctx: PortraitContext): Promise<ResourceItem[]>;
  enabled: boolean;
}
```

| 适配器 | 状态 | 备注 |
|---|---|---|
| 通用网页搜索（Claude `web_search`/`web_fetch` 服务端工具） | **首选** | 稳定、合规、带引用，可让模型按画像筛 |
| **GitHub** | **必做** | 官方 REST API，**拉取优秀代码/项目给用户当学习材料**（需求 #5 读法 A，已确认） |
| arXiv / 文档站 | 推荐 | 学术/技术资料，官方友好 |
| Bilibili / YouTube | 可选 | 视频学习源；遵守各自 API 政策 |
| 知乎（官方 OAuth v4） | 可选/预留 | 仅凭合规凭据启用，无爬虫兜底 |

> 需求 #5 读法 B（**开发时参考 GitHub 优秀实现**）已纳入开发流程，见 §13。

---

## 8. 技术架构

### 8.1 选型与理由

| 层 | 选型 | 理由 |
|---|---|---|
| **桌面外壳** | **Tauri**（Rust 内核 + 系统 WebView） | 比 Electron 体积小、省内存、启动快；本地优先、单用户理想；原生 keychain/文件/SQLite 支持好 |
| **前端 UI** | **React + TypeScript + Vite** | 桌面 UI 本质是 Web 技术；TS 生态成熟 |
| **样式/设计** | **Tailwind CSS + 自建设计系统** | 见 §12 |
| **AI 大脑** | **Claude API**，官方 `@anthropic-ai/sdk`（TS） | 推理强；结构化输出、Prompt Caching、流式原生支持 |
| **本地存储** | **SQLite**（Tauri SQL 插件 / `better-sqlite3`） | 单文件零运维、隐私好；契合版本化画像与证据流 |
| **密钥存储** | **OS Keychain**（Tauri keyring/Stronghold） | API Key **绝不**进明文配置，见 §10 |
| **推荐在线学习** | 纯 TS 实现的轻量 bandit/加权打分 | 单用户本地，无需 ML 框架 |

#### 语言与运行时：最终决定

**定为 Tauri v2 + React + TypeScript（TS 一种语言为主）。** 给你打消顾虑的几点：

1. **你几乎不用写 Rust。** Tauri 的 Rust 层这里只做两件事，且都有**官方现成插件**、抄配置即可：
   - `tauri-plugin-sql`（SQLite）
   - `tauri-plugin-stronghold` 或 `keyring`（密钥）
   全部业务、AI、UI 逻辑都在 **TypeScript**。预计手写 Rust < 50 行（就是注册插件 + 一两个读密钥的命令）。
2. **为什么不是纯原生（全 Rust GUI 等）**：你要"有设计感、像 Gemini"的界面，Web 技术栈（HTML/CSS/动效）在这件事上碾压原生 GUI 框架；而且 Claude 的 **TS SDK 最成熟**（结构化输出、流式、重试都有现成封装），Rust SDK 不成熟。
3. **Claude 调用放在哪**：v1 **在 TS 前端**用 `@anthropic-ai/sdk` 直接调；API Key 启动时从 keychain 取进内存。安全上可接受——WebView **只加载本地打包的资源**（不开远程网页），没有注入窃取 key 的途径。**升级路径**：若将来要加载远程内容，再把调用挪到 Rust 命令后面（key 不进前端）。
4. **唯一备选 = Electron**（纯 JS、工具链更简单，但应用更大更吃内存）。**只有当 Rust 工具链真的把你卡住时**才换 Electron——目前不预设。

> 一句话：**主力语言是 TypeScript，Rust 只是极薄的系统外壳。** 这就是我替你定的，不用纠结。

### 8.2 模块划分

**分层原则**：`core/` 是**纯业务逻辑、不依赖 UI、可单测**；`features/` 是消费 core 的 UI 切片；`db/` 是仓储层；`types/` 放共享类型与 zod schema。这样画像迭代、推荐打分这些核心逻辑能脱离界面单独测试。

```
BanLea/
├─ src-tauri/                   # Rust 外壳（极薄，~官方插件配置）
│  ├─ src/
│  │   ├─ main.rs               # 启动 + 注册 sql/stronghold 插件
│  │   └─ commands.rs           # 仅少量命令：读写 keychain
│  ├─ migrations/               # SQL 迁移（tauri-plugin-sql 管理）
│  ├─ tauri.conf.json
│  └─ Cargo.toml
│
├─ src/                         # 主力代码（TypeScript）
│  ├─ main.tsx · App.tsx        # 入口 + 路由 + 三栏布局骨架
│  │
│  ├─ ui/                       # 设计系统：tokens / 主题 / 原子组件（Button、Card…）
│  ├─ pages/                    # 路由级页面（辅导 / 画像 / 看板 / 推荐流 / 设置）
│  ├─ features/                 # 功能切片（各自含 组件 + hooks + 视图逻辑）
│  │   ├─ tutor/                #   入口一：提问式辅导 + 学习计划 + 验证出题
│  │   ├─ history/              #   左栏：按方向分块的对话历史
│  │   ├─ reading-list/         #   右栏：待读书单
│  │   ├─ portrait/             #   画像可视化 + 与 AI 协商修改（UI）
│  │   ├─ dashboard/            #   数据看板
│  │   ├─ feed/                 #   猜你想学/想看 信息流
│  │   └─ onboarding/           #   首次引导建档（冷启动种子，§6.2）
│  │
│  ├─ core/                     # 纯逻辑内核（无 UI 依赖，重点单测对象）
│  │   ├─ harness/              #   主/子 harness 引擎：画像生成 + 局部重评估 + 版本管理
│  │   ├─ recommender/          #   候选生成 + 本地排序 + 在线学习（bandit/加权）
│  │   ├─ evidence/             #   证据采集 + 触发器
│  │   ├─ llm/                  #   Claude 封装：结构化输出 / 缓存 / 流式 / 重试 / 模型分层
│  │   └─ sources/              #   资料源适配层（web/github/arxiv/zhihu…）
│  │
│  ├─ db/                       # SQLite 仓储层（repository 模式，每表一个 repo）
│  ├─ types/                    # 共享类型 + zod schema（画像/证据/推荐/资料）
│  ├─ config/                   # 模型分层、触发阈值、排序特征默认权重
│  └─ lib/                      # 通用工具（日期、格式化…）
│
├─ tests/                       # core/ 单元测试（画像迭代、推荐打分、触发器）
└─ docs/                        # 本目录：开发流程记录
```

> 命名澄清：画像**逻辑**在 `core/harness/`，画像**界面**在 `features/portrait/`，schema 在 `types/`——三者职责不同，不混。

### 8.3 模型与参数

| 用途 | 模型 | 说明 |
|---|---|---|
| 深度画像重评估、复杂辅导、学习计划 | `claude-opus-4-8` | 最强推理；$5 / $25 每百万 token。`thinking:{type:"adaptive"}` + `output_config.effort:"high"` |
| 高频/轻量（方向分类、推荐候选生成、出题、短问答） | `claude-haiku-4-5` | $1 / $5 每百万 token，便宜快 |

- 结构化画像：`output_config:{ format:{ type:"json_schema", schema:<画像schema> } }`
- 自适应思考：`thinking:{ type:"adaptive" }`（Opus 4.8 不支持 `budget_tokens`，会 400）
- 长辅导走 **streaming**，`.finalMessage()` 收尾

---

## 9. 成本与性能

- **谁付费**：本地优先 = 用户用**自己的 Anthropic Key**，后台每次重评估/推荐生成都是用户花的 token。
- **降本手段**：
  1. **模型分层**（§8.3）：例行/高频（推荐候选、出题、分类）用 Haiku，深度合成用 Opus。默认 Opus，**Haiku 作为设置项可选**，不静默降级。
  2. **推荐排序本地化**：排序零 token，只有候选生成调便宜模型。
  3. **Prompt Caching**：稳定 system 段（角色、画像 schema、长期画像）放前缀打 `cache_control`，省最多 ~90% 重复输入成本。注意前缀匹配——别把时间戳/随机 ID 放进前缀。
  4. **触发节流**（§5②）：不每轮重算画像。
- 设置页显示**本月预估花费**（用 `count_tokens` 估算）。

---

## 10. 安全与隐私

- **API Key**：存 **OS Keychain**，**绝不**进明文配置或 SQLite。
- **学习数据**：全部本地 SQLite，不上传任何服务器（除调用 Claude API 必需的对话内容）。
- **可导出/可删除**：一键导出或清空全部画像、证据、书单。
- **资料源合规**：不内置爬虫；第三方源守各自 ToS 与限速。

---

## 11. 数据模型（SQLite 初稿）

```sql
CREATE TABLE domains (id TEXT PRIMARY KEY, name TEXT, created_at TEXT);

-- 画像版本（主 harness 用 domain_id='global'）
CREATE TABLE portrait_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id TEXT, version INTEGER,
  portrait_json TEXT,            -- §4 结构化画像（含 ≥20 维）
  confidence REAL, created_at TEXT,
  change_summary TEXT
);

-- 证据流
CREATE TABLE evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id TEXT,
  type TEXT,                     -- chat|self_report|quiz|reading|reco_click|reco_skip
  payload TEXT, created_at TEXT,
  consumed_in_version INTEGER
);

-- 待读书单 / 已读
CREATE TABLE reading_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id TEXT, source_id TEXT,
  title TEXT, url TEXT, kind TEXT,         -- article|video|repo|doc
  status TEXT,                              -- todo|reading|done|later
  added_at TEXT, read_at TEXT,
  dwell_seconds INTEGER
);

-- 推荐流：候选 + 反馈信号
CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT,                                -- learn|read
  topic TEXT, reason TEXT, features_json TEXT,
  score REAL, shown_at TEXT,
  clicked INTEGER DEFAULT 0, dwell_seconds INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0
);

-- 排序算法权重（在线学习状态，单行/少行）
CREATE TABLE ranker_weights (feature TEXT PRIMARY KEY, weight REAL, updated_at TEXT);

-- 辅导会话（左栏按 domain_id 分块归类）
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id TEXT,                          -- 决定它归到左栏哪个方向块 / 哪个子 harness
  title TEXT, created_at TEXT, updated_at TEXT
);
-- 消息、测验记录（略：messages/quizzes，messages.session_id 外键）
```

---

## 12. UI / 设计方向

需求 #4：简洁、有设计感、好看（参考 Gemini）。

- 设计系统：克制留白、清晰层级、统一圆角/阴影/动效语言；深浅主题。
- 关键界面：
  1. **提问式辅导**（主入口，三栏：左=按方向分块的对话历史 / 中=流式对话 / 右=待读书单）
  2. **我的画像**（雷达图 + 版本演化时间线 + 与 AI 协商修改）
  3. **数据看板**（已读分类统计、时长、连续天数）
  4. **猜你想学/想看**（脉脉式逐条冒出卡片流）
  5. **设置**（API Key、模型分层、资料源开关、花费预估）
- > 你提到"安装设计感 skill"：当前环境暂无专门设计 skill 可调；先用成熟设计系统（Tailwind + 自定义 token）落地。若有想参考的具体产品/截图，给我能更贴。

---

## 13. 开发里程碑（开发流程）

> 每完成一阶段，在 `docs/` 追加阶段记录（决策、踩坑、变更）。

| 阶段 | 目标 | 关键产出 |
|---|---|---|
| **M0 脚手架** | Tauri+React/TS+SQLite+Keychain 跑通；Claude SDK 接通（成功调用+流式） | 可运行空壳、密钥安全存取 |
| **M1 画像内核** | ≥20 维画像 schema；主/子 harness 结构化输出生成；版本化落库 | 能对输入产出/迭代画像 |
| **M2 自迭代闭环** | 证据采集+触发器+重评估+版本演化+可解释变化 | §5 闭环跑通 |
| **M3 提问式辅导** | 画像注入的个性化辅导+学习计划+配套资料入书单+验证出题 | 入口一可用 |
| **M4 书单 & 看板** | 待读书单（分类/已读/停留）+ 数据看板 | 入口二之①② |
| **M5 推荐引擎** | onboarding 种子建档（冷启动）+ 猜你想学/想看候选生成 + 本地排序 + 点击/停留双更新（画像+算法） | 信息流 + 冷启动 |
| **M6 画像可视化** | 雷达图+版本演化+AI 协商修改 | 入口二之③ |
| **M7 资料源** | `ResourceSource` 适配层 + web_search/GitHub 适配器 | 资料推荐打通 |
| **M8 打磨** | 设计系统统一、花费显示、导出/清空、模型分层设置 | 可发布个人版 |

> 贯穿全程（需求 #5 读法 B）：实现关键模块前，**先参考 GitHub 优秀开源实现**（Tauri 应用模板、Claude SDK 用法、记忆/画像类项目、推荐/bandit 实现），避免重复造轮子。

---

## 14. 风险与对策

| 风险 | 对策 |
|---|---|
| 后台重评估 + 推荐生成烧钱（用户付费） | 触发节流 + 模型分层 + 排序本地化 + Prompt Caching + 费用可视 |
| 知乎源不可用/违规 | 适配层隔离，知乎仅可选；默认合规源 |
| 画像"漂移"或乱迭代 | 结构化输出 + 置信度 + 变化说明 + 版本可回溯/回滚；用户改动须经 AI |
| 推荐"信息茧房"/越推越窄 | 候选保留"探索"比例（新鲜度/跨界特征），bandit 留探索项。**另注意双重放大**：点击/停留既更新画像 `interest` 又更新排序权重，而画像又喂排序——同一信号被算两次。需对画像兴趣的反馈增量做衰减，避免越推越窄 |
| 冷启动无数据 | **首次引导建档（onboarding seed）为主**：开局问答初始化主画像 + 首批方向；再叠加"提过但没学"的词 |
| 隐私 | 全本地 + Keychain + 可导出可删除 |
| 设计 skill 缺失 | 成熟设计系统兜底；需你提供参考视觉 |

---

## 附：决策记录

### 2026-06-08 · v0.2 → v0.3（可开工版）
- **语言最终拍板**（§8.1）：**Tauri v2 + React + TypeScript**。主力是 TS，Rust 只是极薄外壳（官方插件，手写 < 50 行）。Claude 调用在 TS 前端用官方 SDK，key 从 keychain 取进内存（WebView 只加载本地资源）。备选 Electron 仅在 Rust 工具链卡住时启用。
- **项目结构重构**（§8.2）：`core/`（纯逻辑可单测）与 `features/`（UI 切片）解耦；新增 `types/`(zod schema)、`config/`、`db/`(仓储)、`tests/`、`onboarding/`、`src-tauri/migrations/`。
- **画像维度精化**（§4）：新增 `goal_orientation`（为什么学）→ 共 **27 维**；新增 **§4.4 维度分析**（按功能分组 + 按变化速度分层 + **局部重评估**省钱策略）。
- **自迭代省钱**（§5③）：只重评估被证据触及的维度，慢变人格维度几乎不动。

### 2026-06-08 · v0.1 → v0.2
- **入口一确认**：提问式 → 学习计划+内容+配套资料（右侧待读书单）；可随时复述、被出题验证。
- **入口二确认**：①画像可视化 + 仅经 AI 协商修改；②数据看板（已读分类，给安全感）；③猜你想学/想看信息流（脉脉式逐条冒出，点击/停留双更新画像+算法，冷启动靠画像猜）。
- **需求 #5 = A+B 都要**：拉 GitHub 代码给用户当材料（A，§7）+ 开发时参考优秀实现（B，§13）。
- **画像 ≥20 维**：落地为 14（主）+12（子）=26 维（§4）。
- **语言**：不锁 TS；默认仍推荐 Tauri+React/TS（理由见 §8.1），非硬约束。
- 新增子系统：推荐引擎（§6）、待读书单 + 数据看板（§3.2）。
- **三栏布局**：新增**左栏=按方向分块的对话历史**（类 Gemini，但分类归块；对话历史的分类 = domain = 子 harness，与画像/证据归属统一）。
- **每维独立 confidence**（§4.3）：避免雷达图把"瞎猜的 0.7"和"扎实的 0.7"画成一样；低可信度维度 UI 淡化、辅导只作弱提示。
- **冷启动改为 onboarding 种子建档**（§6.2）：空画像不能驱动推荐，开局问答初始化主画像与首批方向。

### 2026-06-08 · v0.1 初稿
- 运行形态：本地优先桌面应用；AI：Claude（Opus 4.8 主力 + Haiku 4.5 轻量）；harness：主+子双层；资料源：可插拔，知乎走官方 OAuth 可选、不爬虫。
