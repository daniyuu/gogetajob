# Feature: GoGetAJob MVP - 开源贡献投资平台

**Owner:** Luna Chen
**Created:** 2026-03-13
**Status:** In Progress
**Branch:** feature/gogetajob-mvp

---

## Design Draft

### 产品定位
**GoGetAJob** - 开源贡献投资平台，将开源项目类比为股票交易系统。用户像炒股一样"买入"开源项目，启动 AI 自动贡献 PR，根据项目价值增长计算投资回报率。

### 核心概念映射

| 股票概念 | 平台映射 | 说明 |
|---------|---------|------|
| 股票 | GitHub 开源项目 | 价值 = stars/forks/活跃度 |
| 买入 | 启动 AI 持续贡献 | Claude Code 自动找 issue 并提 PR |
| 卖出 | 停止贡献 | 终止 AI 打工进程 |
| 持仓 | 正在贡献的项目列表 | 实时显示打工状态 |
| 股价 | 项目综合评分 | stars + forks + 活跃度算法 |
| K线图 | 项目历史数据可视化 | stars/commits 时间序列 |
| 投资成本 | 花费的 AI Token | 每次 API 调用累计 |
| 投资回报 | 项目价值增长率 | PR 合并后快照对比 |

### MVP 功能范围

#### 1. 市场大厅
- 项目列表（支持搜索、排序）
- 输入 GitHub URL 直接添加项目
- 推荐市场（GitHub Trending 同步）
- 项目详情页（K线图、基本信息、issue 统计）
- 技术栈分类

#### 2. 交易操作
- 买入：启动持续贡献模式
- 卖出：停止贡献
- 支持 3-5 个项目并行打工

#### 3. 持仓管理
- 持仓列表（实时状态、token 消耗）
- 通知中心（PR 合并、review、错误）
- PR 状态追踪

#### 4. 投资组合
- 总投入/总回报/ROI
- 收益曲线图
- 单项目回报详情
- PR 成功率统计

#### 5. 数据更新策略
- 热门项目（stars>10k）：10分钟更新
- 普通项目（1k-10k）：1小时更新
- 冷门项目（<1k）：1天更新
- 持仓项目：10分钟更新（最高优先级）

### 技术架构

**技术栈：**
- 后端：Node.js + TypeScript + Express
- 前端：React + TailwindCSS + ECharts
- 数据库：SQLite
- AI 调度：参考 justdoit 调用 Claude CLI

**架构模式：**
- 单体架构 + 后台 Daemon
- Web 服务器 + 数据爬虫 + 打工调度器 + ROI 计算器

**核心模块：**
1. **GitHub Crawler**：定时抓取项目数据
2. **Work Scheduler**：管理 Claude Code 会话池
3. **ROI Calculator**：计算投资回报率

### 数据模型

- `projects`：项目基本信息
- `project_snapshots`：项目历史数据（K线）
- `positions`：持仓记录
- `pull_requests`：PR 记录
- `notifications`：通知消息

### 关键设计决策

1. **项目范围**：开放市场 + 推荐池（用户可输入任意 GitHub URL）
2. **买入模式**：持续打工直到手动停止
3. **质量控制**：依赖 Claude Code 自适应项目要求
4. **数据更新**：混合策略（热门高频、冷门低频、持仓优先）

### 参考项目

- justdoit (D:\repo\justdoit)：daemon 架构、Claude CLI 调用方式

---

## Implementation Plan

(待 writing-plans skill 生成)

---

## DevLog

### 2026-03-13
- 完成需求讨论和设计
- 创建任务目录
- 准备进入实施阶段
