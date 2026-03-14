import type { Config } from '../types';
import path from 'path';
import fs from 'fs';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'config.json');

const DEFAULT_CONFIG: Config = {
  port: 9393,
  githubToken: null,
  claudePath: 'claude',
  maxParallelWorkers: 5,
  updateIntervals: {
    hot: 600,       // 10 minutes
    warm: 3600,     // 1 hour
    cold: 86400,    // 1 day
    positions: 600  // 10 minutes
  }
};

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    // Create directory if it doesn't exist
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Save default config
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }

  const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
}

export function saveConfig(config: Partial<Config>): void {
  // Create directory if it doesn't exist
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load current config or use default
  let current = DEFAULT_CONFIG;
  if (fs.existsSync(CONFIG_PATH)) {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    current = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  }

  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
}
