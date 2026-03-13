import { db } from './database';
import { GitHubAPI } from './github-api';
import type { Position, PullRequest, Notification } from '../types';

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

    // Create position with 'working' status (ready for task scheduler)
    const result = db.prepare(`
      INSERT INTO positions (project_id, status, buy_price, max_parallel_tasks)
      VALUES (?, 'working', ?, 1)
    `).run(projectId, buyPrice);

    const positionId = result.lastInsertRowid as number;

    // Create root exploration task for autonomous agent
    db.prepare(`
      INSERT INTO tasks (position_id, description, status, completion_promise)
      VALUES (?, ?, 'pending', 'TASK_COMPLETE')
    `).run(
      positionId,
      `Explore this repository and create an actionable contribution plan.

Your task:
1. Analyze the codebase to identify opportunities (bugs, missing features, improvements)
2. Decompose work into concrete sub-tasks
3. Create each sub-task using the GoGetAJob API

API Access:
- Base URL: Available in environment variable $env:GOGETAJOB_API_URL (http://localhost:9393)
- Your Position ID: $env:GOGETAJOB_POSITION_ID
- Your Task ID: $env:GOGETAJOB_TASK_ID

To create a sub-task:
Invoke-RestMethod -Uri "$env:GOGETAJOB_API_URL/api/tasks" -Method POST -ContentType "application/json" -Body (@{position_id=$env:GOGETAJOB_POSITION_ID; description="Task description"; completion_promise="TASK_X_COMPLETE"; created_by_task_id=$env:GOGETAJOB_TASK_ID} | ConvertTo-Json)

When you complete exploration and all sub-tasks are created, mark this task as complete:
Invoke-RestMethod -Uri "$env:GOGETAJOB_API_URL/api/tasks/$env:GOGETAJOB_TASK_ID/complete" -Method PATCH

This will automatically close the agent window.`
    );

    console.log(`✅ Position ${positionId} created with root exploration task`);

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
      WHERE project_id = ? AND status IN ('buying', 'working')
    `).get(projectId) as Position | undefined;
  }

  /**
   * Get all active positions
   */
  getActivePositions(): Position[] {
    return db.prepare(`
      SELECT * FROM positions
      WHERE status IN ('buying', 'working')
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
