import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDatabase } from '../../db/database';
import { WorkReport, WorkStatus, Job } from '../../db/schema';
import { Accounting } from '../../core/accounting';
import { loadConfig } from '../../config';

interface WorkReportRow extends WorkReport {
  job_title?: string;
  owner?: string;
  repo?: string;
}

/**
 * Start work on a job
 */
function startWork(jobId: string): void {
  const db = getDatabase();
  db.runMigrations();

  const config = loadConfig();
  const accounting = new Accounting(db);

  const job = db.queryOne<Job>('SELECT * FROM jobs WHERE id = ?', [parseInt(jobId, 10)]);

  if (!job) {
    console.error(chalk.red(`Job #${jobId} not found`));
    process.exit(1);
  }

  if (job.status !== 'open') {
    console.error(chalk.red(`Job #${jobId} is not open (status: ${job.status})`));
    process.exit(1);
  }

  try {
    const workReport = accounting.startWork(job.id, config.agent_id);
    console.log(chalk.green(`\nStarted work on Job #${jobId}`));
    console.log(chalk.dim(`Work Report ID: ${workReport.id}`));
    console.log(chalk.dim(`Agent: ${config.agent_id}`));
    console.log(chalk.cyan(`\nURL: ${job.html_url}`));
  } catch (error) {
    console.error(chalk.red(`Failed to start work: ${error}`));
    process.exit(1);
  }
}

/**
 * Report PR submission
 */
function reportPR(jobId: string, options: { pr: string; url?: string; tokens?: string }): void {
  const db = getDatabase();
  db.runMigrations();

  const config = loadConfig();

  const prNumber = parseInt(options.pr, 10);
  if (isNaN(prNumber)) {
    console.error(chalk.red('PR number must be a valid number'));
    process.exit(1);
  }

  // Find the active work report for this job
  const workReport = db.queryOne<WorkReport>(
    `SELECT * FROM work_reports
     WHERE job_id = ? AND agent_id = ? AND status = 'in_progress'
     ORDER BY started_at DESC LIMIT 1`,
    [parseInt(jobId, 10), config.agent_id]
  );

  if (!workReport) {
    console.error(chalk.red(`No active work report found for Job #${jobId}`));
    console.log(chalk.dim('Start work first: gogetajob report start ' + jobId));
    process.exit(1);
  }

  // Get job info for PR URL
  const job = db.queryOne<{ html_url: string; owner?: string; repo?: string }>(
    `SELECT j.html_url, c.owner, c.repo
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`,
    [parseInt(jobId, 10)]
  );

  const prUrl = options.url || `https://github.com/${job?.owner}/${job?.repo}/pull/${prNumber}`;

  const accounting = new Accounting(db);
  const tokens = options.tokens ? parseInt(options.tokens, 10) : undefined;

  try {
    accounting.submitPR(workReport.id, prNumber, prUrl, tokens);
    console.log(chalk.green(`\nPR #${prNumber} reported for Job #${jobId}`));
    console.log(chalk.dim(`PR URL: ${prUrl}`));
    if (tokens) {
      console.log(chalk.dim(`Tokens used: ${tokens.toLocaleString()}`));
    }
  } catch (error) {
    console.error(chalk.red(`Failed to report PR: ${error}`));
    process.exit(1);
  }
}

/**
 * Complete work on a job
 */
function completeWork(
  jobId: string,
  options: { status: string; tokens?: string }
): void {
  const db = getDatabase();
  db.runMigrations();

  const config = loadConfig();

  const validStatuses: WorkStatus[] = ['pr_merged', 'pr_closed', 'abandoned'];
  if (!validStatuses.includes(options.status as WorkStatus)) {
    console.error(chalk.red(`Invalid status: ${options.status}`));
    console.log(chalk.dim(`Valid statuses: ${validStatuses.join(', ')}`));
    process.exit(1);
  }

  // Find the latest work report for this job
  const workReport = db.queryOne<WorkReport>(
    `SELECT * FROM work_reports
     WHERE job_id = ? AND agent_id = ? AND status IN ('in_progress', 'pr_submitted')
     ORDER BY started_at DESC LIMIT 1`,
    [parseInt(jobId, 10), config.agent_id]
  );

  if (!workReport) {
    console.error(chalk.red(`No active work report found for Job #${jobId}`));
    process.exit(1);
  }

  const accounting = new Accounting(db);
  const tokens = options.tokens ? parseInt(options.tokens, 10) : undefined;

  try {
    const updated = accounting.completeWork(workReport.id, options.status as WorkStatus, tokens);

    const statusColor =
      options.status === 'pr_merged'
        ? chalk.green
        : options.status === 'abandoned'
        ? chalk.red
        : chalk.yellow;

    console.log(statusColor(`\nWork on Job #${jobId} completed with status: ${options.status}`));
    console.log(chalk.dim(`Total tokens: ${updated.token_cost.toLocaleString()}`));
  } catch (error) {
    console.error(chalk.red(`Failed to complete work: ${error}`));
    process.exit(1);
  }
}

/**
 * Show work history
 */
function showHistory(options: { limit?: string; format?: string }): void {
  const db = getDatabase();
  db.runMigrations();

  const config = loadConfig();
  const limit = options.limit ? parseInt(options.limit, 10) : 20;

  const reports = db.query<WorkReportRow>(
    `SELECT wr.*, j.title as job_title, c.owner, c.repo
     FROM work_reports wr
     JOIN jobs j ON wr.job_id = j.id
     JOIN companies c ON j.company_id = c.id
     WHERE wr.agent_id = ?
     ORDER BY wr.started_at DESC
     LIMIT ?`,
    [config.agent_id, limit]
  );

  if (options.format === 'json') {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  if (reports.length === 0) {
    console.log(chalk.yellow('\nNo work history found.'));
    console.log(chalk.dim('Start working on a job: gogetajob jobs apply <id>'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Job'),
      chalk.cyan('Repository'),
      chalk.cyan('Status'),
      chalk.cyan('PR'),
      chalk.cyan('Tokens'),
      chalk.cyan('Started'),
    ],
    colWidths: [6, 30, 25, 14, 8, 12, 12],
    wordWrap: true,
  });

  for (const report of reports) {
    const statusColor =
      report.status === 'pr_merged'
        ? chalk.green
        : report.status === 'in_progress'
        ? chalk.blue
        : report.status === 'pr_submitted'
        ? chalk.cyan
        : report.status === 'abandoned'
        ? chalk.red
        : chalk.yellow;

    table.push([
      report.id.toString(),
      (report.job_title || '').substring(0, 28),
      `${report.owner}/${report.repo}`,
      statusColor(report.status),
      report.pr_number ? `#${report.pr_number}` : chalk.dim('-'),
      report.token_cost.toLocaleString(),
      new Date(report.started_at).toLocaleDateString(),
    ]);
  }

  console.log(chalk.bold(`\nWork History for ${config.agent_id} (${reports.length} entries)`));
  console.log(table.toString());

  // Show stats summary
  const accounting = new Accounting(db);
  const stats = accounting.getAgentStats(config.agent_id);

  console.log(chalk.bold('\nSummary:'));
  console.log(chalk.dim(`  Total Jobs: ${stats.total_jobs}`));
  console.log(chalk.dim(`  Merged PRs: ${stats.merged_prs}/${stats.total_prs}`));
  console.log(chalk.dim(`  Success Rate: ${(stats.success_rate * 100).toFixed(1)}%`));
  console.log(chalk.dim(`  Total Tokens: ${stats.total_token_cost.toLocaleString()}`));
}

/**
 * Register report command with Commander
 */
export function registerReportCommand(program: Command): void {
  const reportCmd = program.command('report').description('Report work progress');

  reportCmd
    .command('start <job_id>')
    .description('Start work on a job')
    .action(startWork);

  reportCmd
    .command('pr <job_id>')
    .description('Report PR submission')
    .requiredOption('--pr <number>', 'PR number')
    .option('--url <url>', 'PR URL (auto-generated if not provided)')
    .option('--tokens <count>', 'Token cost for this work')
    .action(reportPR);

  reportCmd
    .command('done <job_id>')
    .description('Complete work on a job')
    .requiredOption('--status <status>', 'Final status (pr_merged, pr_closed, abandoned)')
    .option('--tokens <count>', 'Additional token cost')
    .action(completeWork);

  reportCmd
    .command('history')
    .description('Show work history')
    .option('--limit <n>', 'Number of entries to show', '20')
    .option('--format <format>', 'Output format (json)')
    .action(showHistory);
}
