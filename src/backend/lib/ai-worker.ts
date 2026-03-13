/**
 * AI Worker - Autonomous contribution bot
 * Based on justdoit's executor pattern
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { db } from './database';

interface WorkerOptions {
  repoUrl: string;
  workDir: string;
  positionId: number;
  projectName: string;
  githubToken?: string;
}

export class AIWorker {
  private options: WorkerOptions;
  private process: ChildProcess | null = null;
  private tokenUsed: number = 0;
  private sessionId: string | null = null;
  private githubToken?: string;
  private logFile: string;

  constructor(options: WorkerOptions) {
    this.options = options;
    this.githubToken = options.githubToken;

    // Create log file path
    const logDir = path.join(process.cwd(), 'data', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, `worker-${options.positionId}.log`);

    // Clear previous log
    fs.writeFileSync(this.logFile, '');
  }

  /**
   * Log message to both console and file
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(this.logFile, line);
  }

  /**
   * Start the AI worker
   */
  async start(): Promise<void> {
    this.log(`[Worker] start() method called`);
    const { workDir, repoUrl, positionId, projectName } = this.options;

    this.log(`[Worker ${positionId}] Starting for ${projectName}`);
    this.log(`[Worker ${positionId}] Work directory: ${workDir}`);
    this.log(`[Worker ${positionId}] Repo URL: ${repoUrl}`);

    // Ensure workspace directory
    if (!fs.existsSync(workDir)) {
      this.log(`[Worker ${positionId}] Creating work directory...`);
      fs.mkdirSync(workDir, { recursive: true });
    } else {
      this.log(`[Worker ${positionId}] Work directory exists`);
    }

    // Setup repository
    this.log(`[Worker ${positionId}] Setting up repository...`);
    await this.setupRepository();
    this.log(`[Worker ${positionId}] Repository setup complete`);

    // Start continuous contribution loop
    this.log(`[Worker ${positionId}] Starting contribution loop...`);
    await this.contributionLoop();
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.process && !this.process.killed) {
      this.log(`[Worker ${this.options.positionId}] Stopping...`);
      this.process.kill('SIGTERM');

      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 3000);
    }
  }

  /**
   * Setup/update repository
   */
  private async setupRepository(): Promise<void> {
    const { workDir, repoUrl } = this.options;
    const repoDir = path.join(workDir, 'repo');

    if (fs.existsSync(repoDir)) {
      this.log('[Worker] Updating repository...');
      try {
        execSync('git pull --rebase', { cwd: repoDir, stdio: 'ignore' });
      } catch (error) {
        this.log('[Worker] Failed to pull, will re-clone');
        fs.rmSync(repoDir, { recursive: true, force: true });
      }
    }

    if (!fs.existsSync(repoDir)) {
      this.log('[Worker] Cloning repository...');
      execSync(`git clone ${repoUrl} repo`, { cwd: workDir, stdio: 'inherit' });
    }
  }

  /**
   * Main contribution loop
   */
  private async contributionLoop(): Promise<void> {
    while (true) {
      try {
        // Find an issue to work on
        const issue = await this.findNextIssue();

        if (!issue) {
          console.log('[Worker] No suitable issues found, waiting...');
          await this.sleep(300000); // 5 minutes
          continue;
        }

        // Work on the issue
        await this.workOnIssue(issue);

        // Wait before next issue
        await this.sleep(60000); // 1 minute
      } catch (error: any) {
        console.error('[Worker] Error in contribution loop:', error.message);
        await this.sleep(120000); // 2 minutes
      }
    }
  }

  /**
   * Find next issue to work on
   */
  private async findNextIssue(): Promise<any | null> {
    const match = this.options.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
    if (!match) return null;

    const [, owner, repo] = match;

    // Try different labels
    const labels = ['good first issue', 'help wanted', 'bug', 'enhancement'];

    for (const label of labels) {
      const url = `https://api.github.com/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=10`;

      try {
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GoGetAJob-Worker/1.0'
        };

        if (this.githubToken) {
          headers['Authorization'] = `Bearer ${this.githubToken}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
          console.log(`[Worker] GitHub API returned ${response.status} for label "${label}"`);
          continue;
        }

        const issues = await response.json() as any[];
        console.log(`[Worker] Found ${issues.length} issues with label "${label}"`);
        if (issues.length > 0) {
          // Return first unassigned issue
          return issues.find((i: any) => !i.assignee) || issues[0];
        }
      } catch (error) {
        console.error(`[Worker] Failed to fetch issues with label "${label}"`, error);
      }
    }

    return null;
  }

  /**
   * Work on a specific issue using Claude Code
   */
  private async workOnIssue(issue: any): Promise<void> {
    console.log(`[Worker ${this.options.positionId}] Working on issue #${issue.number}: ${issue.title}`);

    const repoDir = path.join(this.options.workDir, 'repo');
    const branchName = `gogetajob-issue-${issue.number}`;

    // Checkout main and pull latest
    try {
      execSync('git checkout main', { cwd: repoDir, stdio: 'ignore' });
      execSync('git pull', { cwd: repoDir, stdio: 'ignore' });
    } catch (error) {
      console.warn('[Worker] Failed to update main branch');
    }

    // Create feature branch
    try {
      execSync(`git checkout -b ${branchName}`, { cwd: repoDir, stdio: 'ignore' });
    } catch {
      // Branch exists, use it
      execSync(`git checkout ${branchName}`, { cwd: repoDir, stdio: 'ignore' });
    }

    // Build prompt for Claude
    const prompt = this.buildPrompt(issue);

    // Execute Claude Code
    await this.executeClaude(prompt, repoDir, issue.number, branchName);
  }

  /**
   * Build prompt for Claude Code
   */
  private buildPrompt(issue: any): string {
    return `
You are an AI contributor working on an open source project. Your task is to solve the following GitHub issue:

**Issue #${issue.number}**: ${issue.title}

${issue.body || 'No description provided'}

${issue.html_url}

Please:
1. Carefully analyze the issue and understand what needs to be done
2. Make the necessary code changes to fix the issue
3. Ensure the changes follow the project's coding style and conventions
4. Test your changes if possible
5. Create a commit with a clear, descriptive message

Your commit message should:
- Start with a clear, concise summary (50 chars or less)
- Reference the issue number using "Fixes #${issue.number}" or "Closes #${issue.number}"
- Include any relevant details in the commit body

Example format:
\`\`\`
Fix: resolve data validation issue

- Add input validation for user data
- Handle edge cases for empty strings
- Add unit tests for validation logic

Fixes #${issue.number}
\`\`\`

Begin working on this issue now.
`.trim();
  }

  /**
   * Execute Claude Code with the prompt in a new terminal window
   */
  private async executeClaude(
    prompt: string,
    cwd: string,
    issueNumber: number,
    branchName: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.log('[Worker] Opening Claude Code in new terminal window...');
      this.log(`[Worker] Work directory: ${cwd}`);
      this.log(`[Worker] Issue #${issueNumber}: ${branchName}`);

      // Create a batch script to launch the worker
      const scriptPath = path.join(this.options.workDir, `worker-${this.options.positionId}.bat`);

      // Write prompt to a separate file to avoid escaping issues
      const promptPath = path.join(this.options.workDir, `prompt-${this.options.positionId}.txt`);
      fs.writeFileSync(promptPath, prompt, 'utf8');

      // Create batch script content - read prompt from file
      const batchScript = `@echo off
title GoGetAJob Worker - Issue #${issueNumber}
cd /d "${cwd}"
echo [GoGetAJob Worker] Starting Claude Code session...
echo [GoGetAJob Worker] Work directory: ${cwd}
echo [GoGetAJob Worker] Issue: #${issueNumber}
echo.
set /p PROMPT=<"${promptPath}"
claude --dangerously-skip-permissions "%PROMPT%"
echo.
echo [GoGetAJob Worker] Claude session ended
pause
`;

      // Write batch script
      fs.writeFileSync(scriptPath, batchScript);
      this.log(`[Worker] Created batch script: ${scriptPath}`);

      // Launch the batch script in a new window
      const startCmd = spawn('cmd.exe', [
        '/c',
        'start',
        'cmd.exe',
        '/k',
        scriptPath
      ], {
        detached: true,
        stdio: 'ignore',
        shell: true
      });

      startCmd.unref();

      this.log('[Worker] Terminal window opened - you can now interact with Claude');
      this.log('[Worker] The worker will wait for Claude to complete...');

      // Since we can't monitor the spawned window, we resolve immediately
      // The user will interact directly in that window
      setTimeout(() => {
        this.log('[Worker] Note: Check the CMD window for Claude Code output');
        resolve();
      }, 2000);
    });
  }

  /**
   * Update token cost in database
   */
  private updateTokenCost(): void {
    db.prepare('UPDATE positions SET token_cost = ? WHERE id = ?')
      .run(this.tokenUsed, this.options.positionId);
  }

  /**
   * Record a submitted PR
   */
  private recordPR(prUrl: string, issueNumber: number): void {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO pull_requests (position_id, pr_url, status, created_at)
      VALUES (?, ?, 'open', ?)
    `).run(this.options.positionId, prUrl, now);

    db.prepare(`
      INSERT INTO notifications (position_id, type, message, is_read, created_at)
      VALUES (?, 'pr_submitted', ?, 0, ?)
    `).run(
      this.options.positionId,
      `New PR submitted for issue #${issueNumber}: ${prUrl}`,
      now
    );

    console.log(`[Worker] Recorded PR: ${prUrl}`);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
