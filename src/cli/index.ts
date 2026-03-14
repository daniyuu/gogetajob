#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "../backend/lib/migrations";
import { JobService } from "../backend/lib/job-service";
import * as gh from "../backend/lib/github";
import { formatJob, formatCompany, formatWorkEntry } from "./format";

// --- DB setup ---
const dataDir = process.env.GOGETAJOB_DATA || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "gogetajob.db");

function getDb(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

function getService(): JobService {
  return new JobService(getDb());
}

// --- CLI ---
const program = new Command();

program
  .name("gogetajob")
  .description("🏢 AI Agent Job Market — find work, track results")
  .version("2.0.0");

// ========== feed ==========
program
  .command("feed")
  .description("Browse open job opportunities")
  .option("--lang <language>", "filter by programming language")
  .option("--type <type>", "filter by type: bug, feature, docs, test, refactor")
  .option("--limit <n>", "max results", "20")
  .action((opts) => {
    const svc = getService();
    const jobs = svc.listJobs({
      lang: opts.lang,
      type: opts.type,
      limit: parseInt(opts.limit),
    });

    if (jobs.length === 0) {
      console.log("\nNo jobs found. Try `gogetajob scan <owner/repo>` to discover issues.\n");
      return;
    }

    console.log(`\n📋 Open Jobs (${jobs.length})\n`);
    jobs.forEach((job, i) => {
      console.log(formatJob(job, i));
      console.log();
    });
  });

// ========== info ==========
program
  .command("info <repo>")
  .description("Show company profile (format: owner/repo)")
  .option("--refresh", "refresh from GitHub")
  .action(async (repoArg: string, opts) => {
    const [owner, repo] = repoArg.split("/");
    if (!owner || !repo) {
      console.error("Error: format should be owner/repo");
      process.exit(1);
    }

    const svc = getService();
    let company = svc.getCompany(owner, repo);

    if (!company || opts.refresh) {
      console.log(`Fetching ${owner}/${repo} from GitHub...`);
      try {
        const info = gh.getRepoInfo(owner, repo);
        const prStats = gh.getPrStats(owner, repo);
        svc.upsertCompany({
          owner: info.owner,
          repo: info.repo,
          description: info.description,
          language: info.language,
          stars: info.stars,
          forks: info.forks,
          open_issues: info.open_issues,
          pr_merge_rate: prStats.merge_rate,
          avg_response_hours: prStats.avg_response_hours !== null ? prStats.avg_response_hours : undefined,
          has_contributing_guide: info.has_contributing,
          last_commit_at: info.last_push,
        });
        company = svc.getCompany(owner, repo);
      } catch (e: any) {
        console.error(`Failed to fetch: ${e.message}`);
        process.exit(1);
      }
    }

    if (company) {
      console.log(`\n🏢 Company Profile\n`);
      console.log(formatCompany(company));
      console.log();
    }
  });

// ========== scan ==========
program
  .command("scan <repo>")
  .description("Scan a repo for open issues and add them as jobs")
  .option("--refresh", "force refresh existing data")
  .option("--label <label>", "only issues with this label")
  .action(async (repoArg: string, opts) => {
    const [owner, repo] = repoArg.split("/");
    if (!owner || !repo) {
      console.error("Error: format should be owner/repo");
      process.exit(1);
    }

    const svc = getService();

    // 1. Get/update company info
    console.log(`\n🔍 Scanning ${owner}/${repo}...`);
    const info = gh.getRepoInfo(owner, repo);
    const prStats = gh.getPrStats(owner, repo, 50);

    const companyId = svc.upsertCompany({
      owner: info.owner,
      repo: info.repo,
      description: info.description,
      language: info.language,
      stars: info.stars,
      forks: info.forks,
      open_issues: info.open_issues,
      pr_merge_rate: prStats.merge_rate,
      avg_response_hours: prStats.avg_response_hours !== null ? prStats.avg_response_hours : undefined,
      has_contributing_guide: info.has_contributing,
      last_commit_at: info.last_push,
    });

    console.log(`  ⭐ ${info.stars} stars | 📊 ${(prStats.merge_rate * 100).toFixed(0)}% merge rate | ${prStats.total} PRs analyzed`);

    // 2. Get issues
    const issues = gh.getIssues(owner, repo, {
      limit: 50,
      labels: opts.label,
    });

    let added = 0;
    for (const issue of issues) {
      const classified = gh.classifyIssue(issue);
      svc.upsertJob(companyId, {
        issue_number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        job_type: classified.type,
        difficulty: classified.difficulty,
        has_bounty: issue.labels.some(l => l.toLowerCase().includes("bounty")),
        url: issue.url,
        state: issue.state.toLowerCase(),
      });
      added++;
    }

    console.log(`  📋 ${added} issues discovered`);
    console.log(`  Done!\n`);
  });

// ========== take ==========
program
  .command("take <ref>")
  .description("Take a job (format: owner/repo#issue_number)")
  .action((ref: string) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
      process.exit(1);
    }

    try {
      const logId = svc.takeJob(job.id);
      console.log(`\n✅ Taken! Work log #${logId}`);
      console.log(`   ${job.title}`);
      console.log(`   Good luck! 🍀\n`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// ========== done ==========
program
  .command("done <ref>")
  .description("Mark a job as completed")
  .option("--pr <number>", "PR number")
  .option("--tokens <count>", "tokens consumed")
  .option("--notes <text>", "completion notes")
  .action((ref: string, opts) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}`);
      process.exit(1);
    }

    try {
      svc.completeJob(job.id, {
        pr_number: opts.pr ? parseInt(opts.pr) : undefined,
        pr_url: opts.pr ? `https://github.com/${parsed.owner}/${parsed.repo}/pull/${opts.pr}` : undefined,
        tokens_used: opts.tokens ? parseInt(opts.tokens) : undefined,
        notes: opts.notes,
      });
      console.log(`\n🎉 Job done!`);
      console.log(`   ${job.title}`);
      if (opts.pr) console.log(`   PR: #${opts.pr}`);
      if (opts.tokens) console.log(`   Tokens: ${opts.tokens}`);
      console.log();
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// ========== drop ==========
program
  .command("drop <ref>")
  .description("Drop a taken job")
  .action((ref: string) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}`);
      process.exit(1);
    }

    try {
      svc.dropJob(job.id);
      console.log(`\n📤 Dropped: ${ref}\n`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// ========== history ==========
program
  .command("history")
  .description("View work history")
  .option("--repo <owner/repo>", "filter by repo")
  .option("--status <status>", "filter: taken, done, dropped")
  .action((opts) => {
    const svc = getService();
    const entries = svc.listWorkHistory({
      repo: opts.repo,
      status: opts.status,
    });

    if (entries.length === 0) {
      console.log("\nNo work history yet. Take a job with `gogetajob take`!\n");
      return;
    }

    const stats = svc.getStats();
    console.log(`\n📊 Work History (${entries.length} entries)`);
    console.log(`   ✅ ${stats.done} done | 🔵 ${stats.taken} active | ❌ ${stats.dropped} dropped | 🔢 ${stats.total_tokens} tokens total\n`);

    entries.forEach((entry) => {
      console.log(formatWorkEntry(entry));
      console.log();
    });
  });

// ========== companies ==========
program
  .command("companies")
  .description("List known companies/repos")
  .option("--sort <field>", "sort: stars, merge-rate, activity", "stars")
  .action((opts) => {
    const svc = getService();
    const companies = svc.listCompanies(opts.sort);

    if (companies.length === 0) {
      console.log("\nNo companies yet. Try `gogetajob scan <owner/repo>`.\n");
      return;
    }

    console.log(`\n🏢 Companies (${companies.length})\n`);
    companies.forEach((c) => {
      console.log(formatCompany(c));
      console.log();
    });
  });

program.parse();

// === Helpers ===

function parseRef(ref: string): { owner: string; repo: string; issue: number } {
  const match = ref.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (!match) {
    console.error(`Invalid format: "${ref}". Expected: owner/repo#issue_number`);
    return process.exit(1);
  }
  return { owner: match[1]!, repo: match[2]!, issue: parseInt(match[3]!) };
}
