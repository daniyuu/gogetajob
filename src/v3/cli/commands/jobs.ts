import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDatabase } from '../../db/database';
import { Job, JobType, Difficulty, Company } from '../../db/schema';
import { loadConfig } from '../../config';
import { Accounting } from '../../core/accounting';

interface JobRow extends Job {
  owner?: string;
  repo?: string;
}

/**
 * List jobs with optional filters
 */
function listJobs(options: {
  lang?: string;
  type?: string;
  difficulty?: string;
  hasBounty?: boolean;
  limit?: string;
  sort?: string;
  format?: string;
}): void {
  const db = getDatabase();
  db.runMigrations();

  let sql = `
    SELECT j.*, c.owner, c.repo
    FROM jobs j
    JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'open'
  `;
  const params: unknown[] = [];

  // Apply filters
  if (options.lang) {
    sql += ` AND j.languages LIKE ?`;
    params.push(`%${options.lang}%`);
  }

  if (options.type) {
    sql += ` AND j.job_type = ?`;
    params.push(options.type);
  }

  if (options.difficulty) {
    sql += ` AND j.difficulty = ?`;
    params.push(options.difficulty);
  }

  if (options.hasBounty) {
    sql += ` AND j.has_bounty = 1`;
  }

  // Apply sorting
  switch (options.sort) {
    case 'bounty':
      sql += ` ORDER BY j.bounty_amount DESC NULLS LAST`;
      break;
    case 'merge_rate':
      sql += ` ORDER BY j.merge_probability DESC`;
      break;
    case 'difficulty':
      sql += ` ORDER BY CASE j.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 4 END`;
      break;
    case 'newest':
    default:
      sql += ` ORDER BY j.created_at DESC`;
  }

  // Apply limit
  const limit = options.limit ? parseInt(options.limit, 10) : 20;
  sql += ` LIMIT ?`;
  params.push(limit);

  const jobs = db.query<JobRow>(sql, params);

  if (options.format === 'json') {
    console.log(JSON.stringify(jobs, null, 2));
    return;
  }

  if (jobs.length === 0) {
    console.log(chalk.yellow('\nNo jobs found matching your criteria.'));
    console.log(chalk.dim('Try syncing repos first: gogetajob sync'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Repository'),
      chalk.cyan('Title'),
      chalk.cyan('Type'),
      chalk.cyan('Difficulty'),
      chalk.cyan('Bounty'),
    ],
    colWidths: [6, 25, 40, 12, 12, 10],
    wordWrap: true,
  });

  for (const job of jobs) {
    const difficultyColor =
      job.difficulty === 'easy'
        ? chalk.green
        : job.difficulty === 'medium'
        ? chalk.yellow
        : job.difficulty === 'hard'
        ? chalk.red
        : chalk.dim;

    table.push([
      job.id.toString(),
      `${job.owner}/${job.repo}`,
      job.title.substring(0, 38),
      job.job_type,
      difficultyColor(job.difficulty),
      job.has_bounty ? chalk.green(`$${job.bounty_amount}`) : chalk.dim('-'),
    ]);
  }

  console.log(chalk.bold(`\nOpen Jobs (${jobs.length})`));
  console.log(table.toString());
}

/**
 * Show detailed job information
 */
function showJob(jobId: string, options: { format?: string }): void {
  const db = getDatabase();
  db.runMigrations();

  const job = db.queryOne<JobRow>(
    `SELECT j.*, c.owner, c.repo
     FROM jobs j
     JOIN companies c ON j.company_id = c.id
     WHERE j.id = ?`,
    [parseInt(jobId, 10)]
  );

  if (!job) {
    console.error(chalk.red(`Job #${jobId} not found`));
    process.exit(1);
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(job, null, 2));
    return;
  }

  console.log(chalk.bold(`\nJob #${job.id}: ${job.title}\n`));

  const infoTable = new Table();
  infoTable.push(
    { [chalk.cyan('Repository')]: `${job.owner}/${job.repo}` },
    { [chalk.cyan('Issue')]: `#${job.issue_number}` },
    { [chalk.cyan('URL')]: job.html_url },
    { [chalk.cyan('Type')]: job.job_type },
    { [chalk.cyan('Difficulty')]: job.difficulty },
    { [chalk.cyan('Status')]: job.status },
    { [chalk.cyan('Languages')]: (job.languages || []).join(', ') || '-' },
    { [chalk.cyan('Labels')]: (job.labels || []).join(', ') || '-' },
    { [chalk.cyan('Estimated Tokens')]: job.estimated_tokens.toLocaleString() },
    { [chalk.cyan('Merge Probability')]: `${(job.merge_probability * 100).toFixed(0)}%` },
    { [chalk.cyan('Bounty')]: job.has_bounty ? `$${job.bounty_amount} ${job.bounty_currency}` : '-' }
  );

  console.log(infoTable.toString());

  if (job.context_files && job.context_files.length > 0) {
    console.log(chalk.bold('\nContext Files:'));
    for (const file of job.context_files) {
      console.log(chalk.dim(`  - ${file}`));
    }
  }

  if (job.body) {
    console.log(chalk.bold('\nDescription:'));
    console.log(chalk.dim(job.body.substring(0, 500) + (job.body.length > 500 ? '...' : '')));
  }
}

/**
 * Apply for a job (start work)
 */
function applyJob(jobId: string): void {
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
    console.log(chalk.yellow('\nRemember to report progress with:'));
    console.log(chalk.dim(`  gogetajob report pr ${jobId} --pr <pr_number>`));
    console.log(chalk.dim(`  gogetajob report done ${jobId} --status pr_merged`));
  } catch (error) {
    console.error(chalk.red(`Failed to start work: ${error}`));
    process.exit(1);
  }
}

/**
 * Register jobs command with Commander
 */
export function registerJobsCommand(program: Command): void {
  const jobsCmd = program.command('jobs').description('Manage job listings');

  jobsCmd
    .command('list')
    .description('List available jobs')
    .option('--lang <language>', 'Filter by programming language')
    .option('--type <type>', 'Filter by job type (bug_fix, feature, docs, test, refactor)')
    .option('--difficulty <level>', 'Filter by difficulty (easy, medium, hard)')
    .option('--has-bounty', 'Only show jobs with bounties')
    .option('--limit <n>', 'Limit number of results', '20')
    .option('--sort <field>', 'Sort by field (bounty, merge_rate, difficulty, newest)')
    .option('--format <format>', 'Output format (json)')
    .action(listJobs);

  jobsCmd
    .command('show <id>')
    .description('Show job details')
    .option('--format <format>', 'Output format (json)')
    .action(showJob);

  jobsCmd
    .command('apply <id>')
    .description('Apply for a job (start work)')
    .action(applyJob);
}
