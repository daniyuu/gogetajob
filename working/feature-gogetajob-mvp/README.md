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

## Breakdown

### Milestones

- [ ] Milestone 1: Project scaffolding and database setup
- [ ] Milestone 2: Backend core services (GitHub API, database models)
- [ ] Milestone 3: Daemon and scheduler infrastructure
- [ ] Milestone 4: Frontend basic UI and routing
- [ ] Milestone 5: Integration and E2E functionality

---

### Task 1: Initialize Project Structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.frontend.json`
- Create: `.gitignore`
- Create: `src/backend/types.ts`
- Create: `src/frontend/types.ts`

**Step 1: Initialize npm project**

Run: `npm init -y`
Expected: Creates package.json

**Step 2: Install backend dependencies**

Run:
```bash
npm install express sqlite3 better-sqlite3 cors
npm install -D typescript @types/node @types/express @types/better-sqlite3 @types/cors ts-node nodemon concurrently
```

**Step 3: Install frontend dependencies**

Run:
```bash
npm install react react-dom
npm install -D @types/react @types/react-dom esbuild tailwindcss postcss autoprefixer echarts
```

**Step 4: Create TypeScript configs**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src/backend",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/backend/**/*"],
  "exclude": ["node_modules"]
}
```

Create `tsconfig.frontend.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "noEmit": true
  },
  "include": ["src/frontend/**/*"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
public/js/bundle.js
*.log
.DS_Store
data/*.db
data/*.db-journal
.env
```

**Step 6: Create directory structure**

Run:
```bash
mkdir -p src/backend/lib
mkdir -p src/frontend
mkdir -p public/js
mkdir -p public/css
mkdir -p data
```

**Step 7: Create base types file**

Create `src/backend/types.ts`:
```typescript
export interface Project {
  id: number;
  repo_url: string;
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  last_commit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSnapshot {
  id: number;
  project_id: number;
  stars: number;
  forks: number;
  open_issues: number;
  commits_count: number;
  snapshot_at: string;
}

export interface Position {
  id: number;
  project_id: number;
  status: 'active' | 'stopped';
  claude_session_id: string | null;
  buy_price: number;
  token_cost: number;
  started_at: string;
  stopped_at: string | null;
}

export interface PullRequest {
  id: number;
  position_id: number;
  pr_number: number;
  pr_url: string;
  issue_url: string | null;
  status: 'pending' | 'merged' | 'closed' | 'review';
  token_cost: number;
  created_at: string;
  merged_at: string | null;
}

export interface Notification {
  id: number;
  position_id: number;
  type: 'pr_merged' | 'pr_review' | 'error' | 'milestone';
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Config {
  port: number;
  githubToken: string | null;
  claudePath: string;
  maxParallelWorkers: number;
  updateIntervals: {
    hot: number;    // stars > 10k
    warm: number;   // 1k-10k stars
    cold: number;   // < 1k stars
    positions: number;
  };
}
```

**Step 8: Commit**

Use `/codeblend-commit`

---

### Task 2: Database Schema and Migration

**Files:**
- Create: `src/backend/lib/database.ts`
- Create: `src/backend/lib/migrations.ts`

**Step 1: Create database module**

Create `src/backend/lib/database.ts`:
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'gogetajob.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function closeDatabase() {
  db.close();
}
```

**Step 2: Create migration system**

Create `src/backend/lib/migrations.ts`:
```typescript
import { db } from './database.js';

export function runMigrations() {
  // Create projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_url TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      language TEXT,
      last_commit_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create project_snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      commits_count INTEGER DEFAULT 0,
      snapshot_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create index on project_snapshots
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_project_time
    ON project_snapshots(project_id, snapshot_at DESC)
  `);

  // Create positions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('active', 'stopped')) DEFAULT 'active',
      claude_session_id TEXT,
      buy_price INTEGER DEFAULT 0,
      token_cost INTEGER DEFAULT 0,
      started_at TEXT DEFAULT (datetime('now')),
      stopped_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Create pull_requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER NOT NULL,
      pr_number INTEGER NOT NULL,
      pr_url TEXT NOT NULL,
      issue_url TEXT,
      status TEXT CHECK(status IN ('pending', 'merged', 'closed', 'review')) DEFAULT 'pending',
      token_cost INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      merged_at TEXT,
      FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
    )
  `);

  // Create notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('pr_merged', 'pr_review', 'error', 'milestone')) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database migrations completed');
}
```

**Step 3: Test database initialization**

Create `src/backend/test-db.ts`:
```typescript
import { db, closeDatabase } from './lib/database.js';
import { runMigrations } from './lib/migrations.js';

runMigrations();

// Test insert
const result = db.prepare(`
  INSERT INTO projects (repo_url, name, description, stars, forks, language)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('https://github.com/test/repo', 'test-repo', 'A test repository', 100, 20, 'TypeScript');

console.log('Inserted project with ID:', result.lastInsertRowid);

// Test query
const projects = db.prepare('SELECT * FROM projects').all();
console.log('All projects:', projects);

closeDatabase();
```

**Step 4: Run test**

Run: `npx ts-node src/backend/test-db.ts`
Expected: Should create database and insert test data

**Step 5: Clean up test file**

Run: `rm src/backend/test-db.ts`

**Step 6: Commit**

Use `/codeblend-commit`

---

### Task 3: GitHub API Service

**Files:**
- Create: `src/backend/lib/github-api.ts`

**Step 1: Create GitHub API client**

Create `src/backend/lib/github-api.ts`:
```typescript
import type { Project } from '../types.js';

export interface GitHubRepoData {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  open_issues_count: number;
}

export class GitHubAPI {
  private baseUrl = 'https://api.github.com';
  private token: string | null;

  constructor(token?: string) {
    this.token = token || null;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GoGetAJob/1.0'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Parse GitHub URL to extract owner and repo name
   */
  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  /**
   * Fetch repository data from GitHub API
   */
  async fetchRepo(owner: string, repo: string): Promise<GitHubRepoData> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}`;
    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Fetch repository by URL
   */
  async fetchRepoByUrl(repoUrl: string): Promise<GitHubRepoData> {
    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) {
      throw new Error('Invalid GitHub repository URL');
    }
    return this.fetchRepo(parsed.owner, parsed.repo);
  }

  /**
   * Calculate project score (for buy_price)
   */
  calculateProjectScore(data: GitHubRepoData): number {
    // Simple scoring: stars + forks * 2
    return data.stargazers_count + (data.forks_count * 2);
  }

  /**
   * Fetch GitHub Trending repositories
   */
  async fetchTrending(language?: string, since: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<string[]> {
    // Note: GitHub doesn't have official trending API
    // In production, you might scrape github.com/trending or use third-party service
    // For MVP, return empty array (users can add projects manually)
    console.warn('Trending API not implemented - returning empty list');
    return [];
  }
}
```

**Step 2: Add test for GitHub API**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "test:github": "ts-node src/backend/test-github.ts"
  }
}
```

Create `src/backend/test-github.ts`:
```typescript
import { GitHubAPI } from './lib/github-api.js';

async function test() {
  const api = new GitHubAPI();

  // Test URL parsing
  const parsed = api.parseRepoUrl('https://github.com/facebook/react');
  console.log('Parsed:', parsed);

  // Test fetch (use a small repo to avoid rate limits)
  try {
    const data = await api.fetchRepoByUrl('https://github.com/facebook/react');
    console.log('Repo data:', {
      name: data.full_name,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language
    });

    const score = api.calculateProjectScore(data);
    console.log('Project score:', score);
  } catch (error) {
    console.error('Error fetching repo:', error);
  }
}

test();
```

**Step 3: Run test**

Run: `npm run test:github`
Expected: Should fetch React repo data and calculate score

**Step 4: Clean up test file**

Run: `rm src/backend/test-github.ts`

**Step 5: Commit**

Use `/codeblend-commit`

---

### Task 4: Project Service (CRUD Operations)

**Files:**
- Create: `src/backend/lib/project-service.ts`

**Step 1: Create project service**

Create `src/backend/lib/project-service.ts`:
```typescript
import { db } from './database.js';
import { GitHubAPI } from './github-api.js';
import type { Project, ProjectSnapshot } from '../types.js';

export class ProjectService {
  private githubApi: GitHubAPI;

  constructor(githubToken?: string) {
    this.githubApi = new GitHubAPI(githubToken);
  }

  /**
   * Add a new project from GitHub URL
   */
  async addProject(repoUrl: string): Promise<Project> {
    // Check if project already exists
    const existing = this.getProjectByUrl(repoUrl);
    if (existing) {
      return existing;
    }

    // Fetch from GitHub
    const data = await this.githubApi.fetchRepoByUrl(repoUrl);

    // Insert into database
    const result = db.prepare(`
      INSERT INTO projects (repo_url, name, description, stars, forks, language, last_commit_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      repoUrl,
      data.full_name,
      data.description,
      data.stargazers_count,
      data.forks_count,
      data.language,
      data.pushed_at
    );

    const projectId = result.lastInsertRowid as number;

    // Create initial snapshot
    this.createSnapshot(projectId, data.stargazers_count, data.forks_count, data.open_issues_count);

    return this.getProjectById(projectId)!;
  }

  /**
   * Get project by ID
   */
  getProjectById(id: number): Project | undefined {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  }

  /**
   * Get project by URL
   */
  getProjectByUrl(url: string): Project | undefined {
    return db.prepare('SELECT * FROM projects WHERE repo_url = ?').get(url) as Project | undefined;
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    return db.prepare('SELECT * FROM projects ORDER BY stars DESC').all() as Project[];
  }

  /**
   * Update project data from GitHub
   */
  async updateProject(projectId: number): Promise<void> {
    const project = this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const data = await this.githubApi.fetchRepoByUrl(project.repo_url);

    db.prepare(`
      UPDATE projects
      SET stars = ?, forks = ?, last_commit_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(data.stargazers_count, data.forks_count, data.pushed_at, projectId);

    // Create snapshot
    this.createSnapshot(projectId, data.stargazers_count, data.forks_count, data.open_issues_count);
  }

  /**
   * Create a snapshot of project data
   */
  createSnapshot(projectId: number, stars: number, forks: number, openIssues: number): void {
    db.prepare(`
      INSERT INTO project_snapshots (project_id, stars, forks, open_issues, commits_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, stars, forks, openIssues, 0); // commits_count to be implemented later
  }

  /**
   * Get snapshots for a project (for K-line chart)
   */
  getProjectSnapshots(projectId: number, limit: number = 100): ProjectSnapshot[] {
    return db.prepare(`
      SELECT * FROM project_snapshots
      WHERE project_id = ?
      ORDER BY snapshot_at DESC
      LIMIT ?
    `).all(projectId, limit) as ProjectSnapshot[];
  }

  /**
   * Delete a project
   */
  deleteProject(projectId: number): void {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  }
}
```

**Step 2: Commit**

Use `/codeblend-commit`

---

### Task 5: Position Service (Buy/Sell Operations)

**Files:**
- Create: `src/backend/lib/position-service.ts`

**Step 1: Create position service**

Create `src/backend/lib/position-service.ts`:
```typescript
import { db } from './database.js';
import { GitHubAPI } from './github-api.js';
import type { Position, PullRequest, Notification } from '../types.js';

export class PositionService {
  private githubApi: GitHubAPI;

  constructor(githubToken?: string) {
    this.githubApi = new GitHubAPI(githubToken);
  }

  /**
   * Buy a position (start contributing to a project)
   */
  async buyPosition(projectId: number): Promise<Position> {
    // Check if already have active position for this project
    const existing = this.getActivePosition(projectId);
    if (existing) {
      throw new Error(`Already have an active position for project ${projectId}`);
    }

    // Get project to calculate buy price
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const buyPrice = this.githubApi.calculateProjectScore(project as any);

    // Create position
    const result = db.prepare(`
      INSERT INTO positions (project_id, status, buy_price)
      VALUES (?, 'active', ?)
    `).run(projectId, buyPrice);

    const positionId = result.lastInsertRowid as number;

    // TODO: Start Claude Code session (will implement in work scheduler)

    return this.getPositionById(positionId)!;
  }

  /**
   * Sell a position (stop contributing)
   */
  sellPosition(positionId: number): void {
    const position = this.getPositionById(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    if (position.status === 'stopped') {
      throw new Error(`Position ${positionId} already stopped`);
    }

    db.prepare(`
      UPDATE positions
      SET status = 'stopped', stopped_at = datetime('now')
      WHERE id = ?
    `).run(positionId);

    // TODO: Stop Claude Code session
  }

  /**
   * Get position by ID
   */
  getPositionById(id: number): Position | undefined {
    return db.prepare('SELECT * FROM positions WHERE id = ?').get(id) as Position | undefined;
  }

  /**
   * Get active position for a project
   */
  getActivePosition(projectId: number): Position | undefined {
    return db.prepare(`
      SELECT * FROM positions
      WHERE project_id = ? AND status = 'active'
    `).get(projectId) as Position | undefined;
  }

  /**
   * Get all active positions
   */
  getActivePositions(): Position[] {
    return db.prepare(`
      SELECT * FROM positions
      WHERE status = 'active'
      ORDER BY started_at DESC
    `).all() as Position[];
  }

  /**
   * Get all positions (including stopped)
   */
  getAllPositions(): Position[] {
    return db.prepare(`
      SELECT * FROM positions
      ORDER BY started_at DESC
    `).all() as Position[];
  }

  /**
   * Update token cost for a position
   */
  updateTokenCost(positionId: number, additionalCost: number): void {
    db.prepare(`
      UPDATE positions
      SET token_cost = token_cost + ?
      WHERE id = ?
    `).run(additionalCost, positionId);
  }

  /**
   * Record a PR for a position
   */
  recordPR(positionId: number, prNumber: number, prUrl: string, issueUrl: string | null, tokenCost: number): PullRequest {
    const result = db.prepare(`
      INSERT INTO pull_requests (position_id, pr_number, pr_url, issue_url, token_cost)
      VALUES (?, ?, ?, ?, ?)
    `).run(positionId, prNumber, prUrl, issueUrl, tokenCost);

    // Update position total token cost
    this.updateTokenCost(positionId, tokenCost);

    return db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(result.lastInsertRowid) as PullRequest;
  }

  /**
   * Update PR status
   */
  updatePRStatus(prId: number, status: 'pending' | 'merged' | 'closed' | 'review', mergedAt?: string): void {
    if (mergedAt) {
      db.prepare(`
        UPDATE pull_requests
        SET status = ?, merged_at = ?
        WHERE id = ?
      `).run(status, mergedAt, prId);
    } else {
      db.prepare(`
        UPDATE pull_requests
        SET status = ?
        WHERE id = ?
      `).run(status, prId);
    }
  }

  /**
   * Get PRs for a position
   */
  getPositionPRs(positionId: number): PullRequest[] {
    return db.prepare(`
      SELECT * FROM pull_requests
      WHERE position_id = ?
      ORDER BY created_at DESC
    `).all(positionId) as PullRequest[];
  }

  /**
   * Create a notification
   */
  createNotification(positionId: number, type: Notification['type'], message: string): void {
    db.prepare(`
      INSERT INTO notifications (position_id, type, message)
      VALUES (?, ?, ?)
    `).run(positionId, type, message);
  }

  /**
   * Get notifications
   */
  getNotifications(unreadOnly: boolean = false): Notification[] {
    if (unreadOnly) {
      return db.prepare(`
        SELECT * FROM notifications
        WHERE is_read = 0
        ORDER BY created_at DESC
      `).all() as Notification[];
    }
    return db.prepare(`
      SELECT * FROM notifications
      ORDER BY created_at DESC
      LIMIT 100
    `).all() as Notification[];
  }

  /**
   * Mark notification as read
   */
  markNotificationRead(notificationId: number): void {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notificationId);
  }

  /**
   * Calculate ROI for a position
   */
  calculateROI(positionId: number): number {
    const position = this.getPositionById(positionId);
    if (!position) return 0;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(position.project_id);
    if (!project) return 0;

    const currentPrice = this.githubApi.calculateProjectScore(project as any);
    const growth = currentPrice - position.buy_price;

    if (position.token_cost === 0) return 0;

    // ROI = (growth / token_cost) * 100
    return (growth / position.token_cost) * 100;
  }
}
```

**Step 2: Commit**

Use `/codeblend-commit`

---

### Task 6: Express Server Setup

**Files:**
- Create: `src/backend/server.ts`
- Create: `src/backend/lib/config.ts`
- Create: `server.js` (entry point)

**Step 1: Create config module**

Create `src/backend/lib/config.ts`:
```typescript
import type { Config } from '../types.js';
import path from 'path';
import fs from 'fs';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

const DEFAULT_CONFIG: Config = {
  port: 9393,
  githubToken: null,
  claudePath: 'claude',
  maxParallelWorkers: 5,
  updateIntervals: {
    hot: 600,       // 10 minutes
    warm: 3600,     // 1 hour
    cold: 86400,    // 1 day
    positions: 600  // 10 minutes
  }
};

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
}

export function saveConfig(config: Partial<Config>): void {
  const current = loadConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
}
```

**Step 2: Create Express server**

Create `src/backend/server.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import { runMigrations } from './lib/migrations.js';
import { loadConfig } from './lib/config.js';
import { ProjectService } from './lib/project-service.js';
import { PositionService } from './lib/position-service.js';

const app = express();
const config = loadConfig();

// Initialize database
runMigrations();

// Services
const projectService = new ProjectService(config.githubToken || undefined);
const positionService = new PositionService(config.githubToken || undefined);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// API Routes

// Projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = projectService.getAllProjects();
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const project = projectService.getProjectById(parseInt(req.params.id));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { repo_url } = req.body;
    if (!repo_url) {
      return res.status(400).json({ error: 'repo_url is required' });
    }
    const project = await projectService.addProject(repo_url);
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/snapshots', (req, res) => {
  try {
    const snapshots = projectService.getProjectSnapshots(parseInt(req.params.id));
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Positions
app.get('/api/positions', (req, res) => {
  try {
    const positions = positionService.getAllPositions();
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/active', (req, res) => {
  try {
    const positions = positionService.getActivePositions();
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/positions/buy', async (req, res) => {
  try {
    const { project_id } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    const position = await positionService.buyPosition(project_id);
    res.json(position);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/positions/:id/sell', (req, res) => {
  try {
    positionService.sellPosition(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/:id/prs', (req, res) => {
  try {
    const prs = positionService.getPositionPRs(parseInt(req.params.id));
    res.json(prs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/:id/roi', (req, res) => {
  try {
    const roi = positionService.calculateROI(parseInt(req.params.id));
    res.json({ roi });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Notifications
app.get('/api/notifications', (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = positionService.getNotifications(unreadOnly);
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    positionService.markNotificationRead(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Config
app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  try {
    const { saveConfig } = require('./lib/config.js');
    saveConfig(req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 GoGetAJob server running on http://localhost:${PORT}`);
});
```

**Step 3: Create server entry point**

Create `server.js`:
```javascript
#!/usr/bin/env node
require('./dist/server.js');
```

Make it executable:
```bash
chmod +x server.js
```

**Step 4: Update package.json scripts**

Add to `package.json`:
```json
{
  "scripts": {
    "build:backend": "tsc",
    "dev:backend": "tsc --watch",
    "start": "node server.js"
  }
}
```

**Step 5: Test server**

Run:
```bash
npm run build:backend
npm start
```

Test with curl:
```bash
curl http://localhost:9393/api/projects
```

Expected: Should return empty array `[]`

**Step 6: Commit**

Use `/codeblend-commit`

---

### Task 7: Frontend基础框架

**Files:**
- Create: `public/index.html`
- Create: `public/css/style.css`
- Create: `src/frontend/index.tsx`
- Create: `src/frontend/App.tsx`
- Create: `src/frontend/api.ts`
- Create: `esbuild.config.mjs`

**Step 1: Create HTML entry point**

Create `public/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GoGetAJob - 开源贡献投资平台</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div id="root"></div>
  <script src="/js/bundle.js"></script>
</body>
</html>
```

**Step 2: Create CSS (stock market style)**

Create `public/css/style.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0a0a0a;
  color: #e0e0e0;
}

#root {
  min-height: 100vh;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

/* Stock market colors */
.price-up {
  color: #00ff00;
}

.price-down {
  color: #ff0000;
}

.price-neutral {
  color: #888;
}

/* Header */
.header {
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  padding: 15px 0;
  margin-bottom: 20px;
}

.header h1 {
  color: #00ff00;
  font-size: 24px;
}

/* Navigation */
.nav {
  display: flex;
  gap: 20px;
  margin-top: 10px;
}

.nav-link {
  color: #888;
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 4px;
  transition: all 0.2s;
}

.nav-link:hover {
  color: #fff;
  background: #2a2a2a;
}

.nav-link.active {
  color: #00ff00;
  background: #1a3a1a;
}

/* Cards */
.card {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.card-title {
  font-size: 18px;
  margin-bottom: 15px;
  color: #fff;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #00aa00;
  color: #fff;
}

.btn-primary:hover {
  background: #00cc00;
}

.btn-danger {
  background: #aa0000;
  color: #fff;
}

.btn-danger:hover {
  background: #cc0000;
}

.btn-secondary {
  background: #333;
  color: #fff;
}

.btn-secondary:hover {
  background: #444;
}

/* Input */
.input {
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 10px;
  color: #fff;
  font-size: 14px;
  width: 100%;
}

.input:focus {
  outline: none;
  border-color: #00aa00;
}

/* Table */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #333;
}

.table th {
  color: #888;
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
}

.table tr:hover {
  background: #1a1a1a;
}

/* Loading */
.loading {
  text-align: center;
  padding: 40px;
  color: #888;
}
```

**Step 3: Create API client**

Create `src/frontend/api.ts`:
```typescript
const API_BASE = 'http://localhost:9393/api';

export interface Project {
  id: number;
  repo_url: string;
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  last_commit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: number;
  project_id: number;
  status: 'active' | 'stopped';
  claude_session_id: string | null;
  buy_price: number;
  token_cost: number;
  started_at: string;
  stopped_at: string | null;
}

export const api = {
  // Projects
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    return res.json();
  },

  async getProject(id: number): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    return res.json();
  },

  async addProject(repoUrl: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_url: repoUrl })
    });
    return res.json();
  },

  async getProjectSnapshots(id: number) {
    const res = await fetch(`${API_BASE}/projects/${id}/snapshots`);
    return res.json();
  },

  // Positions
  async getPositions(): Promise<Position[]> {
    const res = await fetch(`${API_BASE}/positions`);
    return res.json();
  },

  async getActivePositions(): Promise<Position[]> {
    const res = await fetch(`${API_BASE}/positions/active`);
    return res.json();
  },

  async buyPosition(projectId: number): Promise<Position> {
    const res = await fetch(`${API_BASE}/positions/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId })
    });
    return res.json();
  },

  async sellPosition(positionId: number): Promise<void> {
    await fetch(`${API_BASE}/positions/${positionId}/sell`, {
      method: 'POST'
    });
  },

  async getPositionROI(positionId: number): Promise<{ roi: number }> {
    const res = await fetch(`${API_BASE}/positions/${positionId}/roi`);
    return res.json();
  },

  async getPositionPRs(positionId: number) {
    const res = await fetch(`${API_BASE}/positions/${positionId}/prs`);
    return res.json();
  },

  // Notifications
  async getNotifications(unreadOnly: boolean = false) {
    const res = await fetch(`${API_BASE}/notifications?unread=${unreadOnly}`);
    return res.json();
  },

  async markNotificationRead(id: number): Promise<void> {
    await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'POST'
    });
  }
};
```

**Step 4: Create React App component**

Create `src/frontend/App.tsx`:
```typescript
import React, { useState } from 'react';
import { MarketPage } from './pages/MarketPage';
import { PositionsPage } from './pages/PositionsPage';
import { PortfolioPage } from './pages/PortfolioPage';

type Page = 'market' | 'positions' | 'portfolio';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('market');

  return (
    <div>
      <header className="header">
        <div className="container">
          <h1>🚀 GoGetAJob</h1>
          <nav className="nav">
            <a
              className={`nav-link ${currentPage === 'market' ? 'active' : ''}`}
              onClick={() => setCurrentPage('market')}
            >
              市场大厅
            </a>
            <a
              className={`nav-link ${currentPage === 'positions' ? 'active' : ''}`}
              onClick={() => setCurrentPage('positions')}
            >
              持仓管理
            </a>
            <a
              className={`nav-link ${currentPage === 'portfolio' ? 'active' : ''}`}
              onClick={() => setCurrentPage('portfolio')}
            >
              投资组合
            </a>
          </nav>
        </div>
      </header>

      <div className="container">
        {currentPage === 'market' && <MarketPage />}
        {currentPage === 'positions' && <PositionsPage />}
        {currentPage === 'portfolio' && <PortfolioPage />}
      </div>
    </div>
  );
}
```

**Step 5: Create React entry point**

Create `src/frontend/index.tsx`:
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

**Step 6: Create esbuild config**

Create `esbuild.config.mjs`:
```javascript
import esbuild from 'esbuild';
import { watch } from 'fs';

const isWatch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/frontend/index.tsx'],
  bundle: true,
  outfile: 'public/js/bundle.js',
  platform: 'browser',
  target: 'es2020',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts'
  },
  sourcemap: true
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('👀 Watching frontend files...');
} else {
  await esbuild.build(config);
  console.log('✅ Frontend built successfully');
}
```

**Step 7: Update package.json scripts**

Add to `package.json`:
```json
{
  "scripts": {
    "build:frontend": "node esbuild.config.mjs",
    "dev:frontend": "node esbuild.config.mjs --watch",
    "build": "npm run build:backend && npm run build:frontend",
    "dev": "concurrently \"npm:dev:backend\" \"npm:dev:frontend\""
  }
}
```

**Step 8: Create placeholder pages**

Create `src/frontend/pages/MarketPage.tsx`:
```typescript
import React from 'react';

export function MarketPage() {
  return (
    <div className="card">
      <h2 className="card-title">市场大厅</h2>
      <p style={{ color: '#888' }}>项目列表将在这里显示...</p>
    </div>
  );
}
```

Create `src/frontend/pages/PositionsPage.tsx`:
```typescript
import React from 'react';

export function PositionsPage() {
  return (
    <div className="card">
      <h2 className="card-title">持仓管理</h2>
      <p style={{ color: '#888' }}>持仓列表将在这里显示...</p>
    </div>
  );
}
```

Create `src/frontend/pages/PortfolioPage.tsx`:
```typescript
import React from 'react';

export function PortfolioPage() {
  return (
    <div className="card">
      <h2 className="card-title">投资组合</h2>
      <p style={{ color: '#888' }}>投资统计将在这里显示...</p>
    </div>
  );
}
```

**Step 9: Build and test**

Run:
```bash
npm run build
npm start
```

Open browser: `http://localhost:9393`
Expected: Should see the app with navigation

**Step 10: Commit**

Use `/codeblend-commit`

---

### Task 8: Market Page - Project List

**Files:**
- Modify: `src/frontend/pages/MarketPage.tsx`
- Create: `src/frontend/components/ProjectList.tsx`
- Create: `src/frontend/components/AddProjectModal.tsx`

**Step 1: Create ProjectList component**

Create `src/frontend/components/ProjectList.tsx`:
```typescript
import React from 'react';
import type { Project } from '../api';

interface Props {
  projects: Project[];
  onBuy: (project: Project) => void;
}

export function ProjectList({ projects, onBuy }: Props) {
  if (projects.length === 0) {
    return <div className="loading">暂无项目，请添加第一个项目</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>项目名称</th>
          <th>语言</th>
          <th>Stars</th>
          <th>Forks</th>
          <th>评分</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {projects.map(project => (
          <tr key={project.id}>
            <td>
              <div>
                <strong>{project.name}</strong>
                {project.description && (
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    {project.description}
                  </div>
                )}
              </div>
            </td>
            <td>{project.language || '-'}</td>
            <td className="price-up">{project.stars.toLocaleString()}</td>
            <td>{project.forks.toLocaleString()}</td>
            <td>{(project.stars + project.forks * 2).toLocaleString()}</td>
            <td>
              <button
                className="btn btn-primary"
                onClick={() => onBuy(project)}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                买入
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Step 2: Create AddProjectModal component**

Create `src/frontend/components/AddProjectModal.tsx`:
```typescript
import React, { useState } from 'react';

interface Props {
  onAdd: (url: string) => Promise<void>;
  onClose: () => void;
}

export function AddProjectModal({ onAdd, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onAdd(url);
      onClose();
    } catch (err: any) {
      setError(err.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '30px',
        minWidth: '400px'
      }}>
        <h3 style={{ marginBottom: '20px' }}>添加项目</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
              GitHub 仓库地址
            </label>
            <input
              className="input"
              type="text"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{ color: '#ff0000', marginBottom: '15px', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '添加中...' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Update MarketPage with functionality**

Modify `src/frontend/pages/MarketPage.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { api, type Project } from '../api';
import { ProjectList } from '../components/ProjectList';
import { AddProjectModal } from '../components/AddProjectModal';

export function MarketPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddProject(url: string) {
    await api.addProject(url);
    await loadProjects();
  }

  async function handleBuyProject(project: Project) {
    if (!confirm(`确定要买入 ${project.name} 吗？`)) {
      return;
    }

    try {
      await api.buyPosition(project.id);
      alert('买入成功！请在"持仓管理"查看进度');
    } catch (error: any) {
      alert('买入失败: ' + (error.message || '未知错误'));
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 className="card-title" style={{ marginBottom: 0 }}>市场大厅</h2>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            + 添加项目
          </button>
        </div>

        <ProjectList
          projects={projects}
          onBuy={handleBuyProject}
        />
      </div>

      {showAddModal && (
        <AddProjectModal
          onAdd={handleAddProject}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
```

**Step 4: Build and test**

Run:
```bash
npm run build:frontend
```

Test in browser:
1. Click "添加项目"
2. Enter a GitHub URL (e.g., `https://github.com/facebook/react`)
3. Click "添加"
4. Should see project in the list
5. Click "买入" to buy the project

**Step 5: Commit**

Use `/codeblend-commit`

---

### Task 9: Positions Page

**Files:**
- Modify: `src/frontend/pages/PositionsPage.tsx`
- Create: `src/frontend/components/PositionList.tsx`

**Step 1: Create PositionList component**

Create `src/frontend/components/PositionList.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { api, type Position, type Project } from '../api';

interface PositionWithProject extends Position {
  project?: Project;
}

interface Props {
  positions: Position[];
  onSell: (position: Position) => void;
}

export function PositionList({ positions, onSell }: Props) {
  const [enrichedPositions, setEnrichedPositions] = useState<PositionWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjectDetails();
  }, [positions]);

  async function loadProjectDetails() {
    const enriched = await Promise.all(
      positions.map(async (pos) => {
        try {
          const project = await api.getProject(pos.project_id);
          return { ...pos, project };
        } catch (error) {
          return pos;
        }
      })
    );
    setEnrichedPositions(enriched);
    setLoading(false);
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (enrichedPositions.length === 0) {
    return <div className="loading">暂无持仓，请在市场大厅买入项目</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>项目</th>
          <th>状态</th>
          <th>买入价格</th>
          <th>Token 成本</th>
          <th>开始时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {enrichedPositions.map(position => (
          <tr key={position.id}>
            <td>
              {position.project ? (
                <div>
                  <strong>{position.project.name}</strong>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    当前: {position.project.stars} stars
                  </div>
                </div>
              ) : (
                `项目 #${position.project_id}`
              )}
            </td>
            <td>
              {position.status === 'active' ? (
                <span className="price-up">● 活跃</span>
              ) : (
                <span className="price-down">● 已停止</span>
              )}
            </td>
            <td>{position.buy_price.toLocaleString()}</td>
            <td>{position.token_cost.toLocaleString()}</td>
            <td>{new Date(position.started_at).toLocaleDateString()}</td>
            <td>
              {position.status === 'active' ? (
                <button
                  className="btn btn-danger"
                  onClick={() => onSell(position)}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  卖出
                </button>
              ) : (
                <span style={{ color: '#888' }}>-</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**Step 2: Update PositionsPage**

Modify `src/frontend/pages/PositionsPage.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { api, type Position } from '../api';
import { PositionList } from '../components/PositionList';

export function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPositions();
  }, []);

  async function loadPositions() {
    try {
      const data = await api.getPositions();
      setPositions(data);
    } catch (error) {
      console.error('Failed to load positions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSellPosition(position: Position) {
    if (!confirm('确定要卖出这个持仓吗？AI 将停止为该项目贡献。')) {
      return;
    }

    try {
      await api.sellPosition(position.id);
      alert('卖出成功！');
      await loadPositions();
    } catch (error: any) {
      alert('卖出失败: ' + (error.message || '未知错误'));
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="card">
      <h2 className="card-title">持仓管理</h2>
      <PositionList
        positions={positions}
        onSell={handleSellPosition}
      />
    </div>
  );
}
```

**Step 3: Build and test**

Run:
```bash
npm run build:frontend
```

Test in browser:
1. Go to "持仓管理"
2. Should see positions bought from market
3. Click "卖出" to stop contributing

**Step 4: Commit**

Use `/codeblend-commit`

---

### Task 10: Portfolio Page with ROI

**Files:**
- Modify: `src/frontend/pages/PortfolioPage.tsx`

**Step 1: Implement PortfolioPage**

Modify `src/frontend/pages/PortfolioPage.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { api, type Position, type Project } from '../api';

interface PositionStats {
  position: Position;
  project: Project;
  roi: number;
}

export function PortfolioPage() {
  const [stats, setStats] = useState<PositionStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const positions = await api.getPositions();

      const enriched = await Promise.all(
        positions.map(async (pos) => {
          const [project, roiData] = await Promise.all([
            api.getProject(pos.project_id),
            api.getPositionROI(pos.id)
          ]);
          return { position: pos, project, roi: roiData.roi };
        })
      );

      setStats(enriched);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  const totalInvested = stats.reduce((sum, s) => sum + s.position.token_cost, 0);
  const avgROI = stats.length > 0
    ? stats.reduce((sum, s) => sum + s.roi, 0) / stats.length
    : 0;

  return (
    <div>
      <div className="card">
        <h2 className="card-title">投资总览</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>总投入 (Tokens)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {totalInvested.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>持仓数量</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {stats.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>平均 ROI</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }} className={avgROI > 0 ? 'price-up' : avgROI < 0 ? 'price-down' : ''}>
              {avgROI.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">持仓详情</h2>
        {stats.length === 0 ? (
          <div className="loading">暂无数据</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>项目</th>
                <th>买入价格</th>
                <th>当前价格</th>
                <th>Token 成本</th>
                <th>ROI</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ position, project, roi }) => {
                const currentPrice = project.stars + project.forks * 2;
                return (
                  <tr key={position.id}>
                    <td><strong>{project.name}</strong></td>
                    <td>{position.buy_price.toLocaleString()}</td>
                    <td>{currentPrice.toLocaleString()}</td>
                    <td>{position.token_cost.toLocaleString()}</td>
                    <td className={roi > 0 ? 'price-up' : roi < 0 ? 'price-down' : ''}>
                      {roi.toFixed(2)}%
                    </td>
                    <td>
                      {position.status === 'active' ? (
                        <span className="price-up">活跃</span>
                      ) : (
                        <span className="price-down">已停止</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Build and test**

Run:
```bash
npm run build:frontend
```

Test in browser:
1. Go to "投资组合"
2. Should see total stats and position details with ROI

**Step 3: Commit**

Use `/codeblend-commit`

---

## Summary

至此，我们已经完成了 GoGetAJob MVP 的核心框架：

✅ **已完成：**
- 项目脚手架和 TypeScript 配置
- SQLite 数据库和迁移系统
- GitHub API 服务
- 项目管理服务 (CRUD)
- 持仓管理服务 (买入/卖出/ROI 计算)
- Express REST API 服务器
- React 前端框架
- 市场大厅页面（项目列表、添加项目、买入）
- 持仓管理页面（持仓列表、卖出）
- 投资组合页面（ROI 统计、详情）

🚧 **待实现 (Milestone 3)：**
- Work Scheduler（调度 Claude Code 会话）
- GitHub Crawler（定时更新项目数据）
- 通知系统
- K线图可视化 (ECharts)

**当前状态：** 可以手动添加项目、买入/卖出持仓，查看基本的投资数据。AI 自动打工功能需要在 Milestone 3 实现。

---

## DevLog

### 2026-03-13
- 完成需求讨论和设计
- 创建任务目录
- 准备进入实施阶段
