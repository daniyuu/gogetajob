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
import { spawn, execFileSync } from 'child_process';
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

    // Setup project workspace directory using project name from repo URL
    // Extract project name from repo URL (e.g., "daniyuu/gogetajob" from github.com/daniyuu/gogetajob)
    const repoName = project.repo_url
      .replace(/\.git$/, '')  // Remove .git suffix
      .split('/')
      .slice(-2)  // Get last 2 parts (owner/repo)
      .join('-')  // Join with dash
      .replace(/[^a-zA-Z0-9-_]/g, '-');  // Sanitize for filesystem

    const projectWorkspace = path.join(process.cwd(), 'data', 'workspaces', repoName);
    const repoPath = path.join(projectWorkspace, 'repo');

    // Clone repo if not exists
    if (!fs.existsSync(repoPath)) {
      console.log(`   Cloning ${project.repo_url} to ${repoPath}...`);

      // Validate URL to prevent command injection via malformed repo URLs
      if (!this.isValidGitUrl(project.repo_url)) {
        throw new Error(`Invalid repository URL: ${project.repo_url}`);
      }

      fs.mkdirSync(projectWorkspace, { recursive: true });

      try {
        // Use execFileSync with array args to avoid shell injection
        execFileSync('git', ['clone', project.repo_url, 'repo'], {
          cwd: projectWorkspace,
          stdio: 'inherit'
        });
        console.log(`   ✓ Repository cloned successfully`);
      } catch (error: any) {
        throw new Error(`Failed to clone repository: ${error.message}`);
      }
    }

    // Spawn agent in the project repo
    const sessionId = await this.spawnAgent(task, project, repoPath);

    // Mark task as working with session ID
    db.prepare(`
      UPDATE tasks
      SET status = 'working', started_at = ?, assigned_agent_session_id = ?
      WHERE id = ?
    `).run(new Date().toISOString(), sessionId, task.id);

    console.log(`✓ Agent spawned for task ${task.id} (session: ${sessionId})`);
  }

  /**
   * Spawn a Claude agent
   */
  private async spawnAgent(task: Task, project: Project, repoPath: string): Promise<string> {
    const sessionId = `agent-task-${task.id}-${Date.now()}`;

    // Build the prompt
    const prompt = this.buildTaskPrompt(task);

    // Get position info for API access
    const position = db.prepare(
      'SELECT * FROM positions WHERE id = ?'
    ).get(task.position_id) as Position;

    // Create temp directory
    const tempDir = path.join(process.cwd(), '.gogetajob', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write prompt to a file to avoid batch script parsing issues
    const promptPath = path.join(tempDir, `prompt-${task.id}.txt`);
    fs.writeFileSync(promptPath, prompt, 'utf-8');

    // Create PowerShell script to spawn new terminal with Claude
    const scriptPath = path.join(tempDir, `spawn-${task.id}.ps1`);

    // PowerShell script - launch Claude in the project repo directory
    const scriptContent = `$Host.UI.RawUI.WindowTitle = "GoGetAJob Agent - Task ${task.id}"
$ErrorActionPreference = "Continue"
Set-Location "${repoPath}"
Write-Host "Starting agent for task ${task.id}"
Write-Host "Working directory: $(Get-Location)"
Write-Host "Project: ${project.name}"
Write-Host ""

# Unset CLAUDECODE to allow nested sessions
Write-Host "Removing CLAUDECODE environment variable..."
Remove-Item Env:\\CLAUDECODE -ErrorAction SilentlyContinue

# Set GoGetAJob API access environment variables
$env:GOGETAJOB_API_URL = "http://localhost:9393"
$env:GOGETAJOB_POSITION_ID = "${position.id}"
$env:GOGETAJOB_TASK_ID = "${task.id}"
Write-Host "GoGetAJob API configured: $env:GOGETAJOB_API_URL"
Write-Host "Position ID: $env:GOGETAJOB_POSITION_ID"
Write-Host "Current Task ID: $env:GOGETAJOB_TASK_ID"
Write-Host ""

# Read the prompt from file
Write-Host "Reading prompt from: ${promptPath}"
$prompt = Get-Content "${promptPath}" -Raw
Write-Host "Prompt loaded (length: $($prompt.Length) chars)"
Write-Host ""

# Launch Claude Code
Write-Host "Launching Claude Code..."
Write-Host "Prompt: $prompt"
Write-Host ""
Write-Host "=========================================="
Write-Host ""

# Just pass the prompt directly without --worktree flag
# Claude will work in the current directory (repo)
& claude "$prompt"

$exitCode = $LASTEXITCODE
Write-Host ""
Write-Host "=========================================="
Write-Host ""

if ($exitCode -ne 0) {
    Write-Host "Claude exited with code: $exitCode" -ForegroundColor Red
    Write-Host ""
    Write-Host "Task failed. Press Enter to close..."
    Read-Host
} else {
    Write-Host "Claude exited successfully (code: 0)" -ForegroundColor Green
    Write-Host ""

    # Check if task is marked as completed via API
    try {
        $taskStatus = Invoke-RestMethod -Uri "$env:GOGETAJOB_API_URL/api/tasks/$env:GOGETAJOB_TASK_ID" -Method GET

        if ($taskStatus.status -eq 'completed') {
            Write-Host "✅ Task marked as COMPLETED - closing in 3 seconds..." -ForegroundColor Green
            Start-Sleep -Seconds 3
            exit 0
        } else {
            Write-Host "Task status: $($taskStatus.status)" -ForegroundColor Yellow
            Write-Host "Press Enter to close..."
            Read-Host
        }
    } catch {
        Write-Host "Could not check task status. Press Enter to close..."
        Read-Host
    }
}

Write-Host ""
Write-Host "Agent window closing for task ${task.id}"
`;

    fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

    // Spawn new PowerShell window with the script
    // Use cmd.exe /c start to open a new visible window
    spawn('cmd.exe', ['/c', 'start', 'powershell.exe', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: repoPath
    }).unref();

    console.log(`   Spawned PowerShell window for task ${task.id}`);

    return sessionId;
  }

  /**
   * Validate that a URL is a safe git repository URL
   */
  private isValidGitUrl(url: string): boolean {
    // Only allow HTTPS GitHub URLs (the expected format for this application)
    const githubHttps = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/;
    return githubHttps.test(url);
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

    // Simple prompt - crew plugin will guide the agent through the workflow
    // Replace newlines with spaces to avoid command injection security checks
    // Use simple text format to avoid shell operators triggering security checks
    const cleanDescription = task.description.replace(/\n+/g, ' ').trim();
    return `You are an autonomous AI agent contributing to: ${project.name}. Your task: ${cleanDescription}. When completed, include the text: ${task.completion_promise}`;
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
      if (!fs.existsSync(worktreePath)) {
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
