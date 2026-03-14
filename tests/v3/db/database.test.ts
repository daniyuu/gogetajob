import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../../src/v3/db/database';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-gogetajob.db');

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
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
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='companies'"
    );
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('companies');
  });

  it('can insert and query companies', () => {
    db.runMigrations();
    db.run(`INSERT INTO companies (owner, repo, stars, forks) VALUES (?, ?, ?, ?)`,
      ['facebook', 'react', 220000, 45000]);
    const companies = db.query<{ owner: string; repo: string; stars: number }>(
      'SELECT owner, repo, stars FROM companies WHERE owner = ?', ['facebook']
    );
    expect(companies).toHaveLength(1);
    expect(companies[0].owner).toBe('facebook');
    expect(companies[0].stars).toBe(220000);
  });

  it('creates all required tables', () => {
    db.runMigrations();
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('companies');
    expect(tableNames).toContain('jobs');
    expect(tableNames).toContain('work_reports');
    expect(tableNames).toContain('agent_profiles');
    expect(tableNames).toContain('blacklist');
  });

  it('enforces unique constraint on owner/repo', () => {
    db.runMigrations();
    db.run(`INSERT INTO companies (owner, repo, stars, forks) VALUES (?, ?, ?, ?)`,
      ['facebook', 'react', 220000, 45000]);

    expect(() => {
      db.run(`INSERT INTO companies (owner, repo, stars, forks) VALUES (?, ?, ?, ?)`,
        ['facebook', 'react', 220001, 45001]);
    }).toThrow();
  });

  it('can use queryOne for single result', () => {
    db.runMigrations();
    db.run(`INSERT INTO companies (owner, repo, stars, forks) VALUES (?, ?, ?, ?)`,
      ['facebook', 'react', 220000, 45000]);

    const company = db.queryOne<{ owner: string; stars: number }>(
      'SELECT owner, stars FROM companies WHERE owner = ?', ['facebook']
    );
    expect(company).toBeDefined();
    expect(company?.owner).toBe('facebook');
  });

  it('queryOne returns undefined for no results', () => {
    db.runMigrations();
    const company = db.queryOne<{ owner: string }>(
      'SELECT owner FROM companies WHERE owner = ?', ['nonexistent']
    );
    expect(company).toBeUndefined();
  });

  it('creates indexes for jobs table', () => {
    db.runMigrations();
    const indexes = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_jobs%'"
    );
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_jobs_company');
    expect(indexNames).toContain('idx_jobs_status');
    expect(indexNames).toContain('idx_jobs_type');
  });

  it('enforces foreign key constraint', () => {
    db.runMigrations();
    // Try to insert a job with non-existent company_id
    expect(() => {
      db.run(`INSERT INTO jobs (company_id, issue_number, title, html_url) VALUES (?, ?, ?, ?)`,
        [9999, 1, 'Test Job', 'https://example.com']);
    }).toThrow();
  });

  it('can insert and query jobs with company relationship', () => {
    db.runMigrations();

    // Insert company first
    const companyResult = db.run(
      `INSERT INTO companies (owner, repo, stars, forks) VALUES (?, ?, ?, ?)`,
      ['facebook', 'react', 220000, 45000]
    );
    const companyId = companyResult.lastInsertRowid;

    // Insert job
    db.run(
      `INSERT INTO jobs (company_id, issue_number, title, html_url, job_type) VALUES (?, ?, ?, ?, ?)`,
      [companyId, 12345, 'Fix memory leak', 'https://github.com/facebook/react/issues/12345', 'bug_fix']
    );

    // Query with join
    const jobs = db.query<{ title: string; owner: string; repo: string }>(
      `SELECT j.title, c.owner, c.repo
       FROM jobs j
       JOIN companies c ON j.company_id = c.id
       WHERE c.owner = ?`,
      ['facebook']
    );

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Fix memory leak');
    expect(jobs[0].owner).toBe('facebook');
  });
});
