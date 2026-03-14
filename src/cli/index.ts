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
        comments_count: issue.comments,
      });
      added++;
    }

    console.log(`  📋 ${added} issues discovered`);
    console.log(`  Done!\n`);
  });

// ========== check ==========
program
  .command("check <ref>")
  .description("Deep-inspect an issue before taking it (format: owner/repo#issue_number)")
  .action((ref: string) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
      process.exit(1);
    }

    const company = svc.getCompany(parsed.owner, parsed.repo);

    console.log(`\n🔍 Checking ${ref}...\n`);

    // Check linked PRs
    const prInfo = gh.checkLinkedPRs(parsed.owner, parsed.repo, parsed.issue);
    if (company) {
      svc.markJobHasPR(company.id, parsed.issue, prInfo.hasPR);
    }

    // Display
    const difficultyStr = job.difficulty !== "unknown" ? ` | Difficulty: ${job.difficulty}` : "";
    console.log(`📋 ${job.title}`);
    console.log(`🏷️  Type: ${job.job_type} | Labels: ${job.labels.join(", ") || "none"}${difficultyStr}`);
    console.log(`💬 Comments: ${job.comments_count}`);
    console.log(`🔗 PR: ${prInfo.hasPR ? `⚠️  YES — PR(s) #${prInfo.prNumbers.join(", #")} already linked` : "✅ No linked PRs"}`);
    console.log();

    // Show full body
    if (job.body) {
      console.log("── Issue Body ──────────────────────");
      console.log(job.body.length > 1000 ? job.body.slice(0, 1000) + "\n\n... (truncated)" : job.body);
      console.log("────────────────────────────────────");
    } else {
      console.log("📝 No issue body.");
    }

    // Verdict
    console.log();
    if (prInfo.hasPR) {
      console.log("⚠️  Verdict: Someone may already be working on this. Check the PR(s) before proceeding.");
    } else if (job.comments_count > 10) {
      console.log("🤔 Verdict: Lots of discussion. Read the comments to understand context.");
    } else {
      console.log("✅ Verdict: Looks open. Go for it!");
    }
    console.log();
  });

// ========== start ==========
program
  .command("start <ref>")
  .description("Take a job + fork/clone/branch — ready to code (format: owner/repo#issue_number)")
  .option("--dir <path>", "custom work directory", "/tmp/work")
  .action((ref: string, opts) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
      process.exit(1);
    }

    console.log(`\n🚀 Starting work on ${ref}...\n`);

    // 1. Take the job
    try {
      svc.takeJob(job.id);
      console.log(`  ✅ Job taken`);
    } catch (e: any) {
      if (e.message.includes("Already working")) {
        console.log(`  ℹ️  Already taken — continuing setup`);
      } else {
        console.error(`  ❌ ${e.message}`);
        process.exit(1);
      }
    }

    // 2. Fork if needed
    const myLogin = gh.getMyLogin();
    const isOwner = parsed.owner === myLogin;
    let cloneTarget: string;

    if (isOwner) {
      console.log(`  📦 You own this repo — no fork needed`);
      cloneTarget = `${parsed.owner}/${parsed.repo}`;
    } else {
      console.log(`  🍴 Forking ${parsed.owner}/${parsed.repo}...`);
      cloneTarget = gh.ensureFork(parsed.owner, parsed.repo, myLogin);
      console.log(`  ✅ Fork: ${cloneTarget}`);
    }

    // 3. Clone
    const targetDir = path.join(opts.dir, parsed.repo);
    console.log(`  📥 Cloning to ${targetDir}...`);
    const repoDir = gh.cloneRepo(cloneTarget, targetDir);
    console.log(`  ✅ Cloned`);

    // 4. Add upstream remote (if fork)
    if (!isOwner) {
      gh.addUpstreamRemote(repoDir, parsed.owner, parsed.repo);
      console.log(`  🔗 Upstream remote added`);
    }

    // 5. Create branch
    const branchName = `fix/${parsed.issue}-${job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    gh.createBranch(repoDir, branchName);
    console.log(`  🌿 Branch: ${branchName}`);

    console.log(`\n🎯 Ready to work!`);
    console.log(`   cd ${repoDir}`);
    console.log(`   # make your changes, then:`);
    console.log(`   gogetajob submit ${ref}\n`);
  });

// ========== submit ==========
program
  .command("submit <ref>")
  .description("Push changes + create PR + record completion (format: owner/repo#issue_number)")
  .option("--title <text>", "PR title (default: auto from job title)")
  .option("--tokens <count>", "tokens consumed")
  .option("--notes <text>", "completion notes")
  .option("--dir <path>", "work directory", "/tmp/work")
  .action((ref: string, opts) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}`);
      process.exit(1);
    }

    const repoDir = path.join(opts.dir, parsed.repo);
    const { existsSync } = require("fs");
    if (!existsSync(path.join(repoDir, ".git"))) {
      console.error(`❌ No repo found at ${repoDir}. Did you run \`gogetajob start ${ref}\` first?`);
      process.exit(1);
    }

    console.log(`\n📤 Submitting work for ${ref}...\n`);

    // Check if there are changes to commit
    const { execSync: exec } = require("child_process");
    const status = exec("git status --porcelain", { cwd: repoDir, encoding: "utf-8" }).trim();
    if (status) {
      // Stage and commit
      const commitTitle = opts.title || `fix: ${job.title}`;
      exec("git add -A", { cwd: repoDir, encoding: "utf-8" });
      exec(`git commit -m "${commitTitle.replace(/"/g, '\\"')}\n\nFixes ${parsed.owner}/${parsed.repo}#${parsed.issue}"`, {
        cwd: repoDir,
        encoding: "utf-8",
      });
      console.log(`  ✅ Changes committed`);
    } else {
      console.log(`  ℹ️  No uncommitted changes — using existing commits`);
    }

    // Push and create PR
    const prTitle = opts.title || `fix: ${job.title}`;
    const prBody = `Fixes #${parsed.issue}\n\n${opts.notes || "Automated PR via GoGetAJob"}`;

    try {
      const prUrl = gh.pushAndCreatePR(
        repoDir,
        parsed.owner,
        parsed.repo,
        parsed.issue,
        prTitle,
        prBody,
      );

      console.log(`  ✅ PR created: ${prUrl}`);

      // Extract PR number from URL
      const prMatch = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = prMatch ? parseInt(prMatch[1]) : undefined;

      // Record completion
      try {
        svc.completeJob(job.id, {
          pr_number: prNumber,
          pr_url: prUrl,
          tokens_used: opts.tokens ? parseInt(opts.tokens) : undefined,
          notes: opts.notes,
        });
        console.log(`  ✅ Job recorded as done`);
      } catch (e: any) {
        console.log(`  ⚠️  PR created but couldn't update work log: ${e.message}`);
      }

      console.log(`\n🎉 All done!`);
      console.log(`   PR: ${prUrl}`);
      if (opts.tokens) console.log(`   Tokens: ${opts.tokens}`);
      console.log();
    } catch (e: any) {
      console.error(`  ❌ Failed to create PR: ${e.message}`);
      process.exit(1);
    }
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
