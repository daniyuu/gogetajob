# GoGetAJob v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI-first AI Agent job marketplace that discovers GitHub issues as "jobs" for AI agents to work on.

**Architecture:** CLI tool (Commander.js) backed by SQLite database, with REST API as secondary interface. Core modules: JobDiscovery (find issues), CompanyProfiler (analyze repos), JDParser (structure issues), Accounting (track work).

**Tech Stack:** TypeScript, Node.js 20+, SQLite (better-sqlite3), Commander.js, @octokit/rest, Express.js, Vitest

---

## Phase 1: Project Restructure & Infrastructure

### Task 1: Install New Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install required dependencies**

Run:
```bash
npm install @octokit/rest commander chalk cli-table3
npm install -D vitest @types/cli-table3
```

**Step 2: Verify installation**

Run: `npm ls @octokit/rest commander vitest`
Expected: Shows installed versions

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add commander, octokit, vitest for v3 CLI"
```

---

### Task 2: Create v3 Directory Structure

**Files:**
- Create: `src/v3/cli/index.ts`
- Create: `src/v3/cli/commands/jobs.ts`
- Create: `src/v3/cli/commands/company.ts`
- Create: `src/v3/cli/commands/report.ts`
- Create: `src/v3/cli/commands/config.ts`
- Create: `src/v3/cli/commands/sync.ts`
- Create: `src/v3/core/job-discovery.ts`
- Create: `src/v3/core/company-profiler.ts`
- Create: `src/v3/core/jd-parser.ts`
- Create: `src/v3/core/accounting.ts`
- Create: `src/v3/db/database.ts`
- Create: `src/v3/db/migrations.ts`
- Create: `src/v3/db/schema.ts`
- Create: `src/v3/github/client.ts`
- Create: `bin/gogetajob`

**Step 1: Create directory structure**

Run:
```bash
mkdir -p src/v3/cli/commands src/v3/core src/v3/db src/v3/github src/v3/api/routes bin tests/v3
```

**Step 2: Create placeholder files**

Run:
```bash
echo "// CLI entry point" > src/v3/cli/index.ts
echo "// Jobs commands" > src/v3/cli/commands/jobs.ts
echo "// Company commands" > src/v3/cli/commands/company.ts
echo "// Report commands" > src/v3/cli/commands/report.ts
echo "// Config commands" > src/v3/cli/commands/config.ts
echo "// Sync commands" > src/v3/cli/commands/sync.ts
echo "// Job discovery service" > src/v3/core/job-discovery.ts
echo "// Company profiler service" > src/v3/core/company-profiler.ts
echo "// JD parser service" > src/v3/core/jd-parser.ts
echo "// Accounting service" > src/v3/core/accounting.ts
echo "// Database connection" > src/v3/db/database.ts
echo "// Database migrations" > src/v3/db/migrations.ts
echo "// Type definitions" > src/v3/db/schema.ts
echo "// GitHub API client" > src/v3/github/client.ts
```

**Step 3: Create CLI executable**

Create file `bin/gogetajob`:
```bash
#!/usr/bin/env node
require('../dist/v3/cli/index.js');
```

**Step 4: Make executable**

Run: `chmod +x bin/gogetajob`

**Step 5: Commit**

```bash
git add src/v3 bin tests/v3
git commit -m "scaffold: create v3 directory structure for CLI-first architecture"
```

---

### Task 3: Create TypeScript Types (Schema)

**Files:**
- Create: `src/v3/db/schema.ts`
- Test: `tests/v3/db/schema.test.ts`

**Step 1: Write the type definitions**

Create file `src/v3/db/schema.ts`:
```typescript
// Company (GitHub Repo)
export interface Company {
  id: number;
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues_count: number;
  pr_merge_rate: number;
  avg_response_hours: number;
  last_commit_at: string | null;
  is_active: boolean;
  maintainer_style: 'friendly' | 'strict' | 'abandoned' | 'unknown';
  has_cla: boolean;
  has_contributing_guide: boolean;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Job (GitHub Issue)
export type JobType = 'bug_fix' | 'feature' | 'docs' | 'test' | 'refactor' | 'other';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'unknown';
export type JobStatus = 'open' | 'taken' | 'completed' | 'closed';

export interface Job {
  id: number;
  company_id: number;
  issue_number: number;
  title: string;
  body: string;
  labels: string[];
  html_url: string;
  job_type: JobType;
  difficulty: Difficulty;
  languages: string[];
  estimated_tokens: number;
  context_files: string[];
  has_bounty: boolean;
  bounty_amount: number | null;
  bounty_currency: string | null;
  merge_probability: number;
  status: JobStatus;
  parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Work Report
export type WorkStatus = 'in_progress' | 'pr_submitted' | 'pr_merged' | 'pr_closed' | 'abandoned';

export interface WorkReport {
  id: number;
  job_id: number;
  agent_id: string;
  status: WorkStatus;
  pr_number: number | null;
  pr_url: string | null;
  token_cost: number;
  started_at: string;
  pr_submitted_at: string | null;
  completed_at: string | null;
}

// Agent Profile
export interface AgentProfile {
  id: string;
  total_jobs: number;
  completed_jobs: number;
  total_prs: number;
  merged_prs: number;
  total_token_cost: number;
  top_languages: string[];
  top_job_types: string[];
  created_at: string;
  updated_at: string;
}

// Blacklist entry
export interface BlacklistEntry {
  id: number;
  owner: string;
  repo: string | null;
  reason: string | null;
  created_at: string;
}

// Config
export interface Config {
  github_token: string | null;
  agent_id: string;
  sync_interval: number;
  api_port: number;
}

// Query options
export interface JobQueryOptions {
  lang?: string;
  type?: JobType;
  difficulty?: Difficulty;
  min_merge_rate?: number;
  has_bounty?: boolean;
  limit?: number;
  sort?: 'bounty' | 'merge_rate' | 'difficulty' | 'newest';
}
```

**Step 2: Write type test**

Create file `tests/v3/db/schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { Company, Job, WorkReport, AgentProfile, JobType, Difficulty } from '../../../src/v3/db/schema';

describe('Schema Types', () => {
  it('Company type has required fields', () => {
    const company: Company = {
      id: 1,
      owner: 'facebook',
      repo: 'react',
      description: 'A JavaScript library',
      language: 'JavaScript',
      stars: 220000,
      forks: 45000,
      open_issues_count: 1200,
      pr_merge_rate: 0.72,
      avg_response_hours: 48,
      last_commit_at: '2026-03-13T10:00:00Z',
      is_active: true,
      maintainer_style: 'strict',
      has_cla: true,
      has_contributing_guide: true,
      analyzed_at: '2026-03-14T08:00:00Z',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-14T08:00:00Z',
    };
    expect(company.owner).toBe('facebook');
    expect(company.maintainer_style).toBe('strict');
  });

  it('Job type has required fields', () => {
    const job: Job = {
      id: 1,
      company_id: 1,
      issue_number: 12345,
      title: 'Fix memory leak',
      body: 'Description here',
      labels: ['bug', 'good-first-issue'],
      html_url: 'https://github.com/facebook/react/issues/12345',
      job_type: 'bug_fix',
      difficulty: 'medium',
      languages: ['TypeScript'],
      estimated_tokens: 50000,
      context_files: ['src/hooks/useEffect.ts'],
      has_bounty: false,
      bounty_amount: null,
      bounty_currency: null,
      merge_probability: 0.72,
      status: 'open',
      parsed_at: '2026-03-14T08:00:00Z',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-14T08:00:00Z',
    };
    expect(job.job_type).toBe('bug_fix');
    expect(job.difficulty).toBe('medium');
  });

  it('JobType literal union is correct', () => {
    const types: JobType[] = ['bug_fix', 'feature', 'docs', 'test', 'refactor', 'other'];
    expect(types).toHaveLength(6);
  });

  it('Difficulty literal union is correct', () => {
    const levels: Difficulty[] = ['easy', 'medium', 'hard', 'unknown'];
    expect(levels).toHaveLength(4);
  });
});
```

**Step 3: Add vitest config**

Create file `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 4: Add test script to package.json**

Add to package.json scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/v3/db/schema.test.ts`
Expected: PASS (type-only tests)

**Step 6: Commit**

```bash
git add src/v3/db/schema.ts tests/v3/db/schema.test.ts vitest.config.ts package.json
git commit -m "feat(v3): add TypeScript type definitions for v3 schema"
```

---

### Task 4: Implement Database Module

**Files:**
- Create: `src/v3/db/database.ts`
- Create: `src/v3/db/migrations.ts`
- Test: `tests/v3/db/database.test.ts`

**Step 1: Write the failing test**

Create file `tests/v3/db/database.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../../src/v3/db/database';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-gogetajob.db');

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    // Clean up before each test
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    db = new Database(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  it('creates database file', () => {
    expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
  });

  it('runs migrations and creates tables', () => {
    db.runMigrations();

    // Check companies table exists
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='companies'"
    );
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('companies');
  });

  it('can insert and query companies', () => {
    db.runMigrations();

    db.run(`
      INSERT INTO companies (owner, repo, stars, forks)
      VALUES (?, ?, ?, ?)
    `, ['facebook', 'react', 220000, 45000]);

    const companies = db.query<{ owner: string; repo: string; stars: number }>(
      'SELECT owner, repo, stars FROM companies WHERE owner = ?',
      ['facebook']
    );

    expect(companies).toHaveLength(1);
    expect(companies[0].owner).toBe('facebook');
    expect(companies[0].stars).toBe(220000);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/v3/db/database.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write database implementation**

Create file `src/v3/db/database.ts`:
```typescript
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'gogetajob-v3.db');

export class Database {
  private db: BetterSqlite3.Database;
  private dbPath: string;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;

    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
  }

  runMigrations(): void {
    // Companies table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        description TEXT,
        language TEXT,
        stars INTEGER DEFAULT 0,
        forks INTEGER DEFAULT 0,
        open_issues_count INTEGER DEFAULT 0,
        pr_merge_rate REAL DEFAULT 0,
        avg_response_hours REAL DEFAULT 0,
        last_commit_at TEXT,
        is_active INTEGER DEFAULT 1,
        maintainer_style TEXT DEFAULT 'unknown',
        has_cla INTEGER DEFAULT 0,
        has_contributing_guide INTEGER DEFAULT 0,
        analyzed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(owner, repo)
      )
    `);

    // Jobs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        issue_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        labels TEXT,
        html_url TEXT NOT NULL,
        job_type TEXT DEFAULT 'other',
        difficulty TEXT DEFAULT 'unknown',
        languages TEXT,
        estimated_tokens INTEGER DEFAULT 0,
        context_files TEXT,
        has_bounty INTEGER DEFAULT 0,
        bounty_amount REAL,
        bounty_currency TEXT,
        merge_probability REAL DEFAULT 0.5,
        status TEXT DEFAULT 'open',
        parsed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        UNIQUE(company_id, issue_number)
      )
    `);

    // Work reports table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT DEFAULT 'in_progress',
        pr_number INTEGER,
        pr_url TEXT,
        token_cost INTEGER DEFAULT 0,
        started_at TEXT DEFAULT (datetime('now')),
        pr_submitted_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )
    `);

    // Agent profiles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY,
        total_jobs INTEGER DEFAULT 0,
        completed_jobs INTEGER DEFAULT 0,
        total_prs INTEGER DEFAULT 0,
        merged_prs INTEGER DEFAULT 0,
        total_token_cost INTEGER DEFAULT 0,
        top_languages TEXT,
        top_job_types TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Blacklist table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        repo TEXT,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(owner, repo)
      )
    `);

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);
      CREATE INDEX IF NOT EXISTS idx_work_reports_job ON work_reports(job_id);
      CREATE INDEX IF NOT EXISTS idx_work_reports_agent ON work_reports(agent_id);
    `);

    console.log('✅ v3 database migrations completed');
  }

  query<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  run(sql: string, params: unknown[] = []): BetterSqlite3.RunResult {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  close(): void {
    this.db.close();
  }

  get raw(): BetterSqlite3.Database {
    return this.db;
  }
}

// Singleton instance
let instance: Database | null = null;

export function getDatabase(dbPath?: string): Database {
  if (!instance) {
    instance = new Database(dbPath);
  }
  return instance;
}

export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/v3/db/database.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/v3/db/database.ts tests/v3/db/database.test.ts
git commit -m "feat(v3): implement SQLite database module with migrations"
```

---

### Task 5: Implement GitHub Client

**Files:**
- Create: `src/v3/github/client.ts`
- Test: `tests/v3/github/client.test.ts`

**Step 1: Write the failing test**

Create file `tests/v3/github/client.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { GitHubClient } from '../../../src/v3/github/client';

describe('GitHubClient', () => {
  it('parses owner/repo from URL', () => {
    const client = new GitHubClient();

    expect(client.parseRepoUrl('https://github.com/facebook/react'))
      .toEqual({ owner: 'facebook', repo: 'react' });

    expect(client.parseRepoUrl('https://github.com/vercel/next.js/'))
      .toEqual({ owner: 'vercel', repo: 'next.js' });

    expect(client.parseRepoUrl('github.com/nodejs/node'))
      .toEqual({ owner: 'nodejs', repo: 'node' });
  });

  it('parses owner/repo shorthand', () => {
    const client = new GitHubClient();

    expect(client.parseRepoIdentifier('facebook/react'))
      .toEqual({ owner: 'facebook', repo: 'react' });

    expect(client.parseRepoIdentifier('https://github.com/vercel/next.js'))
      .toEqual({ owner: 'vercel', repo: 'next.js' });
  });

  it('returns null for invalid URL', () => {
    const client = new GitHubClient();

    expect(client.parseRepoUrl('not-a-url')).toBeNull();
    expect(client.parseRepoUrl('https://gitlab.com/foo/bar')).toBeNull();
  });

  it('creates instance with token', () => {
    const client = new GitHubClient('test-token');
    expect(client).toBeInstanceOf(GitHubClient);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/v3/github/client.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write GitHub client implementation**

Create file `src/v3/github/client.ts`:
```typescript
import { Octokit } from '@octokit/rest';

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

export interface GitHubRepoData {
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues_count: number;
  pushed_at: string;
  default_branch: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  assignee: string | null;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  merged_at: string | null;
  created_at: string;
  closed_at: string | null;
}

export class GitHubClient {
  private octokit: Octokit;
  private token: string | null;

  constructor(token?: string) {
    this.token = token || null;
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'GoGetAJob/3.0',
    });
  }

  parseRepoUrl(url: string): RepoIdentifier | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    return {
      owner: match[1],
      repo: match[2].replace(/\/$/, '').replace(/\.git$/, '')
    };
  }

  parseRepoIdentifier(input: string): RepoIdentifier | null {
    // Try URL first
    const fromUrl = this.parseRepoUrl(input);
    if (fromUrl) return fromUrl;

    // Try owner/repo format
    const match = input.match(/^([^\/]+)\/([^\/]+)$/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  async fetchRepo(owner: string, repo: string): Promise<GitHubRepoData> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return {
      owner: data.owner.login,
      repo: data.name,
      description: data.description,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      open_issues_count: data.open_issues_count,
      pushed_at: data.pushed_at || '',
      default_branch: data.default_branch,
    };
  }

  async fetchIssues(
    owner: string,
    repo: string,
    options: { state?: 'open' | 'closed' | 'all'; labels?: string; per_page?: number } = {}
  ): Promise<GitHubIssue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state: options.state || 'open',
      labels: options.labels,
      per_page: options.per_page || 100,
    });

    return data
      .filter((issue) => !issue.pull_request) // Exclude PRs
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
        html_url: issue.html_url,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        assignee: issue.assignee?.login || null,
      }));
  }

  async fetchPullRequests(
    owner: string,
    repo: string,
    options: { state?: 'open' | 'closed' | 'all'; per_page?: number } = {}
  ): Promise<GitHubPR[]> {
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state: options.state || 'all',
      per_page: options.per_page || 100,
    });

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged_at !== null,
      merged_at: pr.merged_at,
      created_at: pr.created_at,
      closed_at: pr.closed_at,
    }));
  }

  async checkFileExists(owner: string, repo: string, path: string): Promise<boolean> {
    try {
      await this.octokit.repos.getContent({ owner, repo, path });
      return true;
    } catch {
      return false;
    }
  }

  async fetchFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({ owner, repo, path });
      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/v3/github/client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/v3/github/client.ts tests/v3/github/client.test.ts
git commit -m "feat(v3): implement GitHub API client with Octokit"
```

---

## Phase 2: Core Services

### Task 6: Implement CompanyProfiler

**Files:**
- Create: `src/v3/core/company-profiler.ts`
- Test: `tests/v3/core/company-profiler.test.ts`

**Step 1: Write the failing test**

Create file `tests/v3/core/company-profiler.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { CompanyProfiler } from '../../../src/v3/core/company-profiler';
import type { GitHubPR } from '../../../src/v3/github/client';

describe('CompanyProfiler', () => {
  describe('calculateMergeRate', () => {
    it('calculates merge rate from PRs', () => {
      const profiler = new CompanyProfiler();

      const prs: GitHubPR[] = [
        { number: 1, title: 'PR1', state: 'closed', merged: true, merged_at: '2026-01-01', created_at: '2026-01-01', closed_at: '2026-01-01' },
        { number: 2, title: 'PR2', state: 'closed', merged: true, merged_at: '2026-01-02', created_at: '2026-01-02', closed_at: '2026-01-02' },
        { number: 3, title: 'PR3', state: 'closed', merged: false, merged_at: null, created_at: '2026-01-03', closed_at: '2026-01-03' },
        { number: 4, title: 'PR4', state: 'open', merged: false, merged_at: null, created_at: '2026-01-04', closed_at: null },
      ];

      // 2 merged out of 3 closed = 0.67
      const rate = profiler.calculateMergeRateFromPRs(prs);
      expect(rate).toBeCloseTo(0.67, 1);
    });

    it('returns 0 for no closed PRs', () => {
      const profiler = new CompanyProfiler();
      const prs: GitHubPR[] = [];
      expect(profiler.calculateMergeRateFromPRs(prs)).toBe(0);
    });
  });

  describe('inferMaintainerStyle', () => {
    it('returns friendly for high merge rate and fast response', () => {
      const profiler = new CompanyProfiler();
      expect(profiler.inferMaintainerStyle(0.8, 24)).toBe('friendly');
    });

    it('returns strict for high merge rate but slow response', () => {
      const profiler = new CompanyProfiler();
      expect(profiler.inferMaintainerStyle(0.7, 120)).toBe('strict');
    });

    it('returns abandoned for no recent activity', () => {
      const profiler = new CompanyProfiler();
      expect(profiler.inferMaintainerStyle(0.1, 0)).toBe('abandoned');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/v3/core/company-profiler.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write CompanyProfiler implementation**

Create file `src/v3/core/company-profiler.ts`:
```typescript
import { GitHubClient, GitHubPR, GitHubRepoData } from '../github/client';
import { Company } from '../db/schema';
import { Database } from '../db/database';

export type MaintainerStyle = 'friendly' | 'strict' | 'abandoned' | 'unknown';

export interface CompanyProfile {
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues_count: number;
  pr_merge_rate: number;
  avg_response_hours: number;
  last_commit_at: string | null;
  is_active: boolean;
  maintainer_style: MaintainerStyle;
  has_cla: boolean;
  has_contributing_guide: boolean;
}

export class CompanyProfiler {
  private github: GitHubClient;
  private db: Database | null;

  constructor(github?: GitHubClient, db?: Database) {
    this.github = github || new GitHubClient();
    this.db = db || null;
  }

  calculateMergeRateFromPRs(prs: GitHubPR[]): number {
    const closedPRs = prs.filter((pr) => pr.state === 'closed');
    if (closedPRs.length === 0) return 0;

    const mergedCount = closedPRs.filter((pr) => pr.merged).length;
    return mergedCount / closedPRs.length;
  }

  calculateAvgResponseHours(prs: GitHubPR[]): number {
    const closedPRs = prs.filter((pr) => pr.closed_at);
    if (closedPRs.length === 0) return 0;

    const totalHours = closedPRs.reduce((sum, pr) => {
      const created = new Date(pr.created_at).getTime();
      const closed = new Date(pr.closed_at!).getTime();
      const hours = (closed - created) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);

    return totalHours / closedPRs.length;
  }

  inferMaintainerStyle(mergeRate: number, avgResponseHours: number): MaintainerStyle {
    // Abandoned: very low merge rate
    if (mergeRate < 0.2) return 'abandoned';

    // Friendly: high merge rate and fast response
    if (mergeRate >= 0.6 && avgResponseHours > 0 && avgResponseHours < 72) {
      return 'friendly';
    }

    // Strict: reasonable merge rate but slow response
    if (mergeRate >= 0.5 && avgResponseHours >= 72) {
      return 'strict';
    }

    return 'unknown';
  }

  isRepoActive(lastCommitAt: string | null): boolean {
    if (!lastCommitAt) return false;
    const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
    return new Date(lastCommitAt).getTime() > sixMonthsAgo;
  }

  async analyze(owner: string, repo: string): Promise<CompanyProfile> {
    // Fetch repo data
    const repoData = await this.github.fetchRepo(owner, repo);

    // Fetch recent PRs for analysis
    const prs = await this.github.fetchPullRequests(owner, repo, {
      state: 'all',
      per_page: 100
    });

    const mergeRate = this.calculateMergeRateFromPRs(prs);
    const avgResponseHours = this.calculateAvgResponseHours(prs);
    const maintainerStyle = this.inferMaintainerStyle(mergeRate, avgResponseHours);
    const isActive = this.isRepoActive(repoData.pushed_at);

    // Check for CLA and contributing guide
    const [hasCla, hasContributing] = await Promise.all([
      this.checkForCLA(owner, repo),
      this.checkForContributingGuide(owner, repo),
    ]);

    return {
      owner: repoData.owner,
      repo: repoData.repo,
      description: repoData.description,
      language: repoData.language,
      stars: repoData.stars,
      forks: repoData.forks,
      open_issues_count: repoData.open_issues_count,
      pr_merge_rate: mergeRate,
      avg_response_hours: avgResponseHours,
      last_commit_at: repoData.pushed_at,
      is_active: isActive,
      maintainer_style: maintainerStyle,
      has_cla: hasCla,
      has_contributing_guide: hasContributing,
    };
  }

  private async checkForCLA(owner: string, repo: string): Promise<boolean> {
    const claPaths = ['.github/CLA.md', 'CLA.md', '.github/cla.md', 'cla.md'];
    for (const path of claPaths) {
      if (await this.github.checkFileExists(owner, repo, path)) {
        return true;
      }
    }
    return false;
  }

  private async checkForContributingGuide(owner: string, repo: string): Promise<boolean> {
    const paths = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'contributing.md'];
    for (const path of paths) {
      if (await this.github.checkFileExists(owner, repo, path)) {
        return true;
      }
    }
    return false;
  }

  async saveToDatabase(profile: CompanyProfile): Promise<number> {
    if (!this.db) throw new Error('Database not configured');

    const now = new Date().toISOString();
    const result = this.db.run(`
      INSERT INTO companies (
        owner, repo, description, language, stars, forks, open_issues_count,
        pr_merge_rate, avg_response_hours, last_commit_at, is_active,
        maintainer_style, has_cla, has_contributing_guide, analyzed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner, repo) DO UPDATE SET
        description = excluded.description,
        language = excluded.language,
        stars = excluded.stars,
        forks = excluded.forks,
        open_issues_count = excluded.open_issues_count,
        pr_merge_rate = excluded.pr_merge_rate,
        avg_response_hours = excluded.avg_response_hours,
        last_commit_at = excluded.last_commit_at,
        is_active = excluded.is_active,
        maintainer_style = excluded.maintainer_style,
        has_cla = excluded.has_cla,
        has_contributing_guide = excluded.has_contributing_guide,
        analyzed_at = excluded.analyzed_at,
        updated_at = excluded.updated_at
    `, [
      profile.owner,
      profile.repo,
      profile.description,
      profile.language,
      profile.stars,
      profile.forks,
      profile.open_issues_count,
      profile.pr_merge_rate,
      profile.avg_response_hours,
      profile.last_commit_at,
      profile.is_active ? 1 : 0,
      profile.maintainer_style,
      profile.has_cla ? 1 : 0,
      profile.has_contributing_guide ? 1 : 0,
      now,
      now,
    ]);

    return result.lastInsertRowid as number;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/v3/core/company-profiler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/v3/core/company-profiler.ts tests/v3/core/company-profiler.test.ts
git commit -m "feat(v3): implement CompanyProfiler for repo analysis"
```

---

### Task 7: Implement JDParser

**Files:**
- Create: `src/v3/core/jd-parser.ts`
- Test: `tests/v3/core/jd-parser.test.ts`

**Step 1: Write the failing test**

Create file `tests/v3/core/jd-parser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { JDParser } from '../../../src/v3/core/jd-parser';
import type { GitHubIssue } from '../../../src/v3/github/client';

describe('JDParser', () => {
  const parser = new JDParser();

  describe('inferJobType', () => {
    it('detects bug_fix from labels', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Something is wrong',
        body: 'Description',
        labels: ['bug'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        assignee: null,
      };
      expect(parser.inferJobType(issue)).toBe('bug_fix');
    });

    it('detects bug_fix from title keywords', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Fix memory leak in useEffect',
        body: 'Description',
        labels: [],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        assignee: null,
      };
      expect(parser.inferJobType(issue)).toBe('bug_fix');
    });

    it('detects feature from labels', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Add new component',
        body: 'Description',
        labels: ['enhancement', 'feature-request'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        assignee: null,
      };
      expect(parser.inferJobType(issue)).toBe('feature');
    });

    it('detects docs from labels', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Update README',
        body: 'Description',
        labels: ['documentation'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        assignee: null,
      };
      expect(parser.inferJobType(issue)).toBe('docs');
    });
  });

  describe('inferDifficulty', () => {
    it('returns easy for good-first-issue label', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Simple task',
        body: 'Short description',
        labels: ['good-first-issue'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        assignee: null,
      };
      expect(parser.inferDifficulty(issue)).toBe('easy');
    });

    it('returns hard for long body', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Complex task',
        body: 'A'.repeat(1500),
        labels: [],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        assignee: null,
      };
      expect(parser.inferDifficulty(issue)).toBe('hard');
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens based on difficulty', () => {
      expect(parser.estimateTokens('easy')).toBeGreaterThanOrEqual(10000);
      expect(parser.estimateTokens('easy')).toBeLessThanOrEqual(30000);

      expect(parser.estimateTokens('medium')).toBeGreaterThanOrEqual(30000);
      expect(parser.estimateTokens('medium')).toBeLessThanOrEqual(80000);

      expect(parser.estimateTokens('hard')).toBeGreaterThanOrEqual(80000);
      expect(parser.estimateTokens('hard')).toBeLessThanOrEqual(200000);
    });
  });

  describe('extractContextFiles', () => {
    it('extracts file paths from issue body', () => {
      const body = `
        The bug is in src/hooks/useEffect.ts
        Also check out components/Button.tsx
        See the error in \`lib/utils.js\`
      `;
      const files = parser.extractContextFiles(body);
      expect(files).toContain('src/hooks/useEffect.ts');
      expect(files).toContain('components/Button.tsx');
      expect(files).toContain('lib/utils.js');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/v3/core/jd-parser.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write JDParser implementation**

Create file `src/v3/core/jd-parser.ts`:
```typescript
import { GitHubIssue } from '../github/client';
import { Job, JobType, Difficulty } from '../db/schema';

export interface ParsedJob {
  issue_number: number;
  title: string;
  body: string;
  labels: string[];
  html_url: string;
  job_type: JobType;
  difficulty: Difficulty;
  languages: string[];
  estimated_tokens: number;
  context_files: string[];
  has_bounty: boolean;
  bounty_amount: number | null;
  bounty_currency: string | null;
  merge_probability: number;
}

export class JDParser {
  private bugLabels = ['bug', 'fix', 'defect', 'error', 'crash'];
  private featureLabels = ['enhancement', 'feature', 'feature-request', 'improvement'];
  private docsLabels = ['documentation', 'docs', 'readme'];
  private testLabels = ['test', 'testing', 'coverage'];
  private refactorLabels = ['refactor', 'cleanup', 'tech-debt', 'technical-debt'];
  private easyLabels = ['good-first-issue', 'good first issue', 'beginner', 'easy', 'starter'];

  inferJobType(issue: GitHubIssue): JobType {
    const labels = issue.labels.map((l) => l.toLowerCase());
    const title = issue.title.toLowerCase();

    // Check labels first
    if (labels.some((l) => this.bugLabels.some((bl) => l.includes(bl)))) {
      return 'bug_fix';
    }
    if (labels.some((l) => this.featureLabels.some((fl) => l.includes(fl)))) {
      return 'feature';
    }
    if (labels.some((l) => this.docsLabels.some((dl) => l.includes(dl)))) {
      return 'docs';
    }
    if (labels.some((l) => this.testLabels.some((tl) => l.includes(tl)))) {
      return 'test';
    }
    if (labels.some((l) => this.refactorLabels.some((rl) => l.includes(rl)))) {
      return 'refactor';
    }

    // Check title keywords
    if (/\b(fix|bug|error|crash|broken)\b/i.test(title)) {
      return 'bug_fix';
    }
    if (/\b(add|implement|feature|new)\b/i.test(title)) {
      return 'feature';
    }
    if (/\b(doc|readme|documentation)\b/i.test(title)) {
      return 'docs';
    }
    if (/\b(test|spec|coverage)\b/i.test(title)) {
      return 'test';
    }
    if (/\b(refactor|cleanup|clean up)\b/i.test(title)) {
      return 'refactor';
    }

    return 'other';
  }

  inferDifficulty(issue: GitHubIssue): Difficulty {
    const labels = issue.labels.map((l) => l.toLowerCase());
    const bodyLength = (issue.body || '').length;

    // Easy labels
    if (labels.some((l) => this.easyLabels.some((el) => l.includes(el)))) {
      return 'easy';
    }

    // Hard indicators
    if (labels.some((l) => l.includes('complex') || l.includes('hard'))) {
      return 'hard';
    }

    // Body length heuristic
    if (bodyLength > 1000) {
      return 'hard';
    }
    if (bodyLength > 300) {
      return 'medium';
    }

    return 'unknown';
  }

  estimateTokens(difficulty: Difficulty): number {
    const ranges: Record<Difficulty, [number, number]> = {
      easy: [10000, 30000],
      medium: [30000, 80000],
      hard: [80000, 200000],
      unknown: [30000, 80000],
    };

    const [min, max] = ranges[difficulty];
    return Math.floor((min + max) / 2);
  }

  extractContextFiles(body: string | null): string[] {
    if (!body) return [];

    const patterns = [
      /(?:^|\s|`)([\w\-./]+\.[a-z]{2,4})(?:\s|$|`)/gim,
      /(?:in|at|see|check)\s+[`"]?([\w\-./]+\.[a-z]{2,4})[`"]?/gim,
    ];

    const files = new Set<string>();
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const file = match[1];
        // Filter out common non-file matches
        if (
          file.includes('/') &&
          !file.startsWith('http') &&
          !file.includes('@') &&
          /\.(ts|tsx|js|jsx|py|rb|go|rs|java|c|cpp|h|css|scss|json|yaml|yml|md)$/i.test(file)
        ) {
          files.add(file);
        }
      }
    }

    return Array.from(files);
  }

  detectBounty(issue: GitHubIssue): { has_bounty: boolean; amount: number | null; currency: string | null } {
    const text = `${issue.title} ${issue.body || ''}`;

    // Common bounty patterns
    const patterns = [
      /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:bounty|reward)?/i,
      /bounty[:\s]+\$?(\d+)/i,
      /(\d+)\s*(?:USD|usd|dollars?)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        return { has_bounty: true, amount, currency: 'USD' };
      }
    }

    // Check for bounty label
    if (issue.labels.some((l) => l.toLowerCase().includes('bounty'))) {
      return { has_bounty: true, amount: null, currency: null };
    }

    return { has_bounty: false, amount: null, currency: null };
  }

  predictMergeProbability(issue: GitHubIssue, companyMergeRate: number): number {
    let probability = companyMergeRate;

    // Adjust based on issue characteristics
    const labels = issue.labels.map((l) => l.toLowerCase());

    // Good first issues are more likely to be merged
    if (labels.some((l) => this.easyLabels.some((el) => l.includes(el)))) {
      probability = Math.min(1, probability + 0.1);
    }

    // Help wanted issues are explicitly seeking contributions
    if (labels.some((l) => l.includes('help wanted') || l.includes('help-wanted'))) {
      probability = Math.min(1, probability + 0.1);
    }

    // Issues with bounties are more committed
    if (labels.some((l) => l.includes('bounty'))) {
      probability = Math.min(1, probability + 0.15);
    }

    return Math.round(probability * 100) / 100;
  }

  parse(issue: GitHubIssue, companyMergeRate: number = 0.5): ParsedJob {
    const jobType = this.inferJobType(issue);
    const difficulty = this.inferDifficulty(issue);
    const bounty = this.detectBounty(issue);

    return {
      issue_number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels,
      html_url: issue.html_url,
      job_type: jobType,
      difficulty,
      languages: [], // Will be populated from company data
      estimated_tokens: this.estimateTokens(difficulty),
      context_files: this.extractContextFiles(issue.body),
      has_bounty: bounty.has_bounty,
      bounty_amount: bounty.amount,
      bounty_currency: bounty.currency,
      merge_probability: this.predictMergeProbability(issue, companyMergeRate),
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/v3/core/jd-parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/v3/core/jd-parser.ts tests/v3/core/jd-parser.test.ts
git commit -m "feat(v3): implement JDParser for issue-to-job conversion"
```

---

### Task 8: Implement JobDiscovery

**Files:**
- Create: `src/v3/core/job-discovery.ts`
- Test: `tests/v3/core/job-discovery.test.ts`

**Step 1: Write the failing test**

Create file `tests/v3/core/job-discovery.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { JobDiscovery } from '../../../src/v3/core/job-discovery';
import type { GitHubIssue } from '../../../src/v3/github/client';

describe('JobDiscovery', () => {
  const discovery = new JobDiscovery();

  describe('isSuitableIssue', () => {
    it('accepts issues with good-first-issue label', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Test',
        body: 'Description',
        labels: ['good-first-issue'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assignee: null,
      };
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with help-wanted label', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Test',
        body: 'Description',
        labels: ['help-wanted'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assignee: null,
      };
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('rejects assigned issues', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Test',
        body: 'Description',
        labels: ['good-first-issue'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assignee: 'someone',
      };
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('rejects closed issues', () => {
      const issue: GitHubIssue = {
        number: 1,
        title: 'Test',
        body: 'Description',
        labels: ['good-first-issue'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'closed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assignee: null,
      };
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('rejects stale issues (> 30 days old)', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      const issue: GitHubIssue = {
        number: 1,
        title: 'Test',
        body: 'Description',
        labels: ['good-first-issue'],
        html_url: 'https://github.com/test/repo/issues/1',
        state: 'open',
        created_at: oldDate.toISOString(),
        updated_at: oldDate.toISOString(),
        assignee: null,
      };
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });
  });

  describe('filterSuitableIssues', () => {
    it('filters out unsuitable issues', () => {
      const issues: GitHubIssue[] = [
        {
          number: 1,
          title: 'Good issue',
          body: 'Description',
          labels: ['good-first-issue'],
          html_url: 'https://github.com/test/repo/issues/1',
          state: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          assignee: null,
        },
        {
          number: 2,
          title: 'Assigned issue',
          body: 'Description',
          labels: ['good-first-issue'],
          html_url: 'https://github.com/test/repo/issues/2',
          state: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          assignee: 'someone',
        },
      ];

      const suitable = discovery.filterSuitableIssues(issues);
      expect(suitable).toHaveLength(1);
      expect(suitable[0].number).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/v3/core/job-discovery.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write JobDiscovery implementation**

Create file `src/v3/core/job-discovery.ts`:
```typescript
import { GitHubClient, GitHubIssue } from '../github/client';
import { JDParser, ParsedJob } from './jd-parser';
import { Database } from '../db/database';
import { Job, Company } from '../db/schema';

export class JobDiscovery {
  private github: GitHubClient;
  private parser: JDParser;
  private db: Database | null;
  private suitableLabels: string[];
  private maxAgeDays: number;

  constructor(github?: GitHubClient, db?: Database) {
    this.github = github || new GitHubClient();
    this.parser = new JDParser();
    this.db = db || null;
    this.suitableLabels = [
      'good-first-issue',
      'good first issue',
      'help-wanted',
      'help wanted',
      'bug',
      'documentation',
      'enhancement',
      'beginner',
      'starter',
      'easy',
    ];
    this.maxAgeDays = 30;
  }

  isSuitableIssue(issue: GitHubIssue): boolean {
    // Must be open
    if (issue.state !== 'open') return false;

    // Must not be assigned
    if (issue.assignee) return false;

    // Must have suitable labels
    const hasLabel = issue.labels.some((l) =>
      this.suitableLabels.some((sl) => l.toLowerCase().includes(sl.toLowerCase()))
    );
    if (!hasLabel) return false;

    // Must be recently updated
    const updatedAt = new Date(issue.updated_at);
    const maxAge = new Date();
    maxAge.setDate(maxAge.getDate() - this.maxAgeDays);
    if (updatedAt < maxAge) return false;

    return true;
  }

  filterSuitableIssues(issues: GitHubIssue[]): GitHubIssue[] {
    return issues.filter((issue) => this.isSuitableIssue(issue));
  }

  async discoverFromRepo(owner: string, repo: string): Promise<ParsedJob[]> {
    // Check blacklist
    if (this.db && this.isBlacklisted(owner, repo)) {
      console.log(`⚠️ Skipping blacklisted repo: ${owner}/${repo}`);
      return [];
    }

    // Fetch issues
    const issues = await this.github.fetchIssues(owner, repo, {
      state: 'open',
      per_page: 100
    });

    // Filter suitable issues
    const suitable = this.filterSuitableIssues(issues);

    // Get company merge rate for prediction
    let mergeRate = 0.5;
    if (this.db) {
      const company = this.db.queryOne<Company>(
        'SELECT pr_merge_rate FROM companies WHERE owner = ? AND repo = ?',
        [owner, repo]
      );
      if (company) {
        mergeRate = company.pr_merge_rate;
      }
    }

    // Parse issues into jobs
    return suitable.map((issue) => this.parser.parse(issue, mergeRate));
  }

  async discoverFromRepos(repos: Array<{ owner: string; repo: string }>): Promise<ParsedJob[]> {
    const allJobs: ParsedJob[] = [];

    for (const { owner, repo } of repos) {
      try {
        const jobs = await this.discoverFromRepo(owner, repo);
        allJobs.push(...jobs);
      } catch (error) {
        console.error(`Failed to discover jobs from ${owner}/${repo}:`, error);
      }
    }

    return allJobs;
  }

  private isBlacklisted(owner: string, repo: string): boolean {
    if (!this.db) return false;

    const entry = this.db.queryOne<{ id: number }>(
      'SELECT id FROM blacklist WHERE owner = ? AND (repo = ? OR repo IS NULL)',
      [owner, repo]
    );
    return !!entry;
  }

  async saveJobsToDatabase(companyId: number, jobs: ParsedJob[]): Promise<number[]> {
    if (!this.db) throw new Error('Database not configured');

    const ids: number[] = [];
    const now = new Date().toISOString();

    for (const job of jobs) {
      const result = this.db.run(`
        INSERT INTO jobs (
          company_id, issue_number, title, body, labels, html_url,
          job_type, difficulty, languages, estimated_tokens, context_files,
          has_bounty, bounty_amount, bounty_currency, merge_probability,
          status, parsed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(company_id, issue_number) DO UPDATE SET
          title = excluded.title,
          body = excluded.body,
          labels = excluded.labels,
          job_type = excluded.job_type,
          difficulty = excluded.difficulty,
          estimated_tokens = excluded.estimated_tokens,
          context_files = excluded.context_files,
          has_bounty = excluded.has_bounty,
          bounty_amount = excluded.bounty_amount,
          bounty_currency = excluded.bounty_currency,
          merge_probability = excluded.merge_probability,
          parsed_at = excluded.parsed_at,
          updated_at = excluded.updated_at
      `, [
        companyId,
        job.issue_number,
        job.title,
        job.body,
        JSON.stringify(job.labels),
        job.html_url,
        job.job_type,
        job.difficulty,
        JSON.stringify(job.languages),
        job.estimated_tokens,
        JSON.stringify(job.context_files),
        job.has_bounty ? 1 : 0,
        job.bounty_amount,
        job.bounty_currency,
        job.merge_probability,
        'open',
        now,
        now,
      ]);

      ids.push(result.lastInsertRowid as number);
    }

    return ids;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/v3/core/job-discovery.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/v3/core/job-discovery.ts tests/v3/core/job-discovery.test.ts
git commit -m "feat(v3): implement JobDiscovery for finding suitable GitHub issues"
```

---

### Task 9: Implement Accounting

**Files:**
- Create: `src/v3/core/accounting.ts`
- Test: `tests/v3/core/accounting.test.ts`

**Step 1: Write the failing test**

Create file `tests/v3/core/accounting.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Accounting } from '../../../src/v3/core/accounting';
import { Database } from '../../../src/v3/db/database';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-accounting.db');

describe('Accounting', () => {
  let db: Database;
  let accounting: Accounting;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    db = new Database(TEST_DB_PATH);
    db.runMigrations();
    accounting = new Accounting(db);

    // Insert test company and job
    db.run(`INSERT INTO companies (owner, repo) VALUES (?, ?)`, ['test', 'repo']);
    db.run(`
      INSERT INTO jobs (company_id, issue_number, title, html_url)
      VALUES (?, ?, ?, ?)
    `, [1, 123, 'Test Job', 'https://github.com/test/repo/issues/123']);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('startWork', () => {
    it('creates a work report', () => {
      const report = accounting.startWork(1, 'agent-1');

      expect(report.id).toBe(1);
      expect(report.job_id).toBe(1);
      expect(report.agent_id).toBe('agent-1');
      expect(report.status).toBe('in_progress');
    });
  });

  describe('updateTokenCost', () => {
    it('updates token cost on work report', () => {
      accounting.startWork(1, 'agent-1');
      accounting.updateTokenCost(1, 5000);

      const report = db.queryOne<{ token_cost: number }>(
        'SELECT token_cost FROM work_reports WHERE id = ?',
        [1]
      );
      expect(report?.token_cost).toBe(5000);
    });
  });

  describe('completeWork', () => {
    it('marks work as completed', () => {
      accounting.startWork(1, 'agent-1');
      accounting.completeWork(1, 'pr_merged', 10000);

      const report = db.queryOne<{ status: string; token_cost: number }>(
        'SELECT status, token_cost FROM work_reports WHERE id = ?',
        [1]
      );
      expect(report?.status).toBe('pr_merged');
      expect(report?.token_cost).toBe(10000);
    });
  });

  describe('getAgentStats', () => {
    it('calculates agent statistics', () => {
      // Create multiple work reports
      accounting.startWork(1, 'agent-1');
      accounting.completeWork(1, 'pr_merged', 10000);

      // Insert another job
      db.run(`
        INSERT INTO jobs (company_id, issue_number, title, html_url)
        VALUES (?, ?, ?, ?)
      `, [1, 124, 'Test Job 2', 'https://github.com/test/repo/issues/124']);

      accounting.startWork(2, 'agent-1');
      accounting.completeWork(2, 'pr_closed', 5000);

      const stats = accounting.getAgentStats('agent-1');

      expect(stats.total_jobs).toBe(2);
      expect(stats.completed_jobs).toBe(2);
      expect(stats.merged_prs).toBe(1);
      expect(stats.total_token_cost).toBe(15000);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/v3/core/accounting.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write Accounting implementation**

Create file `src/v3/core/accounting.ts`:
```typescript
import { Database } from '../db/database';
import { WorkReport, WorkStatus, AgentProfile, JobType } from '../db/schema';

export interface AgentStats {
  agent_id: string;
  total_jobs: number;
  completed_jobs: number;
  total_prs: number;
  merged_prs: number;
  total_token_cost: number;
  success_rate: number;
  avg_token_per_merge: number;
}

export interface ROIReport {
  agent_id: string;
  total_token_cost: number;
  total_jobs: number;
  completed_jobs: number;
  merged_prs: number;
  success_rate: number;
  avg_token_per_merge: number;
  by_job_type: Record<JobType, { count: number; success_rate: number }>;
  by_language: Record<string, { count: number; success_rate: number }>;
}

export class Accounting {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  startWork(jobId: number, agentId: string): WorkReport {
    const result = this.db.run(`
      INSERT INTO work_reports (job_id, agent_id, status)
      VALUES (?, ?, 'in_progress')
    `, [jobId, agentId]);

    // Update job status
    this.db.run(`UPDATE jobs SET status = 'taken' WHERE id = ?`, [jobId]);

    // Ensure agent profile exists
    this.ensureAgentProfile(agentId);

    return {
      id: result.lastInsertRowid as number,
      job_id: jobId,
      agent_id: agentId,
      status: 'in_progress',
      pr_number: null,
      pr_url: null,
      token_cost: 0,
      started_at: new Date().toISOString(),
      pr_submitted_at: null,
      completed_at: null,
    };
  }

  updateTokenCost(reportId: number, tokens: number): void {
    this.db.run(`
      UPDATE work_reports SET token_cost = ? WHERE id = ?
    `, [tokens, reportId]);
  }

  submitPR(reportId: number, prNumber: number, prUrl: string, tokens?: number): void {
    const now = new Date().toISOString();
    this.db.run(`
      UPDATE work_reports
      SET status = 'pr_submitted',
          pr_number = ?,
          pr_url = ?,
          token_cost = COALESCE(?, token_cost),
          pr_submitted_at = ?
      WHERE id = ?
    `, [prNumber, prUrl, tokens, now, reportId]);
  }

  completeWork(reportId: number, status: WorkStatus, tokens?: number): void {
    const now = new Date().toISOString();
    this.db.run(`
      UPDATE work_reports
      SET status = ?,
          token_cost = COALESCE(?, token_cost),
          completed_at = ?
      WHERE id = ?
    `, [status, tokens, now, reportId]);

    // Get report to update job status
    const report = this.db.queryOne<{ job_id: number; agent_id: string }>(
      'SELECT job_id, agent_id FROM work_reports WHERE id = ?',
      [reportId]
    );

    if (report) {
      // Update job status
      const jobStatus = status === 'pr_merged' ? 'completed' :
                       status === 'pr_closed' || status === 'abandoned' ? 'closed' : 'taken';
      this.db.run(`UPDATE jobs SET status = ? WHERE id = ?`, [jobStatus, report.job_id]);

      // Update agent profile
      this.updateAgentProfile(report.agent_id);
    }
  }

  getAgentStats(agentId: string): AgentStats {
    const stats = this.db.queryOne<{
      total_jobs: number;
      completed_jobs: number;
      total_prs: number;
      merged_prs: number;
      total_token_cost: number;
    }>(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status IN ('pr_merged', 'pr_closed', 'abandoned') THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN pr_number IS NOT NULL THEN 1 ELSE 0 END) as total_prs,
        SUM(CASE WHEN status = 'pr_merged' THEN 1 ELSE 0 END) as merged_prs,
        SUM(token_cost) as total_token_cost
      FROM work_reports
      WHERE agent_id = ?
    `, [agentId]);

    const total = stats?.total_jobs || 0;
    const merged = stats?.merged_prs || 0;
    const tokenCost = stats?.total_token_cost || 0;

    return {
      agent_id: agentId,
      total_jobs: total,
      completed_jobs: stats?.completed_jobs || 0,
      total_prs: stats?.total_prs || 0,
      merged_prs: merged,
      total_token_cost: tokenCost,
      success_rate: total > 0 ? merged / total : 0,
      avg_token_per_merge: merged > 0 ? tokenCost / merged : 0,
    };
  }

  calculateROI(agentId: string): ROIReport {
    const stats = this.getAgentStats(agentId);

    // Get breakdown by job type
    const byType = this.db.query<{ job_type: string; count: number; merged: number }>(`
      SELECT
        j.job_type,
        COUNT(*) as count,
        SUM(CASE WHEN wr.status = 'pr_merged' THEN 1 ELSE 0 END) as merged
      FROM work_reports wr
      JOIN jobs j ON wr.job_id = j.id
      WHERE wr.agent_id = ?
      GROUP BY j.job_type
    `, [agentId]);

    const by_job_type: Record<JobType, { count: number; success_rate: number }> = {} as any;
    for (const row of byType) {
      by_job_type[row.job_type as JobType] = {
        count: row.count,
        success_rate: row.count > 0 ? row.merged / row.count : 0,
      };
    }

    // Get breakdown by language
    const byLang = this.db.query<{ language: string; count: number; merged: number }>(`
      SELECT
        c.language,
        COUNT(*) as count,
        SUM(CASE WHEN wr.status = 'pr_merged' THEN 1 ELSE 0 END) as merged
      FROM work_reports wr
      JOIN jobs j ON wr.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE wr.agent_id = ? AND c.language IS NOT NULL
      GROUP BY c.language
    `, [agentId]);

    const by_language: Record<string, { count: number; success_rate: number }> = {};
    for (const row of byLang) {
      if (row.language) {
        by_language[row.language] = {
          count: row.count,
          success_rate: row.count > 0 ? row.merged / row.count : 0,
        };
      }
    }

    return {
      agent_id: agentId,
      total_token_cost: stats.total_token_cost,
      total_jobs: stats.total_jobs,
      completed_jobs: stats.completed_jobs,
      merged_prs: stats.merged_prs,
      success_rate: stats.success_rate,
      avg_token_per_merge: stats.avg_token_per_merge,
      by_job_type,
      by_language,
    };
  }

  private ensureAgentProfile(agentId: string): void {
    this.db.run(`
      INSERT INTO agent_profiles (id)
      VALUES (?)
      ON CONFLICT(id) DO NOTHING
    `, [agentId]);
  }

  private updateAgentProfile(agentId: string): void {
    const stats = this.getAgentStats(agentId);
    const now = new Date().toISOString();

    this.db.run(`
      UPDATE agent_profiles
      SET total_jobs = ?,
          completed_jobs = ?,
          total_prs = ?,
          merged_prs = ?,
          total_token_cost = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      stats.total_jobs,
      stats.completed_jobs,
      stats.total_prs,
      stats.merged_prs,
      stats.total_token_cost,
      now,
      agentId,
    ]);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/v3/core/accounting.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/v3/core/accounting.ts tests/v3/core/accounting.test.ts
git commit -m "feat(v3): implement Accounting service for tracking work and ROI"
```

---

## Phase 3: CLI Implementation

### Task 10: Implement CLI Entry Point and Config Command

**Files:**
- Create: `src/v3/cli/index.ts`
- Create: `src/v3/cli/commands/config.ts`
- Create: `src/v3/config.ts`

**Step 1: Create config module**

Create file `src/v3/config.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.gogetajob');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export interface V3Config {
  github_token: string | null;
  agent_id: string;
  sync_interval: number;
  api_port: number;
}

const DEFAULT_CONFIG: V3Config = {
  github_token: null,
  agent_id: os.hostname(),
  sync_interval: 3600,
  api_port: 9393,
};

export function loadConfig(): V3Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return DEFAULT_CONFIG;
  }

  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<V3Config>): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const current = loadConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
```

**Step 2: Create config command**

Create file `src/v3/cli/commands/config.ts`:
```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigPath } from '../../config';

export function createConfigCommand(): Command {
  const config = new Command('config')
    .description('Configuration management');

  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const cfg = loadConfig();
      console.log(chalk.bold('\nConfiguration:'));
      console.log(`  Config file: ${getConfigPath()}`);
      console.log(`  github_token: ${cfg.github_token ? '***' + cfg.github_token.slice(-4) : chalk.dim('(not set)')}`);
      console.log(`  agent_id: ${cfg.agent_id}`);
      console.log(`  sync_interval: ${cfg.sync_interval}s`);
      console.log(`  api_port: ${cfg.api_port}`);
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const validKeys = ['github_token', 'agent_id', 'sync_interval', 'api_port'];
      if (!validKeys.includes(key)) {
        console.error(chalk.red(`Invalid key: ${key}`));
        console.log(`Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }

      const update: Record<string, unknown> = {};
      if (key === 'sync_interval' || key === 'api_port') {
        update[key] = parseInt(value, 10);
      } else {
        update[key] = value;
      }

      saveConfig(update);
      console.log(chalk.green(`✓ Set ${key} = ${key === 'github_token' ? '***' : value}`));
    });

  config
    .command('init')
    .description('Initialize configuration interactively')
    .action(async () => {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const question = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      console.log(chalk.bold('\nGoGetAJob Configuration\n'));

      const token = await question('GitHub Token (optional): ');
      const agentId = await question(`Agent ID [${require('os').hostname()}]: `);

      rl.close();

      saveConfig({
        github_token: token || null,
        agent_id: agentId || require('os').hostname(),
      });

      console.log(chalk.green('\n✓ Configuration saved!'));
    });

  return config;
}
```

**Step 3: Create CLI entry point**

Create file `src/v3/cli/index.ts`:
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { createConfigCommand } from './commands/config';
import { createJobsCommand } from './commands/jobs';
import { createCompanyCommand } from './commands/company';
import { createReportCommand } from './commands/report';
import { createSyncCommand } from './commands/sync';

const program = new Command();

program
  .name('gogetajob')
  .description('AI Agent Job Marketplace - Find GitHub issues for AI agents to work on')
  .version('3.0.0');

// Register commands
program.addCommand(createConfigCommand());
program.addCommand(createJobsCommand());
program.addCommand(createCompanyCommand());
program.addCommand(createReportCommand());
program.addCommand(createSyncCommand());

// Default action
program.action(() => {
  console.log(chalk.bold('\n🤖 GoGetAJob v3 - AI Agent Job Marketplace\n'));
  console.log('GitHub 上的 Boss直聘 — 不是给人用的，是给 AI Agent 用的。\n');
  program.help();
});

program.parse();
```

**Step 4: Create stub commands for jobs, company, report, sync**

Create file `src/v3/cli/commands/jobs.ts`:
```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDatabase } from '../../db/database';
import { loadConfig } from '../../config';
import type { Job, Company, JobQueryOptions } from '../../db/schema';

export function createJobsCommand(): Command {
  const jobs = new Command('jobs')
    .description('Job opportunity management');

  jobs
    .command('list')
    .description('List available job opportunities')
    .option('-l, --lang <language>', 'Filter by language')
    .option('-t, --type <type>', 'Filter by job type (bug_fix, feature, docs, test, refactor)')
    .option('-d, --difficulty <level>', 'Filter by difficulty (easy, medium, hard)')
    .option('--min-merge-rate <rate>', 'Minimum merge rate (0-1)', parseFloat)
    .option('--has-bounty', 'Only show jobs with bounty')
    .option('--limit <n>', 'Limit results', parseInt, 20)
    .option('--sort <field>', 'Sort by field (bounty, merge_rate, difficulty, newest)')
    .option('-f, --format <fmt>', 'Output format (table, json)', 'table')
    .action((options) => {
      const db = getDatabase();
      db.runMigrations();

      let query = `
        SELECT j.*, c.owner, c.repo, c.stars, c.pr_merge_rate as company_merge_rate
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        WHERE j.status = 'open'
      `;
      const params: unknown[] = [];

      if (options.lang) {
        query += ` AND c.language = ?`;
        params.push(options.lang);
      }
      if (options.type) {
        query += ` AND j.job_type = ?`;
        params.push(options.type);
      }
      if (options.difficulty) {
        query += ` AND j.difficulty = ?`;
        params.push(options.difficulty);
      }
      if (options.minMergeRate) {
        query += ` AND j.merge_probability >= ?`;
        params.push(options.minMergeRate);
      }
      if (options.hasBounty) {
        query += ` AND j.has_bounty = 1`;
      }

      // Sorting
      switch (options.sort) {
        case 'bounty':
          query += ` ORDER BY j.bounty_amount DESC NULLS LAST`;
          break;
        case 'merge_rate':
          query += ` ORDER BY j.merge_probability DESC`;
          break;
        case 'difficulty':
          query += ` ORDER BY CASE j.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 4 END`;
          break;
        default:
          query += ` ORDER BY j.created_at DESC`;
      }

      query += ` LIMIT ?`;
      params.push(options.limit);

      const results = db.query<Job & { owner: string; repo: string; stars: number }>(query, params);

      if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log(chalk.yellow('\nNo jobs found matching criteria.'));
        console.log('Try running: gogetajob sync add <owner/repo>\n');
        return;
      }

      const table = new Table({
        head: ['ID', 'Repo', 'Title', 'Type', 'Difficulty', 'Merge %', 'Bounty'],
        style: { head: ['cyan'] },
      });

      for (const job of results) {
        table.push([
          job.id.toString(),
          `${job.owner}/${job.repo}`,
          job.title.slice(0, 40) + (job.title.length > 40 ? '...' : ''),
          job.job_type,
          job.difficulty,
          `${Math.round(job.merge_probability * 100)}%`,
          job.has_bounty ? `$${job.bounty_amount || '?'}` : '-',
        ]);
      }

      console.log('\n' + table.toString());
      console.log(chalk.dim(`\nShowing ${results.length} jobs. Use --limit to see more.\n`));
    });

  jobs
    .command('show <id>')
    .description('Show job details')
    .action((id: string) => {
      const db = getDatabase();
      db.runMigrations();

      // Support both numeric ID and owner/repo#issue format
      let job: (Job & { owner: string; repo: string }) | undefined;

      if (id.includes('#')) {
        const [repoPath, issueNum] = id.split('#');
        const [owner, repo] = repoPath.split('/');
        job = db.queryOne(`
          SELECT j.*, c.owner, c.repo
          FROM jobs j
          JOIN companies c ON j.company_id = c.id
          WHERE c.owner = ? AND c.repo = ? AND j.issue_number = ?
        `, [owner, repo, parseInt(issueNum)]);
      } else {
        job = db.queryOne(`
          SELECT j.*, c.owner, c.repo
          FROM jobs j
          JOIN companies c ON j.company_id = c.id
          WHERE j.id = ?
        `, [parseInt(id)]);
      }

      if (!job) {
        console.error(chalk.red(`Job not found: ${id}`));
        process.exit(1);
      }

      console.log(chalk.bold(`\n${job.title}\n`));
      console.log(`Repo: ${chalk.cyan(`${job.owner}/${job.repo}`)}`);
      console.log(`Issue: ${chalk.blue(job.html_url)}`);
      console.log(`Type: ${job.job_type}`);
      console.log(`Difficulty: ${job.difficulty}`);
      console.log(`Merge Probability: ${Math.round(job.merge_probability * 100)}%`);
      console.log(`Estimated Tokens: ${job.estimated_tokens.toLocaleString()}`);
      if (job.has_bounty) {
        console.log(`Bounty: ${chalk.green(`$${job.bounty_amount} ${job.bounty_currency}`)}`);
      }
      console.log(`\n${chalk.dim('---')}\n`);
      console.log(job.body || chalk.dim('(no description)'));
      console.log();
    });

  jobs
    .command('apply <id>')
    .description('Apply for a job (mark as taken)')
    .action((id: string) => {
      const db = getDatabase();
      const config = loadConfig();
      db.runMigrations();

      // Import accounting dynamically to avoid circular deps
      const { Accounting } = require('../../core/accounting');
      const accounting = new Accounting(db);

      const jobId = parseInt(id);
      const job = db.queryOne<Job>('SELECT * FROM jobs WHERE id = ?', [jobId]);

      if (!job) {
        console.error(chalk.red(`Job not found: ${id}`));
        process.exit(1);
      }

      const report = accounting.startWork(jobId, config.agent_id);
      console.log(chalk.green(`\n✓ Applied for job #${jobId}`));
      console.log(`Work report ID: ${report.id}`);
      console.log(`Agent: ${config.agent_id}`);
      console.log(`\nGood luck! 🍀\n`);
    });

  return jobs;
}
```

Create file `src/v3/cli/commands/company.ts`:
```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDatabase } from '../../db/database';
import { loadConfig } from '../../config';
import { GitHubClient } from '../../github/client';
import { CompanyProfiler } from '../../core/company-profiler';
import type { Company } from '../../db/schema';

export function createCompanyCommand(): Command {
  const company = new Command('company')
    .description('Company (repository) management');

  company
    .command('info <repo>')
    .description('Show company/repository information')
    .option('-f, --format <fmt>', 'Output format (table, json)', 'table')
    .action(async (repo: string, options) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const github = new GitHubClient(config.github_token || undefined);
      const parsed = github.parseRepoIdentifier(repo);

      if (!parsed) {
        console.error(chalk.red(`Invalid repository: ${repo}`));
        process.exit(1);
      }

      // Check database first
      let companyData = db.queryOne<Company>(
        'SELECT * FROM companies WHERE owner = ? AND repo = ?',
        [parsed.owner, parsed.repo]
      );

      if (!companyData) {
        console.log(chalk.yellow(`Repository not in database. Analyzing...`));
        const profiler = new CompanyProfiler(github, db);
        const profile = await profiler.analyze(parsed.owner, parsed.repo);
        await profiler.saveToDatabase(profile);
        companyData = db.queryOne<Company>(
          'SELECT * FROM companies WHERE owner = ? AND repo = ?',
          [parsed.owner, parsed.repo]
        );
      }

      if (!companyData) {
        console.error(chalk.red(`Failed to load company data`));
        process.exit(1);
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(companyData, null, 2));
        return;
      }

      console.log(chalk.bold(`\n${companyData.owner}/${companyData.repo}\n`));
      console.log(`Description: ${companyData.description || chalk.dim('(none)')}`);
      console.log(`Language: ${companyData.language || chalk.dim('(unknown)')}`);
      console.log(`Stars: ${companyData.stars.toLocaleString()}`);
      console.log(`Forks: ${companyData.forks.toLocaleString()}`);
      console.log(`Open Issues: ${companyData.open_issues_count}`);
      console.log();
      console.log(chalk.bold('Profile:'));
      console.log(`  PR Merge Rate: ${Math.round(companyData.pr_merge_rate * 100)}%`);
      console.log(`  Avg Response: ${Math.round(companyData.avg_response_hours)}h`);
      console.log(`  Active: ${companyData.is_active ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  Maintainer Style: ${companyData.maintainer_style}`);
      console.log(`  Has CLA: ${companyData.has_cla ? 'Yes' : 'No'}`);
      console.log(`  Contributing Guide: ${companyData.has_contributing_guide ? 'Yes' : 'No'}`);
      console.log();
    });

  company
    .command('add <repo>')
    .description('Add a repository to track')
    .action(async (repo: string) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const github = new GitHubClient(config.github_token || undefined);
      const parsed = github.parseRepoIdentifier(repo);

      if (!parsed) {
        console.error(chalk.red(`Invalid repository: ${repo}`));
        process.exit(1);
      }

      console.log(chalk.dim(`Analyzing ${parsed.owner}/${parsed.repo}...`));

      const profiler = new CompanyProfiler(github, db);
      const profile = await profiler.analyze(parsed.owner, parsed.repo);
      const id = await profiler.saveToDatabase(profile);

      console.log(chalk.green(`\n✓ Added ${parsed.owner}/${parsed.repo}`));
      console.log(`  ID: ${id}`);
      console.log(`  Stars: ${profile.stars.toLocaleString()}`);
      console.log(`  Merge Rate: ${Math.round(profile.pr_merge_rate * 100)}%`);
      console.log();
    });

  company
    .command('list')
    .description('List tracked companies')
    .option('--sort <field>', 'Sort by (merge_rate, stars, activity)', 'stars')
    .action((options) => {
      const db = getDatabase();
      db.runMigrations();

      let orderBy = 'stars DESC';
      if (options.sort === 'merge_rate') orderBy = 'pr_merge_rate DESC';
      if (options.sort === 'activity') orderBy = 'last_commit_at DESC';

      const companies = db.query<Company>(`SELECT * FROM companies ORDER BY ${orderBy}`);

      if (companies.length === 0) {
        console.log(chalk.yellow('\nNo companies tracked yet.'));
        console.log('Add one with: gogetajob company add <owner/repo>\n');
        return;
      }

      const table = new Table({
        head: ['ID', 'Repository', 'Stars', 'Merge %', 'Style', 'Active'],
        style: { head: ['cyan'] },
      });

      for (const c of companies) {
        table.push([
          c.id.toString(),
          `${c.owner}/${c.repo}`,
          c.stars.toLocaleString(),
          `${Math.round(c.pr_merge_rate * 100)}%`,
          c.maintainer_style,
          c.is_active ? chalk.green('✓') : chalk.red('✗'),
        ]);
      }

      console.log('\n' + table.toString() + '\n');
    });

  company
    .command('blacklist <repo>')
    .description('Add repository to blacklist')
    .option('-r, --reason <text>', 'Reason for blacklisting')
    .action((repo: string, options) => {
      const db = getDatabase();
      db.runMigrations();

      const github = new GitHubClient();
      const parsed = github.parseRepoIdentifier(repo);

      if (!parsed) {
        console.error(chalk.red(`Invalid repository: ${repo}`));
        process.exit(1);
      }

      db.run(`
        INSERT INTO blacklist (owner, repo, reason)
        VALUES (?, ?, ?)
        ON CONFLICT(owner, repo) DO UPDATE SET reason = excluded.reason
      `, [parsed.owner, parsed.repo, options.reason || null]);

      console.log(chalk.green(`\n✓ Blacklisted ${parsed.owner}/${parsed.repo}`));
      if (options.reason) {
        console.log(`  Reason: ${options.reason}`);
      }
      console.log();
    });

  return company;
}
```

Create file `src/v3/cli/commands/report.ts`:
```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDatabase } from '../../db/database';
import { loadConfig } from '../../config';
import { Accounting } from '../../core/accounting';
import type { WorkReport, Job } from '../../db/schema';

export function createReportCommand(): Command {
  const report = new Command('report')
    .description('Work report management');

  report
    .command('start <job_id>')
    .description('Report starting work on a job')
    .option('-a, --agent <agent_id>', 'Agent identifier')
    .action((jobId: string, options) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();
      const accounting = new Accounting(db);

      const agentId = options.agent || config.agent_id;
      const workReport = accounting.startWork(parseInt(jobId), agentId);

      console.log(chalk.green(`\n✓ Work started`));
      console.log(`  Report ID: ${workReport.id}`);
      console.log(`  Job ID: ${jobId}`);
      console.log(`  Agent: ${agentId}`);
      console.log();
    });

  report
    .command('pr <job_id>')
    .description('Report PR submission')
    .option('--pr <number>', 'PR number', parseInt)
    .option('--tokens <n>', 'Token cost so far', parseInt)
    .action((jobId: string, options) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();
      const accounting = new Accounting(db);

      // Find the work report
      const workReport = db.queryOne<WorkReport>(
        `SELECT * FROM work_reports WHERE job_id = ? AND agent_id = ? AND status = 'in_progress'`,
        [parseInt(jobId), config.agent_id]
      );

      if (!workReport) {
        console.error(chalk.red(`No active work report found for job ${jobId}`));
        process.exit(1);
      }

      if (!options.pr) {
        console.error(chalk.red(`--pr <number> is required`));
        process.exit(1);
      }

      // Get job to construct PR URL
      const job = db.queryOne<Job & { owner: string; repo: string }>(
        `SELECT j.*, c.owner, c.repo FROM jobs j JOIN companies c ON j.company_id = c.id WHERE j.id = ?`,
        [parseInt(jobId)]
      );

      const prUrl = `https://github.com/${job?.owner}/${job?.repo}/pull/${options.pr}`;
      accounting.submitPR(workReport.id, options.pr, prUrl, options.tokens);

      console.log(chalk.green(`\n✓ PR reported`));
      console.log(`  PR: ${prUrl}`);
      if (options.tokens) {
        console.log(`  Tokens: ${options.tokens.toLocaleString()}`);
      }
      console.log();
    });

  report
    .command('done <job_id>')
    .description('Report work completion')
    .option('-s, --status <status>', 'Result status (merged, closed, abandoned)', 'merged')
    .option('--tokens <n>', 'Total token cost', parseInt)
    .action((jobId: string, options) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();
      const accounting = new Accounting(db);

      // Find the work report
      const workReport = db.queryOne<WorkReport>(
        `SELECT * FROM work_reports WHERE job_id = ? AND agent_id = ? AND status IN ('in_progress', 'pr_submitted')`,
        [parseInt(jobId), config.agent_id]
      );

      if (!workReport) {
        console.error(chalk.red(`No active work report found for job ${jobId}`));
        process.exit(1);
      }

      const statusMap: Record<string, string> = {
        merged: 'pr_merged',
        closed: 'pr_closed',
        abandoned: 'abandoned',
      };

      const status = statusMap[options.status] || 'pr_merged';
      accounting.completeWork(workReport.id, status as any, options.tokens);

      console.log(chalk.green(`\n✓ Work completed`));
      console.log(`  Status: ${status}`);
      if (options.tokens) {
        console.log(`  Total Tokens: ${options.tokens.toLocaleString()}`);
      }
      console.log();
    });

  report
    .command('history')
    .description('Show work history')
    .option('-a, --agent <agent_id>', 'Agent identifier')
    .option('--limit <n>', 'Limit results', parseInt, 20)
    .action((options) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const agentId = options.agent || config.agent_id;

      const reports = db.query<WorkReport & { title: string; owner: string; repo: string }>(
        `SELECT wr.*, j.title, c.owner, c.repo
         FROM work_reports wr
         JOIN jobs j ON wr.job_id = j.id
         JOIN companies c ON j.company_id = c.id
         WHERE wr.agent_id = ?
         ORDER BY wr.started_at DESC
         LIMIT ?`,
        [agentId, options.limit]
      );

      if (reports.length === 0) {
        console.log(chalk.yellow(`\nNo work history for agent: ${agentId}\n`));
        return;
      }

      const table = new Table({
        head: ['ID', 'Job', 'Status', 'Tokens', 'Started'],
        style: { head: ['cyan'] },
      });

      for (const r of reports) {
        const statusColor = r.status === 'pr_merged' ? chalk.green :
                          r.status === 'pr_closed' ? chalk.red :
                          r.status === 'in_progress' ? chalk.yellow : chalk.dim;
        table.push([
          r.id.toString(),
          `${r.owner}/${r.repo}#${r.job_id}`,
          statusColor(r.status),
          r.token_cost.toLocaleString(),
          new Date(r.started_at).toLocaleDateString(),
        ]);
      }

      console.log(`\nWork history for ${chalk.cyan(agentId)}:\n`);
      console.log(table.toString() + '\n');

      // Show stats
      const { Accounting } = require('../../core/accounting');
      const accounting = new Accounting(db);
      const stats = accounting.getAgentStats(agentId);

      console.log(chalk.bold('Statistics:'));
      console.log(`  Total Jobs: ${stats.total_jobs}`);
      console.log(`  Merged PRs: ${stats.merged_prs}`);
      console.log(`  Success Rate: ${Math.round(stats.success_rate * 100)}%`);
      console.log(`  Total Tokens: ${stats.total_token_cost.toLocaleString()}`);
      console.log(`  Avg Tokens/Merge: ${Math.round(stats.avg_token_per_merge).toLocaleString()}`);
      console.log();
    });

  return report;
}
```

Create file `src/v3/cli/commands/sync.ts`:
```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { getDatabase } from '../../db/database';
import { loadConfig } from '../../config';
import { GitHubClient } from '../../github/client';
import { CompanyProfiler } from '../../core/company-profiler';
import { JobDiscovery } from '../../core/job-discovery';
import type { Company } from '../../db/schema';

export function createSyncCommand(): Command {
  const sync = new Command('sync')
    .description('Synchronize data from GitHub');

  sync
    .command('all', { isDefault: true })
    .description('Sync all tracked companies and jobs')
    .action(async () => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const github = new GitHubClient(config.github_token || undefined);
      const profiler = new CompanyProfiler(github, db);
      const discovery = new JobDiscovery(github, db);

      const companies = db.query<Company>('SELECT * FROM companies');

      if (companies.length === 0) {
        console.log(chalk.yellow('\nNo companies to sync.'));
        console.log('Add one with: gogetajob company add <owner/repo>\n');
        return;
      }

      console.log(chalk.bold(`\nSyncing ${companies.length} companies...\n`));

      let totalJobs = 0;

      for (const company of companies) {
        try {
          console.log(chalk.dim(`  ${company.owner}/${company.repo}...`));

          // Update company profile
          const profile = await profiler.analyze(company.owner, company.repo);
          await profiler.saveToDatabase(profile);

          // Discover jobs
          const jobs = await discovery.discoverFromRepo(company.owner, company.repo);
          if (jobs.length > 0) {
            await discovery.saveJobsToDatabase(company.id, jobs);
            totalJobs += jobs.length;
            console.log(chalk.green(`    ✓ ${jobs.length} jobs`));
          } else {
            console.log(chalk.dim(`    (no new jobs)`));
          }
        } catch (error: any) {
          console.log(chalk.red(`    ✗ ${error.message}`));
        }
      }

      console.log(chalk.bold(`\n✓ Sync complete. Found ${totalJobs} jobs.\n`));
    });

  sync
    .command('companies')
    .description('Sync only company profiles')
    .action(async () => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const github = new GitHubClient(config.github_token || undefined);
      const profiler = new CompanyProfiler(github, db);

      const companies = db.query<Company>('SELECT * FROM companies');

      console.log(chalk.bold(`\nSyncing ${companies.length} company profiles...\n`));

      for (const company of companies) {
        try {
          console.log(chalk.dim(`  ${company.owner}/${company.repo}...`));
          const profile = await profiler.analyze(company.owner, company.repo);
          await profiler.saveToDatabase(profile);
          console.log(chalk.green(`    ✓`));
        } catch (error: any) {
          console.log(chalk.red(`    ✗ ${error.message}`));
        }
      }

      console.log(chalk.bold(`\n✓ Company sync complete.\n`));
    });

  sync
    .command('jobs')
    .description('Sync only jobs from tracked companies')
    .action(async () => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const github = new GitHubClient(config.github_token || undefined);
      const discovery = new JobDiscovery(github, db);

      const companies = db.query<Company>('SELECT * FROM companies');

      console.log(chalk.bold(`\nSyncing jobs from ${companies.length} companies...\n`));

      let totalJobs = 0;

      for (const company of companies) {
        try {
          console.log(chalk.dim(`  ${company.owner}/${company.repo}...`));
          const jobs = await discovery.discoverFromRepo(company.owner, company.repo);
          if (jobs.length > 0) {
            await discovery.saveJobsToDatabase(company.id, jobs);
            totalJobs += jobs.length;
            console.log(chalk.green(`    ✓ ${jobs.length} jobs`));
          } else {
            console.log(chalk.dim(`    (no new jobs)`));
          }
        } catch (error: any) {
          console.log(chalk.red(`    ✗ ${error.message}`));
        }
      }

      console.log(chalk.bold(`\n✓ Job sync complete. Found ${totalJobs} jobs.\n`));
    });

  sync
    .command('add <repo>')
    .description('Add repository and sync immediately')
    .action(async (repo: string) => {
      const db = getDatabase();
      db.runMigrations();
      const config = loadConfig();

      const github = new GitHubClient(config.github_token || undefined);
      const parsed = github.parseRepoIdentifier(repo);

      if (!parsed) {
        console.error(chalk.red(`Invalid repository: ${repo}`));
        process.exit(1);
      }

      console.log(chalk.dim(`\nAdding and syncing ${parsed.owner}/${parsed.repo}...\n`));

      // Add company
      const profiler = new CompanyProfiler(github, db);
      const profile = await profiler.analyze(parsed.owner, parsed.repo);
      const companyId = await profiler.saveToDatabase(profile);

      console.log(chalk.green(`✓ Company added (ID: ${companyId})`));
      console.log(`  Stars: ${profile.stars.toLocaleString()}`);
      console.log(`  Merge Rate: ${Math.round(profile.pr_merge_rate * 100)}%`);

      // Discover jobs
      const discovery = new JobDiscovery(github, db);
      const jobs = await discovery.discoverFromRepo(parsed.owner, parsed.repo);

      if (jobs.length > 0) {
        await discovery.saveJobsToDatabase(companyId, jobs);
        console.log(chalk.green(`✓ Found ${jobs.length} jobs`));
      } else {
        console.log(chalk.yellow(`  No suitable jobs found`));
      }

      console.log();
    });

  return sync;
}
```

**Step 5: Update package.json with bin entry**

Add to package.json:
```json
"bin": {
  "gogetajob": "./bin/gogetajob"
}
```

**Step 6: Add v3 build script**

Add to package.json scripts:
```json
"build:v3": "tsc -p tsconfig.v3.json"
```

Create `tsconfig.v3.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/v3/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 7: Commit**

```bash
git add src/v3 bin tsconfig.v3.json package.json
git commit -m "feat(v3): implement CLI with jobs, company, report, sync commands"
```

---

### Task 11: Build and Test CLI

**Step 1: Build the project**

Run: `npm run build:v3`
Expected: Successful compilation

**Step 2: Link CLI globally**

Run: `npm link`

**Step 3: Test CLI**

Run:
```bash
gogetajob --version
gogetajob config show
gogetajob config set github_token YOUR_TOKEN
gogetajob sync add facebook/react
gogetajob jobs list
gogetajob company list
```

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add .
git commit -m "test(v3): verify CLI builds and runs correctly"
```

---

## Phase 4: REST API (Optional)

### Task 12: Implement REST API Server

**Files:**
- Create: `src/v3/api/server.ts`
- Create: `src/v3/api/routes/jobs.ts`
- Create: `src/v3/api/routes/companies.ts`
- Create: `src/v3/api/routes/reports.ts`

This task follows similar patterns to the CLI but exposes HTTP endpoints.
Implementation details available in design doc.

---

## Success Criteria Verification

### Task 13: Self-Bootstrap Test

**Step 1: Add gogetajob repo itself**

Run:
```bash
gogetajob sync add daniyuu/gogetajob
gogetajob jobs list
```

Expected: Shows issues from the gogetajob repo

**Step 2: Verify all features work**

Run:
```bash
# Check company info
gogetajob company info daniyuu/gogetajob

# Apply for a job (if any)
gogetajob jobs list --limit 1
# gogetajob jobs apply <JOB_ID>

# Check agent stats
gogetajob report history
```

**Step 3: Final commit**

```bash
git add .
git commit -m "feat(v3): complete v3 MVP implementation"
```

---

## Summary

This plan implements GoGetAJob v3 with:

1. **Infrastructure** (Tasks 1-5): Dependencies, directory structure, types, database, GitHub client
2. **Core Services** (Tasks 6-9): CompanyProfiler, JDParser, JobDiscovery, Accounting
3. **CLI** (Tasks 10-11): Full CLI with jobs, company, report, sync commands
4. **API** (Task 12): Optional REST API
5. **Verification** (Task 13): Self-bootstrap test

Each task is designed to be completed in 10-20 minutes with clear test-first approach.
