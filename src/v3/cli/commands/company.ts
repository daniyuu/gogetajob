import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getDatabase } from '../../db/database';
import { Company } from '../../db/schema';
import { GitHubClient } from '../../github/client';
import { CompanyProfiler } from '../../core/company-profiler';
import { loadConfig } from '../../config';

/**
 * Show repository information
 */
async function showRepoInfo(repoInput: string, options: { format?: string }): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.github_token || undefined);

  const parsed = client.parseRepoIdentifier(repoInput);
  if (!parsed) {
    console.error(chalk.red('Invalid repository format. Use owner/repo or full GitHub URL'));
    process.exit(1);
  }

  try {
    const db = getDatabase();
    db.runMigrations();
    const profiler = new CompanyProfiler(client, db);

    console.log(chalk.dim(`\nAnalyzing ${parsed.owner}/${parsed.repo}...`));

    const profile = await profiler.analyze(parsed.owner, parsed.repo);

    if (options.format === 'json') {
      console.log(JSON.stringify(profile, null, 2));
      return;
    }

    console.log(chalk.bold(`\n${profile.owner}/${profile.repo}\n`));

    const table = new Table();
    table.push(
      { [chalk.cyan('Description')]: profile.description || '-' },
      { [chalk.cyan('Language')]: profile.language || '-' },
      { [chalk.cyan('Stars')]: profile.stars.toLocaleString() },
      { [chalk.cyan('Forks')]: profile.forks.toLocaleString() },
      { [chalk.cyan('Open Issues')]: profile.open_issues_count.toLocaleString() },
      { [chalk.cyan('PR Merge Rate')]: `${(profile.pr_merge_rate * 100).toFixed(1)}%` },
      { [chalk.cyan('Avg Response')]: `${profile.avg_response_hours.toFixed(1)} hours` },
      { [chalk.cyan('Maintainer Style')]: styleBadge(profile.maintainer_style) },
      { [chalk.cyan('Active')]: profile.is_active ? chalk.green('Yes') : chalk.red('No') },
      { [chalk.cyan('Has CLA')]: profile.has_cla ? chalk.yellow('Yes') : chalk.green('No') },
      { [chalk.cyan('Contributing Guide')]: profile.has_contributing_guide ? chalk.green('Yes') : chalk.dim('No') }
    );

    console.log(table.toString());
  } catch (error) {
    console.error(chalk.red(`Failed to fetch repo info: ${error}`));
    process.exit(1);
  }
}

/**
 * Add a repository to track
 */
async function addRepo(repoInput: string): Promise<void> {
  const config = loadConfig();
  const client = new GitHubClient(config.github_token || undefined);

  const parsed = client.parseRepoIdentifier(repoInput);
  if (!parsed) {
    console.error(chalk.red('Invalid repository format. Use owner/repo or full GitHub URL'));
    process.exit(1);
  }

  try {
    const db = getDatabase();
    db.runMigrations();
    const profiler = new CompanyProfiler(client, db);

    console.log(chalk.dim(`\nAnalyzing ${parsed.owner}/${parsed.repo}...`));

    const profile = await profiler.analyze(parsed.owner, parsed.repo);
    await profiler.saveToDatabase(profile);

    console.log(chalk.green(`\nAdded ${parsed.owner}/${parsed.repo} to tracked companies`));
    console.log(chalk.dim(`Merge rate: ${(profile.pr_merge_rate * 100).toFixed(1)}%`));
    console.log(chalk.dim(`Maintainer style: ${profile.maintainer_style}`));
  } catch (error) {
    console.error(chalk.red(`Failed to add repo: ${error}`));
    process.exit(1);
  }
}

/**
 * List tracked companies
 */
function listCompanies(options: { format?: string }): void {
  const db = getDatabase();
  db.runMigrations();

  const companies = db.query<Company>(
    'SELECT * FROM companies WHERE id NOT IN (SELECT c.id FROM companies c JOIN blacklist b ON c.owner = b.owner AND (b.repo IS NULL OR c.repo = b.repo)) ORDER BY stars DESC'
  );

  if (options.format === 'json') {
    console.log(JSON.stringify(companies, null, 2));
    return;
  }

  if (companies.length === 0) {
    console.log(chalk.yellow('\nNo tracked companies found.'));
    console.log(chalk.dim('Add a company: gogetajob company add owner/repo'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Repository'),
      chalk.cyan('Stars'),
      chalk.cyan('Merge Rate'),
      chalk.cyan('Style'),
      chalk.cyan('Active'),
    ],
    colWidths: [6, 35, 10, 12, 12, 8],
  });

  for (const company of companies) {
    table.push([
      company.id.toString(),
      `${company.owner}/${company.repo}`,
      company.stars.toLocaleString(),
      `${(company.pr_merge_rate * 100).toFixed(0)}%`,
      styleBadge(company.maintainer_style),
      company.is_active ? chalk.green('Yes') : chalk.red('No'),
    ]);
  }

  console.log(chalk.bold(`\nTracked Companies (${companies.length})`));
  console.log(table.toString());
}

/**
 * Blacklist a repository
 */
function blacklistRepo(repoInput: string, options: { reason?: string }): void {
  const config = loadConfig();
  const client = new GitHubClient(config.github_token || undefined);

  const parsed = client.parseRepoIdentifier(repoInput);
  if (!parsed) {
    console.error(chalk.red('Invalid repository format. Use owner/repo or full GitHub URL'));
    process.exit(1);
  }

  const db = getDatabase();
  db.runMigrations();

  try {
    db.run(
      `INSERT INTO blacklist (owner, repo, reason) VALUES (?, ?, ?)
       ON CONFLICT(owner, repo) DO UPDATE SET reason = excluded.reason`,
      [parsed.owner, parsed.repo, options.reason || null]
    );

    console.log(chalk.green(`\nBlacklisted ${parsed.owner}/${parsed.repo}`));
    if (options.reason) {
      console.log(chalk.dim(`Reason: ${options.reason}`));
    }
  } catch (error) {
    console.error(chalk.red(`Failed to blacklist repo: ${error}`));
    process.exit(1);
  }
}

/**
 * Get style badge with color
 */
function styleBadge(style: string): string {
  switch (style) {
    case 'friendly':
      return chalk.green('friendly');
    case 'strict':
      return chalk.yellow('strict');
    case 'abandoned':
      return chalk.red('abandoned');
    default:
      return chalk.dim('unknown');
  }
}

/**
 * Register company command with Commander
 */
export function registerCompanyCommand(program: Command): void {
  const companyCmd = program.command('company').description('Manage tracked companies/repositories');

  companyCmd
    .command('info <repo>')
    .description('Show repository information')
    .option('--format <format>', 'Output format (json)')
    .action(showRepoInfo);

  companyCmd
    .command('add <repo>')
    .description('Add a repository to track')
    .action(addRepo);

  companyCmd
    .command('list')
    .description('List tracked companies')
    .option('--format <format>', 'Output format (json)')
    .action(listCompanies);

  companyCmd
    .command('blacklist <repo>')
    .description('Blacklist a repository')
    .option('--reason <reason>', 'Reason for blacklisting')
    .action(blacklistRepo);
}
