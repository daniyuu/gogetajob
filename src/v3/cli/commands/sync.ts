import { Command } from 'commander';
import chalk from 'chalk';
import { getDatabase } from '../../db/database';
import { Company } from '../../db/schema';
import { GitHubClient } from '../../github/client';
import { CompanyProfiler } from '../../core/company-profiler';
import { JobDiscovery } from '../../core/job-discovery';
import { JDParser } from '../../core/jd-parser';
import { loadConfig } from '../../config';

/**
 * Sync all companies and jobs
 */
async function syncAll(): Promise<void> {
  console.log(chalk.bold('\nSyncing all companies and jobs...\n'));

  await syncCompanies();
  await syncJobs();

  console.log(chalk.green('\nSync complete!'));
}

/**
 * Sync company profiles only
 */
async function syncCompanies(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.github_token || undefined);

  const db = getDatabase();
  db.runMigrations();

  const profiler = new CompanyProfiler(client, db);

  // Get all tracked companies
  const companies = db.query<Company>(
    `SELECT * FROM companies
     WHERE id NOT IN (
       SELECT c.id FROM companies c
       JOIN blacklist b ON c.owner = b.owner AND (b.repo IS NULL OR c.repo = b.repo)
     )`
  );

  if (companies.length === 0) {
    console.log(chalk.yellow('No companies to sync.'));
    console.log(chalk.dim('Add a company: gogetajob company add owner/repo'));
    return;
  }

  console.log(chalk.dim(`Syncing ${companies.length} companies...`));

  let successCount = 0;
  let errorCount = 0;

  for (const company of companies) {
    try {
      process.stdout.write(chalk.dim(`  ${company.owner}/${company.repo}... `));
      const profile = await profiler.analyze(company.owner, company.repo);
      await profiler.saveToDatabase(profile);
      console.log(chalk.green('OK'));
      successCount++;
    } catch (error) {
      console.log(chalk.red('FAILED'));
      errorCount++;
    }
  }

  console.log(chalk.dim(`\nCompanies synced: ${successCount}/${companies.length}`));
  if (errorCount > 0) {
    console.log(chalk.yellow(`Errors: ${errorCount}`));
  }
}

/**
 * Sync jobs only
 */
async function syncJobs(): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.github_token || undefined);

  const db = getDatabase();
  db.runMigrations();

  const discovery = new JobDiscovery(client, db);
  const parser = new JDParser();

  // Get all tracked companies
  const companies = db.query<Company>(
    `SELECT * FROM companies
     WHERE id NOT IN (
       SELECT c.id FROM companies c
       JOIN blacklist b ON c.owner = b.owner AND (b.repo IS NULL OR c.repo = b.repo)
     )
     AND is_active = 1`
  );

  if (companies.length === 0) {
    console.log(chalk.yellow('No active companies to sync jobs from.'));
    return;
  }

  console.log(chalk.dim(`\nSyncing jobs from ${companies.length} active companies...`));

  let totalJobs = 0;

  for (const company of companies) {
    try {
      process.stdout.write(chalk.dim(`  ${company.owner}/${company.repo}... `));

      const issues = await discovery.discoverFromRepo(company.owner, company.repo);

      for (const issue of issues) {
        const parsed = parser.parse(issue, company.pr_merge_rate);

        db.run(
          `INSERT INTO jobs (
            company_id, issue_number, title, body, labels, html_url,
            job_type, difficulty, languages, estimated_tokens, context_files,
            has_bounty, bounty_amount, bounty_currency, merge_probability, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
          ON CONFLICT(company_id, issue_number) DO UPDATE SET
            title = excluded.title,
            body = excluded.body,
            labels = excluded.labels,
            job_type = excluded.job_type,
            difficulty = excluded.difficulty,
            languages = excluded.languages,
            estimated_tokens = excluded.estimated_tokens,
            context_files = excluded.context_files,
            has_bounty = excluded.has_bounty,
            bounty_amount = excluded.bounty_amount,
            bounty_currency = excluded.bounty_currency,
            merge_probability = excluded.merge_probability,
            parsed_at = datetime('now'),
            updated_at = datetime('now')`,
          [
            company.id,
            parsed.issue_number,
            parsed.title,
            parsed.body,
            JSON.stringify(parsed.labels),
            parsed.html_url,
            parsed.job_type,
            parsed.difficulty,
            JSON.stringify([company.language].filter(Boolean)),
            parsed.estimated_tokens,
            JSON.stringify(parsed.context_files),
            parsed.has_bounty ? 1 : 0,
            parsed.bounty_amount,
            parsed.bounty_currency,
            parsed.merge_probability,
          ]
        );
      }

      console.log(chalk.green(`${issues.length} jobs`));
      totalJobs += issues.length;
    } catch (error) {
      console.log(chalk.red('FAILED'));
    }
  }

  console.log(chalk.dim(`\nTotal jobs synced: ${totalJobs}`));
}

/**
 * Add and sync a new repository
 */
async function addAndSync(repoInput: string): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.github_token || undefined);

  const parsed = client.parseRepoIdentifier(repoInput);
  if (!parsed) {
    console.error(chalk.red('Invalid repository format. Use owner/repo or full GitHub URL'));
    process.exit(1);
  }

  const db = getDatabase();
  db.runMigrations();

  const profiler = new CompanyProfiler(client, db);
  const discovery = new JobDiscovery(client, db);
  const parser = new JDParser();

  try {
    // Analyze and save company profile
    console.log(chalk.dim(`\nAnalyzing ${parsed.owner}/${parsed.repo}...`));
    const profile = await profiler.analyze(parsed.owner, parsed.repo);
    await profiler.saveToDatabase(profile);
    console.log(chalk.green(`Added ${parsed.owner}/${parsed.repo}`));

    // Get company ID
    const company = db.queryOne<Company>(
      'SELECT * FROM companies WHERE owner = ? AND repo = ?',
      [parsed.owner, parsed.repo]
    );

    if (!company) {
      console.error(chalk.red('Failed to retrieve company after adding'));
      process.exit(1);
    }

    // Discover and save jobs
    console.log(chalk.dim(`Discovering jobs...`));
    const issues = await discovery.discoverFromRepo(parsed.owner, parsed.repo);

    let jobCount = 0;
    for (const issue of issues) {
      const parsedJob = parser.parse(issue, profile.pr_merge_rate);

      db.run(
        `INSERT INTO jobs (
          company_id, issue_number, title, body, labels, html_url,
          job_type, difficulty, languages, estimated_tokens, context_files,
          has_bounty, bounty_amount, bounty_currency, merge_probability, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        ON CONFLICT(company_id, issue_number) DO UPDATE SET
          title = excluded.title,
          body = excluded.body,
          labels = excluded.labels,
          job_type = excluded.job_type,
          difficulty = excluded.difficulty,
          updated_at = datetime('now')`,
        [
          company.id,
          parsedJob.issue_number,
          parsedJob.title,
          parsedJob.body,
          JSON.stringify(parsedJob.labels),
          parsedJob.html_url,
          parsedJob.job_type,
          parsedJob.difficulty,
          JSON.stringify([profile.language].filter(Boolean)),
          parsedJob.estimated_tokens,
          JSON.stringify(parsedJob.context_files),
          parsedJob.has_bounty ? 1 : 0,
          parsedJob.bounty_amount,
          parsedJob.bounty_currency,
          parsedJob.merge_probability,
        ]
      );
      jobCount++;
    }

    console.log(chalk.green(`\nSync complete!`));
    console.log(chalk.dim(`  Merge rate: ${(profile.pr_merge_rate * 100).toFixed(1)}%`));
    console.log(chalk.dim(`  Maintainer style: ${profile.maintainer_style}`));
    console.log(chalk.dim(`  Jobs found: ${jobCount}`));
  } catch (error) {
    console.error(chalk.red(`Failed to add and sync: ${error}`));
    process.exit(1);
  }
}

/**
 * Register sync command with Commander
 */
export function registerSyncCommand(program: Command): void {
  const syncCmd = program.command('sync').description('Sync companies and jobs from GitHub');

  syncCmd
    .command('all', { isDefault: true })
    .description('Sync all companies and jobs')
    .action(syncAll);

  syncCmd
    .command('companies')
    .description('Sync company profiles only')
    .action(syncCompanies);

  syncCmd
    .command('jobs')
    .description('Sync jobs only')
    .action(syncJobs);

  syncCmd
    .command('add <repo>')
    .description('Add a repository and sync its jobs')
    .action(addAndSync);
}
