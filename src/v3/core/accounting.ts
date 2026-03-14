import { Database } from '../db/database';
import { WorkReport, WorkStatus } from '../db/schema';

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
  total_bounty_earned: number;
  merged_prs: number;
  cost_per_merge: number;
}

export class Accounting {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Start work on a job - creates WorkReport and marks job as taken
   */
  startWork(jobId: number, agentId: string): WorkReport {
    // Create work report
    const result = this.db.run(
      `INSERT INTO work_reports (job_id, agent_id, status, token_cost) VALUES (?, ?, 'in_progress', 0)`,
      [jobId, agentId]
    );
    const reportId = Number(result.lastInsertRowid);

    // Mark job as taken
    this.db.run(`UPDATE jobs SET status = 'taken', updated_at = datetime('now') WHERE id = ?`, [jobId]);

    // Create or update agent profile
    const existingProfile = this.db.queryOne<{ id: string; total_jobs: number }>(
      'SELECT id, total_jobs FROM agent_profiles WHERE id = ?',
      [agentId]
    );

    if (existingProfile) {
      this.db.run(
        `UPDATE agent_profiles SET total_jobs = total_jobs + 1, updated_at = datetime('now') WHERE id = ?`,
        [agentId]
      );
    } else {
      this.db.run(
        `INSERT INTO agent_profiles (id, total_jobs, completed_jobs, total_prs, merged_prs, total_token_cost) VALUES (?, 1, 0, 0, 0, 0)`,
        [agentId]
      );
    }

    return this.getWorkReport(reportId)!;
  }

  /**
   * Update token cost for a work report (adds to existing cost)
   */
  updateTokenCost(reportId: number, tokens: number): WorkReport {
    const report = this.getWorkReport(reportId);
    if (!report) {
      throw new Error(`Work report ${reportId} not found`);
    }

    this.db.run(
      `UPDATE work_reports SET token_cost = token_cost + ? WHERE id = ?`,
      [tokens, reportId]
    );

    return this.getWorkReport(reportId)!;
  }

  /**
   * Submit a PR for a work report
   */
  submitPR(reportId: number, prNumber: number, prUrl: string, tokens?: number): WorkReport {
    const report = this.getWorkReport(reportId);
    if (!report) {
      throw new Error(`Work report ${reportId} not found`);
    }

    // Update work report with PR info
    if (tokens) {
      this.db.run(
        `UPDATE work_reports
         SET status = 'pr_submitted', pr_number = ?, pr_url = ?, pr_submitted_at = datetime('now'), token_cost = token_cost + ?
         WHERE id = ?`,
        [prNumber, prUrl, tokens, reportId]
      );
    } else {
      this.db.run(
        `UPDATE work_reports
         SET status = 'pr_submitted', pr_number = ?, pr_url = ?, pr_submitted_at = datetime('now')
         WHERE id = ?`,
        [prNumber, prUrl, reportId]
      );
    }

    // Update agent profile total_prs
    this.db.run(
      `UPDATE agent_profiles SET total_prs = total_prs + 1, updated_at = datetime('now') WHERE id = ?`,
      [report.agent_id]
    );

    return this.getWorkReport(reportId)!;
  }

  /**
   * Complete work with a final status
   */
  completeWork(reportId: number, status: WorkStatus, tokens?: number): WorkReport {
    const report = this.getWorkReport(reportId);
    if (!report) {
      throw new Error(`Work report ${reportId} not found`);
    }

    // Update work report
    if (tokens) {
      this.db.run(
        `UPDATE work_reports
         SET status = ?, completed_at = datetime('now'), token_cost = token_cost + ?
         WHERE id = ?`,
        [status, tokens, reportId]
      );
    } else {
      this.db.run(
        `UPDATE work_reports
         SET status = ?, completed_at = datetime('now')
         WHERE id = ?`,
        [status, reportId]
      );
    }

    // Get updated report to get final token cost
    const updatedReport = this.getWorkReport(reportId)!;

    // Update job status based on completion status
    if (status === 'pr_merged') {
      this.db.run(
        `UPDATE jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?`,
        [report.job_id]
      );
    } else if (status === 'abandoned') {
      this.db.run(
        `UPDATE jobs SET status = 'open', updated_at = datetime('now') WHERE id = ?`,
        [report.job_id]
      );
    }

    // Update agent profile
    if (status === 'pr_merged') {
      this.db.run(
        `UPDATE agent_profiles
         SET merged_prs = merged_prs + 1, completed_jobs = completed_jobs + 1,
             total_token_cost = total_token_cost + ?, updated_at = datetime('now')
         WHERE id = ?`,
        [updatedReport.token_cost, report.agent_id]
      );
    } else if (status === 'pr_closed' || status === 'abandoned') {
      this.db.run(
        `UPDATE agent_profiles
         SET completed_jobs = completed_jobs + 1, total_token_cost = total_token_cost + ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        [updatedReport.token_cost, report.agent_id]
      );
    }

    return updatedReport;
  }

  /**
   * Get agent statistics
   */
  getAgentStats(agentId: string): AgentStats {
    const profile = this.db.queryOne<{
      id: string;
      total_jobs: number;
      completed_jobs: number;
      total_prs: number;
      merged_prs: number;
      total_token_cost: number;
    }>(
      'SELECT id, total_jobs, completed_jobs, total_prs, merged_prs, total_token_cost FROM agent_profiles WHERE id = ?',
      [agentId]
    );

    if (!profile) {
      return {
        agent_id: agentId,
        total_jobs: 0,
        completed_jobs: 0,
        total_prs: 0,
        merged_prs: 0,
        total_token_cost: 0,
        success_rate: 0,
        avg_token_per_merge: 0,
      };
    }

    const successRate = profile.total_jobs > 0 ? profile.merged_prs / profile.total_jobs : 0;
    const avgTokenPerMerge = profile.merged_prs > 0 ? profile.total_token_cost / profile.merged_prs : 0;

    return {
      agent_id: agentId,
      total_jobs: profile.total_jobs,
      completed_jobs: profile.completed_jobs,
      total_prs: profile.total_prs,
      merged_prs: profile.merged_prs,
      total_token_cost: profile.total_token_cost,
      success_rate: successRate,
      avg_token_per_merge: avgTokenPerMerge,
    };
  }

  /**
   * Calculate ROI for an agent
   */
  calculateROI(agentId: string): ROIReport {
    const profile = this.db.queryOne<{
      total_token_cost: number;
      merged_prs: number;
    }>(
      'SELECT total_token_cost, merged_prs FROM agent_profiles WHERE id = ?',
      [agentId]
    );

    if (!profile) {
      return {
        agent_id: agentId,
        total_token_cost: 0,
        total_bounty_earned: 0,
        merged_prs: 0,
        cost_per_merge: 0,
      };
    }

    // Calculate total bounty earned from merged PRs
    const bountyResult = this.db.queryOne<{ total_bounty: number }>(
      `SELECT COALESCE(SUM(j.bounty_amount), 0) as total_bounty
       FROM work_reports wr
       JOIN jobs j ON wr.job_id = j.id
       WHERE wr.agent_id = ? AND wr.status = 'pr_merged' AND j.has_bounty = 1`,
      [agentId]
    );

    const totalBounty = bountyResult?.total_bounty || 0;
    const costPerMerge = profile.merged_prs > 0 ? profile.total_token_cost / profile.merged_prs : 0;

    return {
      agent_id: agentId,
      total_token_cost: profile.total_token_cost,
      total_bounty_earned: totalBounty,
      merged_prs: profile.merged_prs,
      cost_per_merge: costPerMerge,
    };
  }

  /**
   * Get a work report by ID
   */
  private getWorkReport(reportId: number): WorkReport | undefined {
    return this.db.queryOne<WorkReport>(
      'SELECT * FROM work_reports WHERE id = ?',
      [reportId]
    );
  }
}
