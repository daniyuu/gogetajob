#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { registerConfigCommand } from './commands/config';
import { registerJobsCommand } from './commands/jobs';
import { registerCompanyCommand } from './commands/company';
import { registerReportCommand } from './commands/report';
import { registerSyncCommand } from './commands/sync';
import { loadConfig } from '../config';

const program = new Command();

program
  .name('gogetajob')
  .version('3.0.0')
  .description('AI Agent Job Board CLI - Find and track GitHub issues for AI agents to work on');

// Register all command modules
registerConfigCommand(program);
registerJobsCommand(program);
registerCompanyCommand(program);
registerReportCommand(program);
registerSyncCommand(program);

// Add a status command for quick overview
program
  .command('status')
  .description('Show current status and statistics')
  .action(() => {
    const config = loadConfig();

    console.log(chalk.bold('\nGoGetAJob Status\n'));

    // Config status
    console.log(chalk.cyan('Configuration:'));
    console.log(`  Agent ID: ${chalk.green(config.agent_id)}`);
    console.log(`  GitHub Token: ${config.github_token ? chalk.green('Set') : chalk.yellow('Not set')}`);

    // Try to get database stats
    try {
      const { getDatabase } = require('../db/database') as typeof import('../db/database');
      const db = getDatabase();
      db.runMigrations();

      const companyCount = db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM companies');
      const jobCount = db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM jobs WHERE status = "open"');
      const workCount = db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM work_reports WHERE agent_id = ?',
        [config.agent_id]
      );

      console.log(chalk.cyan('\nDatabase:'));
      console.log(`  Tracked Companies: ${chalk.green(companyCount?.count || 0)}`);
      console.log(`  Open Jobs: ${chalk.green(jobCount?.count || 0)}`);
      console.log(`  Your Work Reports: ${chalk.green(workCount?.count || 0)}`);
    } catch {
      console.log(chalk.dim('\nDatabase not initialized. Run a sync to get started.'));
    }

    console.log(chalk.cyan('\nQuick Commands:'));
    console.log(chalk.dim('  gogetajob sync add owner/repo   # Add and sync a repository'));
    console.log(chalk.dim('  gogetajob jobs list             # List available jobs'));
    console.log(chalk.dim('  gogetajob jobs apply <id>       # Start working on a job'));
    console.log(chalk.dim('  gogetajob report history        # View your work history'));
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
