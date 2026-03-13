import { db } from './database';

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
