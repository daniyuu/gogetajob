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

  constructor(options: WorkerOptions) {
    this.options = options;
    this.githubToken = options.githubToken;
  }

  /**
   * Start the AI worker
   */
  async start(): Promise<void> {
    const { workDir, repoUrl, positionId, projectName } = this.options;

    console.log(`[Worker ${positionId}] Starting for ${projectName}`);

    // Ensure workspace directory
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    // Setup repository
    await this.setupRepository();

    // Start continuous contribution loop
    await this.contributionLoop();
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.process && !this.process.killed) {
      console.log(`[Worker ${this.options.positionId}] Stopping...`);
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
      console.log('[Worker] Updating repository...');
      try {
        execSync('git pull --rebase', { cwd: repoDir, stdio: 'ignore' });
      } catch (error) {
        console.warn('[Worker] Failed to pull, will re-clone');
        fs.rmSync(repoDir, { recursive: true, force: true });
      }
    }

    if (!fs.existsSync(repoDir)) {
      console.log('[Worker] Cloning repository...');
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
   * Execute Claude Code with the prompt
   */
  private async executeClaude(
    prompt: string,
    cwd: string,
    issueNumber: number,
    branchName: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[Worker] Invoking Claude Code...');

      // Spawn Claude CLI
      const claude = spawn('claude', [
        '--dangerously-skip-permissions',
        '--continue',
        prompt
      ], {
        cwd,
        stdio: 'pipe',
        shell: true
      });

      this.process = claude;

      let output = '';
      let errorOutput = '';

      claude.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);

        // Track token usage
        const tokenMatch = text.match(/tokens?[:\s]+(\d+)/i);
        if (tokenMatch) {
          this.tokenUsed += parseInt(tokenMatch[1]);
          this.updateTokenCost();
        }

        // Capture session ID
        const sessionMatch = text.match(/session[_-]?id[:\s]+([a-f0-9-]+)/i);
        if (sessionMatch) {
          this.sessionId = sessionMatch[1];
        }
      });

      claude.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        process.stderr.write(data);
      });

      claude.on('exit', async (code) => {
        console.log(`\n[Worker] Claude exited with code ${code}`);
        this.process = null;

        if (code === 0) {
          // Check for changes
          try {
            const status = execSync('git status --porcelain', { cwd }).toString();

            if (status.trim()) {
              console.log('[Worker] Changes detected, committing...');

              // Commit changes
              execSync('git add .', { cwd });
              execSync(`git commit -m "Fix issue #${issueNumber}\n\nCloses #${issueNumber}\n\nCo-Authored-By: GoGetAJob <noreply@gogetajob.dev>"`, {
                cwd,
                stdio: 'inherit'
              });

              // Push branch
              console.log('[Worker] Pushing to remote...');
              execSync(`git push -u origin ${branchName}`, { cwd, stdio: 'inherit' });

              // Record PR (URL would be constructed, actual PR creation requires GitHub API token)
              const match = this.options.repoUrl.match(/github\.com\/(.+?)(?:\.git)?$/);
              if (match) {
                const repoPath = match[1];
                const prUrl = `https://github.com/${repoPath}/compare/${branchName}?expand=1`;
                this.recordPR(prUrl, issueNumber);
                console.log(`[Worker] PR ready: ${prUrl}`);
              }
            } else {
              console.log('[Worker] No changes made');
            }
          } catch (error: any) {
            console.error('[Worker] Failed to commit/push:', error.message);
          }
        }

        resolve();
      });

      claude.on('error', (error) => {
        console.error('[Worker] Process error:', error);
        reject(error);
      });
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
