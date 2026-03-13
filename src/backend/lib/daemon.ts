/**
 * Background Daemon - Manages periodic tasks
 *
 * This daemon:
 * 1. Updates project data from GitHub
 * 2. Creates project snapshots for K-line charts
 * 3. Monitors worker health
 * 4. Calculates ROI for positions
 */

import { db } from './database';
import { GitHubAPI } from './github-api';
import { ProjectService } from './project-service';
import { PositionService } from './position-service';
import { loadConfig } from './config';

export class BackgroundDaemon {
  private githubApi: GitHubAPI;
  private projectService: ProjectService;
  private positionService: PositionService;
  private intervals: NodeJS.Timeout[] = [];
  private updateIntervals: any;

  constructor() {
    const config = loadConfig();
    this.githubApi = new GitHubAPI(config.githubToken || undefined);
    this.projectService = new ProjectService(config.githubToken || undefined);
    this.positionService = new PositionService(config.githubToken || undefined);
    this.updateIntervals = config.updateIntervals;
  }

  /**
   * Start the daemon
   */
  start(): void {
    console.log('🤖 Background daemon starting...');

    // Update hot projects (>10k stars) every 10 minutes
    this.scheduleTask(
      'Hot projects update',
      () => this.updateProjectsByCategory('hot', 10000),
      this.updateIntervals.hot * 1000
    );

    // Update warm projects (1k-10k stars) every hour
    this.scheduleTask(
      'Warm projects update',
      () => this.updateProjectsByCategory('warm', 1000, 10000),
      this.updateIntervals.warm * 1000
    );

    // Update cold projects (<1k stars) every day
    this.scheduleTask(
      'Cold projects update',
      () => this.updateProjectsByCategory('cold', 0, 1000),
      this.updateIntervals.cold * 1000
    );

    // Update positions every 10 minutes
    this.scheduleTask(
      'Positions update',
      () => this.updatePositions(),
      this.updateIntervals.positions * 1000
    );

    // Create hourly snapshots
    this.scheduleTask(
      'Create snapshots',
      () => this.createSnapshots(),
      3600000 // 1 hour
    );

    // Check PR status every 30 minutes
    this.scheduleTask(
      'Check PR status',
      () => this.checkPRStatus(),
      1800000 // 30 minutes
    );

    console.log('✅ Background daemon started');
  }

  /**
   * Stop the daemon
   */
  stop(): void {
    console.log('🛑 Stopping background daemon...');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('✅ Background daemon stopped');
  }

  /**
   * Schedule a periodic task
   */
  private scheduleTask(name: string, task: () => Promise<void>, intervalMs: number): void {
    console.log(`📅 Scheduled: ${name} (every ${intervalMs / 1000}s)`);

    // Run immediately
    task().catch(error => {
      console.error(`❌ ${name} failed:`, error);
    });

    // Then run periodically
    const interval = setInterval(() => {
      task().catch(error => {
        console.error(`❌ ${name} failed:`, error);
      });
    }, intervalMs);

    this.intervals.push(interval);
  }

  /**
   * Update projects by category (hot/warm/cold)
   */
  private async updateProjectsByCategory(
    category: string,
    minStars: number,
    maxStars?: number
  ): Promise<void> {
    console.log(`🔄 Updating ${category} projects...`);

    let query = 'SELECT * FROM projects WHERE stars >= ?';
    const params: any[] = [minStars];

    if (maxStars !== undefined) {
      query += ' AND stars < ?';
      params.push(maxStars);
    }

    const projects = db.prepare(query).all(...params) as any[];

    console.log(`   Found ${projects.length} ${category} projects`);

    for (const project of projects) {
      try {
        await this.projectService.updateProject(project.id);
        console.log(`   ✓ Updated ${project.name}`);

        // Small delay to avoid rate limiting
        await this.sleep(1000);
      } catch (error: any) {
        console.error(`   ✗ Failed to update ${project.name}:`, error.message);
      }
    }

    console.log(`✅ ${category} projects updated`);
  }

  /**
   * Update all active positions
   */
  private async updatePositions(): Promise<void> {
    console.log('🔄 Updating positions...');

    const positions = db.prepare(
      "SELECT * FROM positions WHERE status IN ('buying', 'working')"
    ).all() as any[];

    console.log(`   Found ${positions.length} active positions`);

    for (const position of positions) {
      try {
        // Update the project data
        await this.projectService.updateProject(position.project_id);

        // Calculate ROI
        const roi = this.positionService.calculateROI(position.id);
        console.log(`   ✓ Position ${position.id}: ROI = ${roi.toFixed(2)}%`);
      } catch (error: any) {
        console.error(`   ✗ Failed to update position ${position.id}:`, error.message);
      }
    }

    console.log('✅ Positions updated');
  }

  /**
   * Create snapshots for all projects
   */
  private async createSnapshots(): Promise<void> {
    console.log('📸 Creating project snapshots...');

    const projects = db.prepare('SELECT * FROM projects').all() as any[];

    for (const project of projects) {
      try {
        const price = project.stars + project.forks * 2;

        db.prepare(`
          INSERT INTO project_snapshots (project_id, stars, forks, price, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          project.id,
          project.stars,
          project.forks,
          price,
          new Date().toISOString()
        );
      } catch (error: any) {
        console.error(`   ✗ Failed to snapshot ${project.name}:`, error.message);
      }
    }

    console.log(`✅ Snapshots created for ${projects.length} projects`);
  }

  /**
   * Check PR status and update notifications
   */
  private async checkPRStatus(): Promise<void> {
    console.log('🔍 Checking PR status...');

    const prs = db.prepare(
      "SELECT * FROM pull_requests WHERE status = 'open'"
    ).all() as any[];

    console.log(`   Found ${prs.length} open PRs`);

    for (const pr of prs) {
      try {
        // Extract owner/repo/pr_number from URL
        const match = pr.pr_url.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
        if (!match) continue;

        const [, owner, repo, prNumber] = match;

        // Fetch PR status from GitHub API
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
          { headers: this.githubApi['getHeaders']() }
        );

        if (!response.ok) continue;

        const prData = await response.json() as any;

        // Update status if changed
        if (prData.merged) {
          db.prepare('UPDATE pull_requests SET status = ?, merged_at = ? WHERE id = ?')
            .run('merged', prData.merged_at, pr.id);

          this.createNotification(
            pr.position_id,
            'pr_merged',
            `PR #${prNumber} was merged! 🎉`
          );

          console.log(`   ✓ PR #${prNumber} merged`);
        } else if (prData.state === 'closed') {
          db.prepare('UPDATE pull_requests SET status = ? WHERE id = ?')
            .run('closed', pr.id);

          this.createNotification(
            pr.position_id,
            'pr_closed',
            `PR #${prNumber} was closed`
          );

          console.log(`   ✗ PR #${prNumber} closed`);
        }

        // Small delay to avoid rate limiting
        await this.sleep(1000);
      } catch (error: any) {
        console.error(`   ✗ Failed to check PR ${pr.id}:`, error.message);
      }
    }

    console.log('✅ PR status checked');
  }

  /**
   * Create a notification
   */
  private createNotification(positionId: number, type: string, message: string): void {
    db.prepare(`
      INSERT INTO notifications (position_id, type, message, is_read, created_at)
      VALUES (?, ?, ?, 0, ?)
    `).run(positionId, type, message, new Date().toISOString());
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
