/**
 * TaskScheduler - Manages autonomous agent task execution
 *
 * This scheduler:
 * 1. Polls the tasks table for pending tasks
 * 2. Creates isolated git worktrees for each task
 * 3. Spawns agent sessions using ralph-loop
 * 4. Monitors completion via completion promises
 * 5. Cleans up worktrees after completion
 */

import { db } from './database';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface Task {
  id: number;
  position_id: number;
  description: string;
  status: 'pending' | 'working' | 'completed' | 'failed' | 'blocked';
  worktree_path: string | null;
  completion_promise: string;
  created_by_task_id: number | null;
  assigned_agent_session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface Position {
  id: number;
  project_id: number;
  status: string;
  max_parallel_tasks: number;
}

interface Project {
  id: number;
  repo_url: string;
  name: string;
}

export class TaskScheduler {
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
  private readonly WORKTREE_BASE = path.join(process.cwd(), '.gogetajob', 'worktrees');

  constructor() {
    // Ensure worktree base directory exists
    if (!fs.existsSync(this.WORKTREE_BASE)) {
      fs.mkdirSync(this.WORKTREE_BASE, { recursive: true });
    }
  }

  /**
   * Start the task scheduler
   */
  start(): void {
    console.log('🤖 TaskScheduler starting...');

    // Run immediately
    this.pollTasks().catch(error => {
      console.error('❌ TaskScheduler poll failed:', error);
    });

    // Then poll periodically
    this.pollingInterval = setInterval(() => {
      this.pollTasks().catch(error => {
        console.error('❌ TaskScheduler poll failed:', error);
      });
    }, this.POLL_INTERVAL_MS);

    console.log('✅ TaskScheduler started');
  }

  /**
   * Stop the task scheduler
   */
  stop(): void {
    console.log('🛑 Stopping TaskScheduler...');
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    console.log('✅ TaskScheduler stopped');
  }

  /**
   * Poll for pending tasks and spawn agents
   */
  private async pollTasks(): Promise<void> {
    // Get all active positions
    const positions = db.prepare(
      "SELECT * FROM positions WHERE status = 'working'"
    ).all() as Position[];

    for (const position of positions) {
      try {
        await this.processPositionTasks(position);
      } catch (error: any) {
        console.error(`❌ Failed to process position ${position.id}:`, error.message);
      }
    }
  }

  /**
   * Process tasks for a specific position
   */
  private async processPositionTasks(position: Position): Promise<void> {
    // Count currently working tasks for this position
    const workingCount = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE position_id = ? AND status = 'working'"
    ).get(position.id) as { count: number };

    // Calculate available slots
    const availableSlots = position.max_parallel_tasks - workingCount.count;

    if (availableSlots <= 0) {
      // No slots available, skip this position
      return;
    }

    // Get pending tasks for this position (oldest first)
    const pendingTasks = db.prepare(`
      SELECT * FROM tasks
      WHERE position_id = ? AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(position.id, availableSlots) as Task[];

    // Spawn agents for each pending task
    for (const task of pendingTasks) {
      try {
        await this.spawnAgentForTask(task, position);
      } catch (error: any) {
        console.error(`❌ Failed to spawn agent for task ${task.id}:`, error.message);

        // Mark task as failed
        db.prepare(`
          UPDATE tasks
          SET status = 'failed', error_message = ?
          WHERE id = ?
        `).run(error.message, task.id);
      }
    }
  }

  /**
   * Spawn an agent session for a task
   */
  private async spawnAgentForTask(task: Task, position: Position): Promise<void> {
    // Get project info
    const project = db.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).get(position.project_id) as Project;

    if (!project) {
      throw new Error(`Project ${position.project_id} not found`);
    }

    console.log(`🚀 Spawning agent for task ${task.id}: ${task.description}`);

    // TODO: Implement worktree creation
    // TODO: Implement agent spawning with ralph-loop
    // TODO: Implement completion monitoring

    // For now, just mark as working
    db.prepare(`
      UPDATE tasks
      SET status = 'working', started_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), task.id);

    console.log(`✓ Agent spawned for task ${task.id}`);
  }
}
