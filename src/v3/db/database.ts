import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'gogetajob-v3.db');

export class Database {
  private db: BetterSqlite3.Database;
  private dbPath: string;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
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
