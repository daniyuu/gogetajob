import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const CRON_MARKER = "# gogetajob-watch";

/** Root dir of the gogetajob project (where package.json lives) */
function getProjectDir(): string {
  // Walk up from this file (dist/cli/watch.js) to find project root
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: assume cwd
  return process.cwd();
}

/**
 * Parse an interval string like "4h", "30m", "6h" into a cron expression.
 * Supports: Nh (hours), Nm (minutes)
 */
export function intervalToCron(interval: string): string {
  const match = interval.match(/^(\d+)(h|m)$/i);
  if (!match) {
    throw new Error(`Invalid interval "${interval}". Use format like "4h", "30m", "6h".`);
  }
  const value = parseInt(match[1]!);
  const unit = match[2]!.toLowerCase();

  if (unit === "h") {
    if (value < 1 || value > 23) throw new Error("Hour interval must be 1-23");
    return `0 */${value} * * *`;
  } else {
    if (value < 1 || value > 59) throw new Error("Minute interval must be 1-59");
    return `*/${value} * * * *`;
  }
}

/** Read current crontab entries (returns empty string if none) */
function readCrontab(): string {
  try {
    return execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
  } catch {
    return "";
  }
}

/** Write crontab from string */
function writeCrontab(content: string): void {
  execSync("crontab -", { input: content, encoding: "utf-8" });
}

/** Check if our watch entry exists in crontab */
export function isWatchActive(): { active: boolean; line: string | null } {
  const crontab = readCrontab();
  const lines = crontab.split("\n");
  const watchLine = lines.find((l) => l.includes(CRON_MARKER));
  return { active: !!watchLine, line: watchLine || null };
}

/** Register a crontab entry for gogetajob sync */
export function startWatch(interval: string = "4h"): void {
  const cronExpr = intervalToCron(interval);
  const projectDir = getProjectDir();
  const logPath = path.join(projectDir, "data", "watch.log");

  // Ensure data dir exists
  const dataDir = path.join(projectDir, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Build the cron command
  const cronCmd = `${cronExpr} cd ${projectDir} && node dist/cli/index.js sync >> ${logPath} 2>&1 ${CRON_MARKER}`;

  // Remove existing entry first, then add new one
  let crontab = readCrontab();
  const lines = crontab.split("\n").filter((l) => !l.includes(CRON_MARKER));

  // Remove trailing empty lines, add our entry
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
    lines.pop();
  }
  lines.push(cronCmd);
  lines.push(""); // crontab needs trailing newline

  writeCrontab(lines.join("\n"));

  console.log(`\n✅ Watch started! Syncing every ${interval}`);
  console.log(`   Cron: ${cronExpr}`);
  console.log(`   Log:  ${logPath}\n`);
}

/** Remove the gogetajob-watch crontab entry */
export function stopWatch(): void {
  const crontab = readCrontab();
  const lines = crontab.split("\n").filter((l) => !l.includes(CRON_MARKER));

  writeCrontab(lines.join("\n"));

  console.log(`\n✅ Watch stopped. Crontab entry removed.\n`);
}

/** Show watch status and last sync results */
export function showStatus(): void {
  const { active, line } = isWatchActive();

  if (!active) {
    console.log(`\n⏸️  Watch is not active.`);
    console.log(`   Run \`gogetajob watch\` to start syncing periodically.\n`);
    return;
  }

  console.log(`\n✅ Watch is active`);
  console.log(`   ${line}`);

  // Show last few lines of watch.log
  const projectDir = getProjectDir();
  const logPath = path.join(projectDir, "data", "watch.log");

  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    const tail = lines.slice(-15);
    console.log(`\n📋 Last sync output (${logPath}):\n`);
    tail.forEach((l) => console.log(`   ${l}`));
  } else {
    console.log(`\n   No sync log yet (${logPath} not found).`);
  }

  console.log();
}
