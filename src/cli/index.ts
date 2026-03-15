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
  .action((opts: any) => {
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
  .action(async (repoArg: string, opts: any) => {
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
  .action(async (repoArg: string, opts: any) => {
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
    const openIssueNumbers = new Set<number>();
    for (const issue of issues) {
      openIssueNumbers.add(issue.number);
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

    // Mark issues no longer open as closed
    const closed = svc.closeStaleJobs(companyId, openIssueNumbers);
    if (closed > 0) {
      console.log(`  🔒 ${closed} issues marked as closed`);
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
  .option("--force", "override self-filed issue guard")
  .action((ref: string, opts: any) => {
    const parsed = parseRef(ref);
    const svc = getService();

    const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
    if (!job) {
      console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
      process.exit(1);
    }

    // Guard: don't start self-filed issues until owner responds
    if (svc.isSelfFiledUnadopted(`${parsed.owner}/${parsed.repo}`, parsed.issue)) {
      if (!opts.force) {
        console.error(`\n⛔ This issue was filed by you and hasn't been acknowledged by the owner yet.`);
        console.error(`   Wait for the owner to respond, or use --force to override.\n`);
        process.exit(1);
      }
      console.log(`\n⚠️  Overriding self-filed guard (--force)\n`);
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

    // 5. Create branch — short and clean
    const slug = job.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")  // non-alphanum → dash
      .replace(/^-|-$/g, "")         // trim leading/trailing dashes
      .slice(0, 30)                  // keep it short
      .replace(/-$/, "");            // no trailing dash after slice
    const branchName = `fix/${parsed.issue}-${slug}`;
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
  .action((ref: string, opts: any) => {
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
      try {
        exec("git add -A", { cwd: repoDir, encoding: "utf-8" });
        exec(`git commit -m "${commitTitle.replace(/"/g, '\\"')}\n\nFixes ${parsed.owner}/${parsed.repo}#${parsed.issue}"`, {
          cwd: repoDir,
          encoding: "utf-8",
        });
        console.log(`  ✅ Changes committed`);
      } catch (commitErr: any) {
        // Parse common failure reasons
        const stderr = commitErr.stderr || commitErr.message || "";
        if (stderr.includes("pre-commit") || stderr.includes("hook") || stderr.includes("husky") || stderr.includes("lint") || stderr.includes("eslint") || stderr.includes("prettier")) {
          console.error(`\n  ❌ Commit failed — pre-commit hook rejected your changes.`);
          console.error(`     Likely cause: lint or format errors.`);
          console.error(`     Fix the issues in ${repoDir}, then run:`);
          console.error(`     gogetajob submit ${ref}\n`);
        } else {
          console.error(`\n  ❌ Commit failed: ${stderr.split("\n")[0]}`);
          console.error(`     Fix the issue, then run: gogetajob submit ${ref}\n`);
        }
        process.exit(1);
      }
    } else {
      // Check if there are commits ahead of origin
      try {
        const ahead = exec("git rev-list --count @{u}..HEAD", { cwd: repoDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
        if (ahead === "0") {
          console.error(`  ❌ No changes to submit. Make some changes first!`);
          process.exit(1);
        }
        console.log(`  ℹ️  No uncommitted changes — using ${ahead} existing commit(s)`);
      } catch {
        // No upstream set — check if we have any local commits at all
        try {
          const logCount = exec("git rev-list --count HEAD", { cwd: repoDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
          if (parseInt(logCount) > 0) {
            console.log(`  ℹ️  No uncommitted changes — using existing commits`);
          } else {
            console.error(`  ❌ No changes to submit. Make some changes first!`);
            process.exit(1);
          }
        } catch {
          console.log(`  ℹ️  No uncommitted changes — using existing commits`);
        }
      }
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
      if (opts.tokens) console.log(`   Tokens: ${parseInt(opts.tokens).toLocaleString()}`);
      console.log();
    } catch (e: any) {
      const msg = e.stderr || e.message || String(e);
      if (msg.includes("already exists")) {
        console.error(`  ❌ A PR from this branch already exists.`);
      } else if (msg.includes("permission") || msg.includes("403")) {
        console.error(`  ❌ Permission denied. Check your GitHub auth.`);
      } else {
        console.error(`  ❌ Failed to push/create PR: ${msg.split("\n")[0]}`);
      }
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
  .action((ref: string, opts: any) => {
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
      if (opts.tokens) console.log(`   Tokens: ${parseInt(opts.tokens).toLocaleString()}`);
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

// ========== sync ==========
program
  .command("sync")
  .description("Check PR and issue statuses — update work log with latest results")
  .action(() => {
    const svc = getService();
    const entries = svc.listOutputsToSync();

    if (entries.length === 0) {
      console.log("\nNothing to sync.\n");
      return;
    }

    const prEntries = entries.filter((e: any) => e.pr_number && (!e.work_type || e.work_type === "pr"));
    const issueEntries = entries.filter((e: any) => e.work_type === "issue" && e.output_number);

    const total = prEntries.length + issueEntries.length;
    console.log(`\n🔄 Syncing ${total} item(s)...\n`);

    let merged = 0, needsAction = 0, open = 0, closed = 0;
    let issueAdopted = 0, issueOpen = 0, issueClosed = 0;

    for (const entry of prEntries) {
      try {
        const [prOwner, prRepo] = (entry.company_name || "").split("/");
        if (!prOwner || !prRepo) continue;
        const status = gh.getPRStatus(prOwner, prRepo, entry.pr_number!);
        svc.updatePRStatus(entry.id, status.state);

        const icon = status.state === "MERGED" ? "✅"
          : status.state === "CLOSED" ? "❌"
          : status.needsAction ? "🔴"
          : "🔵";

        console.log(`  ${icon} [PR] ${entry.company_name}#${entry.issue_number} PR #${entry.pr_number} — ${status.state}`);

        if (status.needsAction) {
          console.log(`     ⚠️  Changes requested!`);
          needsAction++;
        }

        if (status.state === "MERGED") merged++;
        else if (status.state === "CLOSED") closed++;
        else open++;
      } catch (e: any) {
        console.log(`  ⚠️  [PR] ${entry.company_name}#${entry.issue_number} PR #${entry.pr_number} — failed to check`);
      }
    }

    for (const entry of issueEntries) {
      try {
        const [repoOwner, repoName] = (entry.output_repo || "").split("/");
        if (!repoOwner || !repoName) continue;
        const issueData = gh.getIssueStatus(repoOwner, repoName, entry.output_number!);
        const newStatus = issueData.state === "closed" ? "closed"
          : issueData.hasLinkedPR ? "adopted"
          : issueData.hasNonAuthorComment ? "discussing"
          : "open";
        svc.updateOutputStatus(entry.id, newStatus);

        const icon = newStatus === "adopted" ? "🎯"
          : newStatus === "discussing" ? "💬"
          : newStatus === "closed" ? "🔒"
          : "🔵";
        console.log(`  ${icon} [Issue] ${entry.output_repo}#${entry.output_number} — ${newStatus}${issueData.comments > 0 ? ` (${issueData.comments} comments)` : ""}`);

        if (newStatus === "adopted") issueAdopted++;
        else if (newStatus === "closed") issueClosed++;
        else issueOpen++;
      } catch (e: any) {
        const msg = String(e.message || e);
        if (msg.includes("Could not resolve")) {
          svc.updateOutputStatus(entry.id, "deleted");
          console.log(`  🗑️  [Issue] ${entry.output_repo}#${entry.output_number} — deleted`);
          issueClosed++;
        } else {
          console.log(`  ⚠️  [Issue] ${entry.output_repo}#${entry.output_number} — failed to check`);
        }
      }
    }

    console.log(`\n📊 Summary:`);
    if (prEntries.length > 0) {
      console.log(`  PRs: ${merged} merged | ${open} open | ${closed} closed${needsAction > 0 ? ` | ${needsAction} need action ⚠️` : ""}`);
    }
    if (issueEntries.length > 0) {
      console.log(`  Issues: ${issueAdopted} adopted | ${issueOpen} open | ${issueClosed} closed`);
    }
    console.log();
  });

// ========== stats ==========
program
  .command("stats")
  .description("Show overall work statistics and ROI")
  .action(() => {
    const svc = getService();
    const stats = svc.getEnrichedStats();
    const basicStats = svc.getStats();
    const issueStats = svc.getIssueStats();

    console.log(`\n📊 Work Stats\n`);

    console.log(`  📝 PR Work`);
    console.log(`    📋 Total PRs:      ${stats.total_done}`);
    console.log(`    ✅ Merged:         ${stats.merged}`);
    console.log(`    🔵 Pending:        ${stats.pending}`);
    console.log(`    ❌ Closed:         ${stats.closed}`);
    console.log(`    🚫 Dropped:        ${basicStats.dropped}`);
    console.log(`    🎯 Merge rate:     ${stats.total_done > 0 ? (stats.merge_rate * 100).toFixed(0) + "%" : "N/A"}`);
    console.log();

    console.log(`  📋 Issue Work`);
    console.log(`    📋 Issues filed:   ${issueStats.total}`);
    console.log(`    🎯 Adopted:        ${issueStats.adopted}`);
    console.log(`    💬 Discussing:     ${issueStats.discussing}`);
    console.log(`    🔵 Open:           ${issueStats.open}`);
    console.log(`    🔒 Closed:         ${issueStats.closed}`);
    console.log(`    📈 Response rate:  ${issueStats.total > 0 ? ((issueStats.responded / issueStats.total) * 100).toFixed(0) + "%" : "N/A"}`);
    console.log();

    console.log(`  💰 Totals`);
    console.log(`    🔢 Total tokens:       ${(stats.total_tokens + issueStats.tokens).toLocaleString()}`);
    console.log(`    📈 Tokens per merge:   ${stats.tokens_per_merge > 0 ? stats.tokens_per_merge.toLocaleString() : "N/A"}`);

    if (stats.needs_action > 0) {
      console.log();
      console.log(`  ⚠️  ${stats.needs_action} PR(s) need your attention! Run \`gogetajob sync\` for details.`);
    }

    console.log();
  });

// ========== history ==========
program
  .command("history")
  .description("View work history")
  .option("--repo <owner/repo>", "filter by repo")
  .option("--status <status>", "filter: taken, done, dropped")
  .action((opts: any) => {
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
  .action((opts: any) => {
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

// ========== audit ==========
program
  .command("audit <repo>")
  .description("Audit a repo — analyze codebase health and suggest improvements")
  .option("--dir <path>", "work directory", "/tmp/work")
  .option("--create-issues", "create GitHub issues for findings")
  .option("--tokens <count>", "tokens consumed for this audit (split across created issues)")
  .action((repoArg: string, opts: any) => {
    const [owner, repo] = repoArg.split("/");
    if (!owner || !repo) {
      console.error("Error: format should be owner/repo");
      process.exit(1);
    }

    const svc = getService();

    console.log(`\n🔍 Auditing ${owner}/${repo}...\n`);

    // 1. Clone/pull the repo
    const targetDir = path.join(opts.dir, repo);
    const repoDir = gh.cloneRepo(`${owner}/${repo}`, targetDir);

    // 2. Gather basic stats
    const { execSync: exec } = require("child_process");
    const fs = require("fs");

    // File count by extension
    let fileList = "";
    try {
      fileList = exec("git ls-files", { cwd: repoDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    } catch { fileList = ""; }

    const files = fileList.trim().split("\n").filter(Boolean);
    const extCounts: Record<string, number> = {};
    for (const f of files) {
      const ext = f.includes(".") ? f.split(".").pop()! : "(none)";
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }

    // Check for common files
    const hasReadme = files.some(f => f.toLowerCase().startsWith("readme"));
    const hasContributing = files.some(f => f.toLowerCase().includes("contributing"));
    const hasLicense = files.some(f => f.toLowerCase().startsWith("license"));
    const hasCI = files.some(f => f.startsWith(".github/workflows/") || f === ".travis.yml" || f === ".circleci/config.yml");
    const hasTests = files.some(f => f.includes("test") || f.includes("spec") || f.includes("__tests__"));
    const hasEnvExample = files.some(f => f.includes(".env.example") || f.includes(".env.sample"));
    const hasDockerfile = files.some(f => f.toLowerCase() === "dockerfile" || f === "docker-compose.yml");
    const hasChangelog = files.some(f => f.toLowerCase().startsWith("changelog"));

    // Recent commit activity
    let recentCommits = 0;
    try {
      const count = exec('git rev-list --count --since="30 days ago" HEAD', {
        cwd: repoDir, encoding: "utf-8"
      }).trim();
      recentCommits = parseInt(count) || 0;
    } catch {}

    // Open issues & PRs from GitHub
    const info = gh.getRepoInfo(owner, repo);

    console.log(`📊 Repository Health Report\n`);
    console.log(`  📁 Files: ${files.length}`);
    const topExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`  📝 Top types: ${topExts.map(([ext, n]) => `${ext}(${n})`).join(", ")}`);
    console.log(`  ⭐ Stars: ${info.stars} | 🍴 Forks: ${info.forks} | 📋 Open issues: ${info.open_issues}`);
    console.log(`  📅 Commits (30d): ${recentCommits}`);
    console.log();

    console.log(`📋 Checklist\n`);
    const check = (ok: boolean, label: string) => console.log(`  ${ok ? "✅" : "❌"} ${label}`);
    check(hasReadme, "README");
    check(hasContributing, "CONTRIBUTING guide");
    check(hasLicense, "LICENSE");
    check(hasCI, "CI/CD (GitHub Actions, etc.)");
    check(hasTests, "Tests");
    check(hasEnvExample, ".env.example");
    check(hasDockerfile, "Dockerfile / docker-compose");
    check(hasChangelog, "CHANGELOG");
    console.log();

    // Suggest findings
    const findings: string[] = [];
    if (!hasTests) findings.push("No test files detected — add unit/integration tests");
    if (!hasCI) findings.push("No CI/CD configuration — add GitHub Actions workflow");
    if (!hasContributing) findings.push("No CONTRIBUTING.md — makes it hard for new contributors");
    if (!hasEnvExample) findings.push("No .env.example — environment setup unclear");
    if (!hasChangelog) findings.push("No CHANGELOG — track releases and changes");
    if (!hasLicense) findings.push("No LICENSE — legal risk for contributors");
    if (recentCommits === 0) findings.push("No commits in 30 days — project may be stale");

    if (findings.length > 0) {
      console.log(`⚠️  Quick Findings (${findings.length})\n`);
      findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
      console.log();
    } else {
      console.log(`  ✨ No obvious issues found from quick scan.\n`);
    }

    console.log(`💡 For deeper analysis, run an AI-powered code review on the repo.`);
    console.log(`   Repo cloned at: ${repoDir}\n`);

    // Create issues if requested
    if (opts.createIssues && findings.length > 0) {
      console.log(`📝 Creating ${findings.length} issue(s)...\n`);
      for (const finding of findings) {
        try {
          const url = exec(
            `gh issue create -R ${owner}/${repo} --title "audit: ${finding.split(" — ")[0]}" --body "Found during automated audit.\n\n${finding}\n\nDiscovered by GoGetAJob audit."`,
            { encoding: "utf-8", timeout: 15000 }
          ).trim();
          console.log(`  ✅ ${url}`);

          // Record as issue-type work entry
          const issueMatch = url.match(/\/issues\/(\d+)/);
          if (issueMatch) {
            svc.recordWork({
              workType: "issue",
              outputRepo: `${owner}/${repo}`,
              outputNumber: parseInt(issueMatch[1]),
              outputUrl: url,
              outputStatus: "open",
              tokensUsed: opts.tokens ? Math.round(parseInt(opts.tokens) / findings.length) : undefined,
              notes: `audit: ${finding.split(" — ")[0]}`,
              filedBy: gh.getMyLogin(),
            });
          }
        } catch (e: any) {
          console.log(`  ❌ Failed: ${finding.split(" — ")[0]}`);
        }
      }
      console.log();
    }
  });

program.parse();

// === Helpers ===

function parseRef(ref: string): { owner: string; repo: string; issue: number } {
  // Full format: owner/repo#issue_number
  const match = ref.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (match) {
    return { owner: match[1]!, repo: match[2]!, issue: parseInt(match[3]!) };
  }

  // Short format: just a number (e.g., "34" or "#34")
  const numMatch = ref.match(/^#?(\d+)$/);
  if (numMatch) {
    const issueNum = parseInt(numMatch[1]!);
    const svc = getService();
    const job = svc.findJobByIssueNumber(issueNum);
    if (job) {
      return { owner: job.owner, repo: job.repo, issue: issueNum };
    }
    // Try to guess repo from work_log and suggest scan
    const guess = svc.guessRepoForIssue(issueNum);
    if (guess) {
      console.log(`  ℹ️  Issue #${issueNum} not in jobs table. Scanning ${guess.owner}/${guess.repo}...`);
      // Run scan inline
      const { execSync } = require("child_process");
      try {
        execSync(`node ${process.argv[1]} scan ${guess.owner}/${guess.repo}`, { stdio: "inherit" });
      } catch {}
      // Retry lookup
      const retryJob = svc.findJobByIssueNumber(issueNum);
      if (retryJob) {
        return { owner: retryJob.owner, repo: retryJob.repo, issue: issueNum };
      }
    }
    console.error(`No job found for issue #${issueNum}. Use full format: owner/repo#${issueNum}`);
    return process.exit(1);
  }

  console.error(`Invalid format: "${ref}". Expected: owner/repo#issue_number or just the issue number`);
  return process.exit(1);
}
