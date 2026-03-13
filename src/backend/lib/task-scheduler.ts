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

  constructor() {
    // Constructor now empty - worktrees managed by Claude Code
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

      // Also monitor for completion
      this.monitorCompletion().catch(error => {
        console.error('❌ Completion monitoring failed:', error);
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

    // Generate worktree name for Claude Code's native --worktree flag
    const worktreeName = `task-${task.id}`;
    const worktreePath = path.join(process.cwd(), '.claude', 'worktrees', worktreeName);

    // Spawn agent with ralph-loop in isolated worktree
    const sessionId = await this.spawnAgent(task, worktreeName);

    // Mark task as working with worktree path and session ID
    db.prepare(`
      UPDATE tasks
      SET status = 'working', started_at = ?, worktree_path = ?, assigned_agent_session_id = ?
      WHERE id = ?
    `).run(new Date().toISOString(), worktreePath, sessionId, task.id);

    console.log(`✓ Agent spawned for task ${task.id} (session: ${sessionId}) in worktree ${worktreeName}`);
  }

  /**
   * Spawn a Claude agent with ralph-loop
   */
  private async spawnAgent(task: Task, worktreeName: string): Promise<string> {
    const sessionId = `agent-task-${task.id}-${Date.now()}`;
    const projectRoot = process.cwd();

    // Build the prompt for ralph-loop
    const prompt = this.buildTaskPrompt(task);

    // Create batch script to spawn CMD window with Claude
    const scriptPath = path.join(projectRoot, '.gogetajob', 'temp', `spawn-${task.id}.bat`);
    const scriptDir = path.dirname(scriptPath);

    // Ensure temp directory exists
    if (!require('fs').existsSync(scriptDir)) {
      require('fs').mkdirSync(scriptDir, { recursive: true });
    }

    // Write batch script
    const scriptContent = `@echo off
title GoGetAJob Agent - Task ${task.id}
cd /d "${projectRoot}"
echo Starting agent for task ${task.id} in worktree ${worktreeName}
echo.
claude --worktree ${worktreeName} /ralph-loop "${prompt.replace(/"/g, '""')}" --completion-promise "${task.completion_promise}" --max-iterations 100
echo.
echo Agent completed for task ${task.id}
pause
`;

    require('fs').writeFileSync(scriptPath, scriptContent, 'utf-8');

    // Spawn CMD window with the script
    spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: projectRoot
    }).unref();

    console.log(`   Spawned CMD window for task ${task.id}`);

    return sessionId;
  }

  /**
   * Build the prompt for ralph-loop
   */
  private buildTaskPrompt(task: Task): string {
    // Get project info
    const position = db.prepare(
      'SELECT * FROM positions WHERE id = ?'
    ).get(task.position_id) as Position;

    const project = db.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).get(position.project_id) as Project;

    return `You are an autonomous AI agent contributing to: ${project.name}

Your task: ${task.description}

You have full autonomy to:
- Explore using /codebase-research
- Plan using /brainstorming
- Create sub-tasks by inserting to database
- Implement changes
- Commit using /codeblend-commit

When completed: <promise>${task.completion_promise}</promise>`;
  }

  /**
   * Monitor working tasks for completion
   */
  private async monitorCompletion(): Promise<void> {
    // Get all working tasks
    const workingTasks = db.prepare(
      "SELECT * FROM tasks WHERE status = 'working'"
    ).all() as Task[];

    for (const task of workingTasks) {
      try {
        // Check if task has completed by looking for new commits in worktree
        const hasNewCommits = await this.checkForNewCommits(task);

        if (hasNewCommits) {
          // Check if completion promise was detected
          const completionDetected = await this.checkCompletionPromise(task);

          if (completionDetected) {
            // Mark task as completed
            db.prepare(`
              UPDATE tasks
              SET status = 'completed', completed_at = ?
              WHERE id = ?
            `).run(new Date().toISOString(), task.id);

            console.log(`✅ Task ${task.id} completed!`);

            // TODO: Cleanup worktree
          }
        }
      } catch (error: any) {
        console.error(`❌ Failed to monitor task ${task.id}:`, error.message);
      }
    }
  }

  /**
   * Check if a task has new commits
   */
  private async checkForNewCommits(task: Task): Promise<boolean> {
    if (!task.worktree_path) {
      return false;
    }

    const worktreePath = task.worktree_path; // Type guard

    try {
      // Check if worktree directory exists
      if (!require('fs').existsSync(worktreePath)) {
        return false;
      }

      // Get commit count in worktree
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('git', ['rev-list', '--count', 'HEAD'], {
          cwd: worktreePath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code: number | null) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`Git command failed: ${stderr}`));
          }
        });

        proc.on('error', (error: Error) => {
          reject(error);
        });
      });

      const commitCount = parseInt(result, 10);
      return commitCount > 0;
    } catch (error: any) {
      console.error(`   Failed to check commits for task ${task.id}:`, error.message);
      return false;
    }
  }

  /**
   * Check if completion promise was detected in task worktree
   */
  private async checkCompletionPromise(task: Task): Promise<boolean> {
    if (!task.worktree_path || !task.completion_promise) {
      return false;
    }

    const worktreePath = task.worktree_path; // Type guard

    try {
      // Check latest commit message for completion promise
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('git', ['log', '-1', '--pretty=%B'], {
          cwd: worktreePath,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('close', (code: number | null) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Git command failed: ${stderr}`));
          }
        });

        proc.on('error', (error: Error) => {
          reject(error);
        });
      });

      // Check if completion promise appears in commit message
      const promiseTag = `<promise>${task.completion_promise}</promise>`;
      return result.includes(promiseTag);
    } catch (error: any) {
      console.error(`   Failed to check completion promise for task ${task.id}:`, error.message);
      return false;
    }
  }
}
