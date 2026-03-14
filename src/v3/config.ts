import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AppConfig {
  github_token: string | null;
  agent_id: string;
  sync_interval: number;
  api_port: number;
}

const DEFAULT_CONFIG: AppConfig = {
  github_token: null,
  agent_id: 'default-agent',
  sync_interval: 3600, // 1 hour in seconds
  api_port: 3001,
};

/**
 * Get the config directory path (~/.gogetajob)
 */
export function getConfigDir(): string {
  return path.join(os.homedir(), '.gogetajob');
}

/**
 * Get the config file path (~/.gogetajob/config.json)
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Load config from file, returns default config if file doesn't exist
 */
export function loadConfig(): AppConfig {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const loaded = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch (error) {
    console.error('Error reading config file:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to file
 */
export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 */
export function setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Valid config keys for CLI
 */
export const CONFIG_KEYS: (keyof AppConfig)[] = ['github_token', 'agent_id', 'sync_interval', 'api_port'];

/**
 * Check if a key is a valid config key
 */
export function isValidConfigKey(key: string): key is keyof AppConfig {
  return CONFIG_KEYS.includes(key as keyof AppConfig);
}
