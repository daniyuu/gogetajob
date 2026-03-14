import Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.exec(`
    -- Companies: GitHub repos we know about
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      full_name TEXT NOT NULL,
      description TEXT,
      language TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      pr_merge_rate REAL,           -- 0.0 ~ 1.0
      avg_response_hours REAL,      -- average time to first response on PRs
      has_contributing_guide INTEGER DEFAULT 0,
      has_cla INTEGER DEFAULT 0,
      last_commit_at TEXT,
      last_scanned_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(owner, repo)
    );

    -- Jobs: individual work opportunities (issues)
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      issue_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      labels TEXT,                   -- JSON array
      job_type TEXT DEFAULT 'unknown', -- bug|feature|docs|test|refactor|other
      difficulty TEXT DEFAULT 'unknown', -- easy|medium|hard|unknown
      has_bounty INTEGER DEFAULT 0,
      bounty_amount TEXT,
      url TEXT,
      state TEXT DEFAULT 'open',     -- open|closed
      discovered_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, issue_number),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    -- Work log: our work history
    CREATE TABLE IF NOT EXISTS work_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      status TEXT DEFAULT 'taken',   -- taken|in_progress|done|dropped
      pr_number INTEGER,
      pr_url TEXT,
      pr_status TEXT,                -- open|merged|closed
      tokens_used INTEGER,
      notes TEXT,
      taken_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
  `);
  // Migration 2: add body, comments_count, has_pr to jobs
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migration_check (id INTEGER);
    DROP TABLE _migration_check;
  `);
  
  // Check if body column exists
  const cols = db.prepare(`PRAGMA table_info(jobs)`).all() as any[];
  const colNames = cols.map((c: any) => c.name);
  
  if (!colNames.includes('body')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN body TEXT DEFAULT ''`);
  }
  if (!colNames.includes('comments_count')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN comments_count INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('has_pr')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN has_pr INTEGER DEFAULT 0`);
  }
}
