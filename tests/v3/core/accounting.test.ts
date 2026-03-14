import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../../src/v3/db/database';
import { Accounting, AgentStats } from '../../../src/v3/core/accounting';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-accounting.db');

describe('Accounting', () => {
  let db: Database;
  let accounting: Accounting;
  let testJobId: number;

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // Also clean up WAL files
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }

    // Create test database and run migrations
    db = new Database(TEST_DB_PATH);
    db.runMigrations();

    // Insert test company
    const companyResult = db.run(
      `INSERT INTO companies (owner, repo) VALUES (?, ?)`,
      ['test', 'repo']
    );
    const companyId = companyResult.lastInsertRowid;

    // Insert test job
    const jobResult = db.run(
      `INSERT INTO jobs (company_id, issue_number, title, html_url) VALUES (?, ?, ?, ?)`,
      [companyId, 123, 'Test Job', 'https://github.com/test/repo/issues/123']
    );
    testJobId = Number(jobResult.lastInsertRowid);

    // Create accounting instance
    accounting = new Accounting(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
  });

  describe('startWork', () => {
    it('creates a work report with in_progress status', () => {
      const report = accounting.startWork(testJobId, 'agent-001');

      expect(report).toBeDefined();
      expect(report.id).toBeGreaterThan(0);
      expect(report.job_id).toBe(testJobId);
      expect(report.agent_id).toBe('agent-001');
      expect(report.status).toBe('in_progress');
      expect(report.token_cost).toBe(0);
      expect(report.started_at).toBeDefined();
    });

    it('marks job as taken when work starts', () => {
      accounting.startWork(testJobId, 'agent-001');

      const job = db.queryOne<{ status: string }>(
        'SELECT status FROM jobs WHERE id = ?',
        [testJobId]
      );
      expect(job?.status).toBe('taken');
    });

    it('creates agent profile if not exists', () => {
      accounting.startWork(testJobId, 'new-agent');

      const profile = db.queryOne<{ id: string; total_jobs: number }>(
        'SELECT id, total_jobs FROM agent_profiles WHERE id = ?',
        ['new-agent']
      );
      expect(profile).toBeDefined();
      expect(profile?.total_jobs).toBe(1);
    });

    it('increments total_jobs for existing agent', () => {
      // Create another job for second work report
      const jobResult = db.run(
        `INSERT INTO jobs (company_id, issue_number, title, html_url) VALUES (?, ?, ?, ?)`,
        [1, 456, 'Another Job', 'https://github.com/test/repo/issues/456']
      );
      const secondJobId = Number(jobResult.lastInsertRowid);

      accounting.startWork(testJobId, 'agent-001');
      accounting.startWork(secondJobId, 'agent-001');

      const profile = db.queryOne<{ total_jobs: number }>(
        'SELECT total_jobs FROM agent_profiles WHERE id = ?',
        ['agent-001']
      );
      expect(profile?.total_jobs).toBe(2);
    });
  });

  describe('updateTokenCost', () => {
    it('updates token cost on work report', () => {
      const report = accounting.startWork(testJobId, 'agent-001');

      const updatedReport = accounting.updateTokenCost(report.id, 5000);

      expect(updatedReport.token_cost).toBe(5000);
    });

    it('adds to existing token cost', () => {
      const report = accounting.startWork(testJobId, 'agent-001');

      accounting.updateTokenCost(report.id, 5000);
      const updatedReport = accounting.updateTokenCost(report.id, 3000);

      expect(updatedReport.token_cost).toBe(8000);
    });

    it('throws error for non-existent report', () => {
      expect(() => accounting.updateTokenCost(9999, 1000)).toThrow();
    });
  });

  describe('submitPR', () => {
    it('records PR submission', () => {
      const report = accounting.startWork(testJobId, 'agent-001');

      const updatedReport = accounting.submitPR(
        report.id,
        42,
        'https://github.com/test/repo/pull/42'
      );

      expect(updatedReport.status).toBe('pr_submitted');
      expect(updatedReport.pr_number).toBe(42);
      expect(updatedReport.pr_url).toBe('https://github.com/test/repo/pull/42');
      expect(updatedReport.pr_submitted_at).toBeDefined();
    });

    it('updates token cost when provided', () => {
      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.updateTokenCost(report.id, 3000);

      const updatedReport = accounting.submitPR(
        report.id,
        42,
        'https://github.com/test/repo/pull/42',
        2000
      );

      expect(updatedReport.token_cost).toBe(5000);
    });

    it('increments total_prs for agent', () => {
      const report = accounting.startWork(testJobId, 'agent-001');

      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');

      const profile = db.queryOne<{ total_prs: number }>(
        'SELECT total_prs FROM agent_profiles WHERE id = ?',
        ['agent-001']
      );
      expect(profile?.total_prs).toBe(1);
    });
  });

  describe('completeWork', () => {
    it('marks work as pr_merged with token cost', () => {
      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');

      const completedReport = accounting.completeWork(report.id, 'pr_merged', 1000);

      expect(completedReport.status).toBe('pr_merged');
      expect(completedReport.completed_at).toBeDefined();
    });

    it('marks job as completed when PR is merged', () => {
      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');
      accounting.completeWork(report.id, 'pr_merged');

      const job = db.queryOne<{ status: string }>(
        'SELECT status FROM jobs WHERE id = ?',
        [testJobId]
      );
      expect(job?.status).toBe('completed');
    });

    it('increments merged_prs and completed_jobs for agent', () => {
      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');
      accounting.completeWork(report.id, 'pr_merged');

      const profile = db.queryOne<{ merged_prs: number; completed_jobs: number }>(
        'SELECT merged_prs, completed_jobs FROM agent_profiles WHERE id = ?',
        ['agent-001']
      );
      expect(profile?.merged_prs).toBe(1);
      expect(profile?.completed_jobs).toBe(1);
    });

    it('handles pr_closed status', () => {
      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');

      const completedReport = accounting.completeWork(report.id, 'pr_closed');

      expect(completedReport.status).toBe('pr_closed');

      const profile = db.queryOne<{ merged_prs: number; completed_jobs: number }>(
        'SELECT merged_prs, completed_jobs FROM agent_profiles WHERE id = ?',
        ['agent-001']
      );
      // PR closed doesn't count as merged
      expect(profile?.merged_prs).toBe(0);
      // But still counts as completed
      expect(profile?.completed_jobs).toBe(1);
    });

    it('handles abandoned status', () => {
      const report = accounting.startWork(testJobId, 'agent-001');

      const completedReport = accounting.completeWork(report.id, 'abandoned');

      expect(completedReport.status).toBe('abandoned');

      // Job should be reopened
      const job = db.queryOne<{ status: string }>(
        'SELECT status FROM jobs WHERE id = ?',
        [testJobId]
      );
      expect(job?.status).toBe('open');
    });

    it('updates agent total_token_cost', () => {
      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.updateTokenCost(report.id, 5000);
      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');
      accounting.completeWork(report.id, 'pr_merged', 2000);

      const profile = db.queryOne<{ total_token_cost: number }>(
        'SELECT total_token_cost FROM agent_profiles WHERE id = ?',
        ['agent-001']
      );
      expect(profile?.total_token_cost).toBe(7000);
    });
  });

  describe('getAgentStats', () => {
    it('calculates correct statistics', () => {
      // Create multiple jobs and work reports
      const job2Result = db.run(
        `INSERT INTO jobs (company_id, issue_number, title, html_url) VALUES (?, ?, ?, ?)`,
        [1, 456, 'Job 2', 'https://github.com/test/repo/issues/456']
      );
      const job2Id = Number(job2Result.lastInsertRowid);

      const job3Result = db.run(
        `INSERT INTO jobs (company_id, issue_number, title, html_url) VALUES (?, ?, ?, ?)`,
        [1, 789, 'Job 3', 'https://github.com/test/repo/issues/789']
      );
      const job3Id = Number(job3Result.lastInsertRowid);

      // Job 1: merged
      const report1 = accounting.startWork(testJobId, 'agent-001');
      accounting.updateTokenCost(report1.id, 3000);
      accounting.submitPR(report1.id, 42, 'https://github.com/test/repo/pull/42');
      accounting.completeWork(report1.id, 'pr_merged', 1000);

      // Job 2: merged
      const report2 = accounting.startWork(job2Id, 'agent-001');
      accounting.updateTokenCost(report2.id, 4000);
      accounting.submitPR(report2.id, 43, 'https://github.com/test/repo/pull/43');
      accounting.completeWork(report2.id, 'pr_merged', 1000);

      // Job 3: closed (not merged)
      const report3 = accounting.startWork(job3Id, 'agent-001');
      accounting.updateTokenCost(report3.id, 2000);
      accounting.submitPR(report3.id, 44, 'https://github.com/test/repo/pull/44');
      accounting.completeWork(report3.id, 'pr_closed', 500);

      const stats = accounting.getAgentStats('agent-001');

      expect(stats).toBeDefined();
      expect(stats.agent_id).toBe('agent-001');
      expect(stats.total_jobs).toBe(3);
      expect(stats.completed_jobs).toBe(3);
      expect(stats.total_prs).toBe(3);
      expect(stats.merged_prs).toBe(2);
      expect(stats.total_token_cost).toBe(11500); // 4000 + 5000 + 2500
      expect(stats.success_rate).toBeCloseTo(2 / 3, 2); // 2 merged / 3 total
      expect(stats.avg_token_per_merge).toBeCloseTo(11500 / 2, 2); // total tokens / merged PRs
    });

    it('returns zero stats for new agent', () => {
      const stats = accounting.getAgentStats('nonexistent-agent');

      expect(stats.agent_id).toBe('nonexistent-agent');
      expect(stats.total_jobs).toBe(0);
      expect(stats.completed_jobs).toBe(0);
      expect(stats.total_prs).toBe(0);
      expect(stats.merged_prs).toBe(0);
      expect(stats.total_token_cost).toBe(0);
      expect(stats.success_rate).toBe(0);
      expect(stats.avg_token_per_merge).toBe(0);
    });
  });

  describe('calculateROI', () => {
    it('returns detailed ROI report', () => {
      // Create work with bounty
      db.run(
        `UPDATE jobs SET has_bounty = 1, bounty_amount = 100, bounty_currency = 'USD' WHERE id = ?`,
        [testJobId]
      );

      const report = accounting.startWork(testJobId, 'agent-001');
      accounting.updateTokenCost(report.id, 10000);
      accounting.submitPR(report.id, 42, 'https://github.com/test/repo/pull/42');
      accounting.completeWork(report.id, 'pr_merged');

      const roi = accounting.calculateROI('agent-001');

      expect(roi).toBeDefined();
      expect(roi.agent_id).toBe('agent-001');
      expect(roi.total_token_cost).toBe(10000);
      expect(roi.total_bounty_earned).toBe(100);
      expect(roi.merged_prs).toBe(1);
      expect(roi.cost_per_merge).toBe(10000);
    });

    it('handles agent with no work', () => {
      const roi = accounting.calculateROI('nonexistent-agent');

      expect(roi.agent_id).toBe('nonexistent-agent');
      expect(roi.total_token_cost).toBe(0);
      expect(roi.total_bounty_earned).toBe(0);
      expect(roi.merged_prs).toBe(0);
      expect(roi.cost_per_merge).toBe(0);
    });
  });
});
