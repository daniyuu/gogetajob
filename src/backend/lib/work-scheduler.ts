import { db } from './database';
import { AIWorker } from './ai-worker';
import { loadConfig } from './config';
import path from 'path';

interface WorkSession {
  positionId: number;
  worker: AIWorker | null;
  status: 'idle' | 'working' | 'error';
  lastActivity: Date;
}

export class WorkScheduler {
  private sessions: Map<number, WorkSession> = new Map();
  private maxWorkers: number;
  private githubToken?: string;

  constructor() {
    const config = loadConfig();
    this.maxWorkers = config.maxParallelWorkers;
    this.githubToken = config.githubToken || undefined;
  }

  /**
   * Resume all active positions (called on server startup)
   */
  async resumeActivePositions(): Promise<void> {
    console.log('[Scheduler] Resuming active positions...');

    const activePositions = db.prepare(
      "SELECT * FROM positions WHERE status IN ('buying', 'working')"
    ).all() as any[];

    console.log(`[Scheduler] Found ${activePositions.length} active positions to resume`);

    for (const position of activePositions) {
      try {
        console.log(`[Scheduler] Resuming position ${position.id}...`);
        await this.startWork(position.id);
      } catch (error: any) {
        console.error(`[Scheduler] Failed to resume position ${position.id}:`, error.message);
      }
    }

    console.log('[Scheduler] Resume complete');
  }

  /**
   * Start working on a position
   */
  async startWork(positionId: number): Promise<void> {
    console.log(`[Scheduler] startWork() called for position ${positionId}`);

    const position = this.getPosition(positionId);
    if (!position) {
      throw new Error('Position not found');
    }
    console.log(`[Scheduler] Found position:`, position);

    // Check if already working in memory (not just database)
    if (this.sessions.has(positionId)) {
      console.log(`[Scheduler] Already have active session for position ${positionId}`);
      throw new Error('Already working on this position');
    }

    if (this.sessions.size >= this.maxWorkers) {
      throw new Error(`Maximum ${this.maxWorkers} workers reached`);
    }

    const project = this.getProject(position.project_id);
    if (!project) {
      throw new Error('Project not found');
    }
    console.log(`[Scheduler] Found project:`, project);

    // Update position status to 'working' if it's not already
    if (position.status !== 'working') {
      db.prepare('UPDATE positions SET status = ?, started_at = ? WHERE id = ?')
        .run('working', new Date().toISOString(), positionId);
      console.log(`[Scheduler] Updated position status to 'working'`);
    } else {
      console.log(`[Scheduler] Position already has 'working' status, resuming...`);
    }

    // Create work directory
    const workDir = path.join(process.cwd(), 'data', 'workspaces', `project-${project.id}`);
    console.log(`[Scheduler] Work directory: ${workDir}`);

    // Create AI worker
    const worker = new AIWorker({
      repoUrl: project.repo_url,
      workDir,
      positionId,
      projectName: project.name,
      githubToken: this.githubToken
    });
    console.log(`[Scheduler] Created AIWorker instance`);

    // Create session
    const session: WorkSession = {
      positionId,
      worker,
      status: 'working',
      lastActivity: new Date()
    };

    this.sessions.set(positionId, session);
    console.log(`[Scheduler] Session created and stored`);

    // Start worker in background
    console.log(`[Scheduler] Calling worker.start()...`);
    worker.start().catch(error => {
      console.error(`[Scheduler] Worker ${positionId} failed:`, error);
      session.status = 'error';

      db.prepare('UPDATE positions SET status = ? WHERE id = ?')
        .run('error', positionId);

      this.createNotification(
        positionId,
        'error',
        `Worker failed: ${error.message}`
      );
    });

    console.log(`[Scheduler] Started worker for position ${positionId}`);
  }

  /**
   * Stop working on a position
   */
  async stopWork(positionId: number): Promise<void> {
    const session = this.sessions.get(positionId);
    if (!session) {
      return; // Already stopped
    }

    // Stop the worker
    if (session.worker) {
      session.worker.stop();
    }

    // Update position status
    db.prepare('UPDATE positions SET status = ?, stopped_at = ? WHERE id = ?')
      .run('stopped', new Date().toISOString(), positionId);

    this.sessions.delete(positionId);

    console.log(`[Scheduler] Stopped worker for position ${positionId}`);
  }

  /**
   * Get position from database
   */
  private getPosition(positionId: number): any {
    return db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
  }

  /**
   * Get project from database
   */
  private getProject(projectId: number): any {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
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
   * Get all active sessions
   */
  getActiveSessions(): any[] {
    return Array.from(this.sessions.entries()).map(([positionId, session]) => ({
      positionId,
      status: session.status,
      lastActivity: session.lastActivity
    }));
  }

  /**
   * Stop all workers (for shutdown)
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.sessions.keys()).map(id => this.stopWork(id));
    await Promise.all(promises);
  }
}
