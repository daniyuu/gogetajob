import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import * as readline from 'readline';
import {
  loadConfig,
  saveConfig,
  setConfigValue,
  getConfigPath,
  isValidConfigKey,
  CONFIG_KEYS,
  AppConfig,
} from '../../config';

/**
 * Create readline interface for interactive input
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Display current configuration
 */
function showConfig(options: { format?: string }): void {
  const config = loadConfig();

  if (options.format === 'json') {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const table = new Table({
    head: [chalk.cyan('Key'), chalk.cyan('Value')],
    colWidths: [20, 50],
  });

  table.push(
    ['github_token', config.github_token ? chalk.dim('[set]') : chalk.yellow('(not set)')],
    ['agent_id', chalk.green(config.agent_id)],
    ['sync_interval', chalk.green(`${config.sync_interval}s`)],
    ['api_port', chalk.green(config.api_port.toString())]
  );

  console.log(chalk.bold('\nGoGetAJob Configuration'));
  console.log(chalk.dim(`Config file: ${getConfigPath()}\n`));
  console.log(table.toString());
}

/**
 * Set a configuration value
 */
function setConfig(key: string, value: string): void {
  if (!isValidConfigKey(key)) {
    console.error(chalk.red(`Invalid config key: ${key}`));
    console.log(chalk.dim(`Valid keys: ${CONFIG_KEYS.join(', ')}`));
    process.exit(1);
  }

  let parsedValue: string | number | null;

  // Parse value based on key type
  if (key === 'sync_interval' || key === 'api_port') {
    parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      console.error(chalk.red(`${key} must be a number`));
      process.exit(1);
    }
  } else if (key === 'github_token' && (value === '' || value.toLowerCase() === 'null')) {
    parsedValue = null;
  } else {
    parsedValue = value;
  }

  setConfigValue(key, parsedValue as AppConfig[typeof key]);
  console.log(chalk.green(`Set ${key} = ${parsedValue === null ? '(null)' : parsedValue}`));
}

/**
 * Interactive configuration setup
 */
async function initConfig(): Promise<void> {
  console.log(chalk.bold('\nGoGetAJob Configuration Setup\n'));

  const rl = createReadlineInterface();
  const config = loadConfig();

  try {
    // GitHub token
    const tokenPrompt = config.github_token
      ? `GitHub Token [${chalk.dim('currently set')}]: `
      : `GitHub Token: `;
    const token = await prompt(rl, tokenPrompt);
    if (token) {
      config.github_token = token;
    }

    // Agent ID
    const agentPrompt = `Agent ID [${chalk.dim(config.agent_id)}]: `;
    const agentId = await prompt(rl, agentPrompt);
    if (agentId) {
      config.agent_id = agentId;
    }

    // Sync interval
    const syncPrompt = `Sync Interval (seconds) [${chalk.dim(config.sync_interval.toString())}]: `;
    const syncInterval = await prompt(rl, syncPrompt);
    if (syncInterval) {
      const parsed = parseInt(syncInterval, 10);
      if (!isNaN(parsed)) {
        config.sync_interval = parsed;
      }
    }

    // API port
    const portPrompt = `API Port [${chalk.dim(config.api_port.toString())}]: `;
    const apiPort = await prompt(rl, portPrompt);
    if (apiPort) {
      const parsed = parseInt(apiPort, 10);
      if (!isNaN(parsed)) {
        config.api_port = parsed;
      }
    }

    saveConfig(config);
    console.log(chalk.green('\nConfiguration saved successfully!'));
    console.log(chalk.dim(`Config file: ${getConfigPath()}`));
  } finally {
    rl.close();
  }
}

/**
 * Register config command with Commander
 */
export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage GoGetAJob configuration');

  configCmd
    .command('show')
    .description('Display current configuration')
    .option('--format <format>', 'Output format (json)')
    .action(showConfig);

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(setConfig);

  configCmd
    .command('init')
    .description('Interactive configuration setup')
    .action(initConfig);
}
