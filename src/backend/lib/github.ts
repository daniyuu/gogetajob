import { execSync } from "child_process";

// Uses `gh` CLI — the most natural way for an agent to talk to GitHub

export interface RepoInfo {
  owner: string;
  repo: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  open_issues: number;
  last_push: string;
  has_contributing: boolean;
}

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  url: string;
  created_at: string;
  comments: number;
}

export interface PrStats {
  total: number;
  merged: number;
  closed: number;
  merge_rate: number;
  avg_response_hours: number | null;
}

function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, { encoding: "utf-8", timeout: 30000 }).trim();
  } catch (e: any) {
    throw new Error(`gh command failed: ${e.message}`);
  }
}

function ghJson(args: string): any {
  const out = gh(args);
  if (!out) return null;
  return JSON.parse(out);
}

export function getRepoInfo(owner: string, repo: string): RepoInfo {
  const data = ghJson(
    `repo view ${owner}/${repo} --json name,description,primaryLanguage,stargazerCount,forkCount,issues,pushedAt`
  );

  // Check if CONTRIBUTING.md exists
  let hasContributing = false;
  try {
    gh(`api repos/${owner}/${repo}/contents/CONTRIBUTING.md --jq .name`);
    hasContributing = true;
  } catch {}

  return {
    owner,
    repo,
    description: data.description || "",
    language: data.primaryLanguage?.name || "Unknown",
    stars: data.stargazerCount,
    forks: data.forkCount,
    open_issues: data.issues?.totalCount || 0,
    last_push: data.pushedAt,
    has_contributing: hasContributing,
  };
}

export function getIssues(
  owner: string,
  repo: string,
  opts: { limit?: number; labels?: string } = {}
): IssueInfo[] {
  const limit = opts.limit || 30;
  let cmd = `issue list -R ${owner}/${repo} --state open --limit ${limit} --json number,title,body,labels,state,url,createdAt,comments`;
  if (opts.labels && opts.labels.length > 0) {
    cmd += ` --label "${opts.labels}"`;
  }
  const data = ghJson(cmd);
  if (!data) return [];
  return data.map((d: any) => ({
    number: d.number,
    title: d.title,
    body: d.body || "",
    labels: (d.labels || []).map((l: any) => l.name),
    state: d.state,
    url: d.url,
    created_at: d.createdAt,
    comments: d.comments?.totalCount ?? 0,
  }));
}

export function getPrStats(owner: string, repo: string, limit: number = 100): PrStats {
  // Get recent closed/merged PRs to calculate merge rate
  const prs = ghJson(
    `pr list -R ${owner}/${repo} --state all --limit ${limit} --json number,state,mergedAt,closedAt,createdAt,reviews`
  );

  if (!prs || prs.length === 0) {
    return { total: 0, merged: 0, closed: 0, merge_rate: 0, avg_response_hours: null };
  }

  let merged = 0;
  let closed = 0;
  let responseTimes: number[] = [];

  for (const pr of prs) {
    if (pr.mergedAt) {
      merged++;
    } else if (pr.state === "CLOSED") {
      closed++;
    }

    // Calculate response time from first review
    if (pr.reviews && pr.reviews.length > 0 && pr.createdAt) {
      const created = new Date(pr.createdAt).getTime();
      const firstReview = new Date(pr.reviews[0].submittedAt || pr.reviews[0].createdAt).getTime();
      if (firstReview > created) {
        responseTimes.push((firstReview - created) / (1000 * 60 * 60));
      }
    }
  }

  const total = prs.length;
  const finishedPrs = merged + closed;

  return {
    total,
    merged,
    closed,
    merge_rate: finishedPrs > 0 ? merged / finishedPrs : 0,
    avg_response_hours: responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null,
  };
}

export function classifyIssue(issue: IssueInfo): { type: string; difficulty: string } {
  const title = issue.title.toLowerCase();
  const labels = issue.labels.map(l => l.toLowerCase());
  const body = (issue.body || "").toLowerCase();

  // Type classification
  let type = "other";
  if (labels.some(l => l.includes("bug") || l.includes("defect")) || title.includes("bug") || title.includes("fix")) {
    type = "bug";
  } else if (labels.some(l => l.includes("feature") || l.includes("enhancement"))) {
    type = "feature";
  } else if (labels.some(l => l.includes("doc") || l.includes("documentation")) || title.includes("doc")) {
    type = "docs";
  } else if (labels.some(l => l.includes("test")) || title.includes("test")) {
    type = "test";
  } else if (labels.some(l => l.includes("refactor")) || title.includes("refactor")) {
    type = "refactor";
  }

  // Difficulty classification
  let difficulty = "unknown";
  if (labels.some(l => l.includes("good first issue") || l.includes("beginner") || l.includes("easy"))) {
    difficulty = "easy";
  } else if (labels.some(l => l.includes("help wanted"))) {
    difficulty = "medium";
  } else if (labels.some(l => l.includes("complex") || l.includes("hard"))) {
    difficulty = "hard";
  } else if (body.length > 2000 || labels.some(l => l.includes("feature"))) {
    difficulty = "medium";
  }

  return { type, difficulty };
}

/** Check if an issue has linked/associated open PRs */
export function checkLinkedPRs(owner: string, repo: string, issueNumber: number): { hasPR: boolean; prNumbers: number[] } {
  try {
    // Search for open PRs that mention this issue
    const prs = ghJson(
      `pr list -R ${owner}/${repo} --state open --limit 20 --json number,title,body`
    );
    if (!prs || prs.length === 0) return { hasPR: false, prNumbers: [] };

    const linked: number[] = [];
    const pattern = new RegExp(`(fixes|closes|resolves)\\s*#${issueNumber}\\b`, "i");
    const refPattern = new RegExp(`#${issueNumber}\\b`);

    for (const pr of prs) {
      const text = `${pr.title || ""} ${pr.body || ""}`;
      if (pattern.test(text) || refPattern.test(text)) {
        linked.push(pr.number);
      }
    }

    return { hasPR: linked.length > 0, prNumbers: linked };
  } catch {
    return { hasPR: false, prNumbers: [] };
  }
}

/** Get current authenticated GitHub username */
export function getMyLogin(): string {
  return gh("api user --jq .login");
}

/** Fork a repo if not already forked. Returns the fork's full_name (e.g. myuser/repo) */
export function ensureFork(owner: string, repo: string, myLogin: string): string {
  // If I own the repo, no fork needed
  if (owner === myLogin) return `${owner}/${repo}`;

  // Check if fork already exists
  try {
    ghJson(`repo view ${myLogin}/${repo} --json name`);
    return `${myLogin}/${repo}`;
  } catch {
    // Fork it
    gh(`repo fork ${owner}/${repo} --clone=false`);
    return `${myLogin}/${repo}`;
  }
}

/** Clone a repo to a target dir (shallow). Returns the absolute path. */
export function cloneRepo(fullName: string, targetDir: string): string {
  const { execSync: exec } = require("child_process");
  const fs = require("fs");
  const p = require("path");

  const absDir = p.resolve(targetDir);
  const expectedUrl = `https://github.com/${fullName}.git`;

  if (fs.existsSync(p.join(absDir, ".git"))) {
    // Already cloned — ensure origin points to the right place
    const currentOrigin = exec("git remote get-url origin", {
      cwd: absDir, encoding: "utf-8", timeout: 5000,
    }).trim();
    if (currentOrigin !== expectedUrl) {
      exec(`git remote set-url origin ${expectedUrl}`, {
        cwd: absDir, encoding: "utf-8", timeout: 5000,
      });
    }
    exec("git fetch --all", { cwd: absDir, encoding: "utf-8", timeout: 30000 });
    return absDir;
  }

  exec(`git clone --depth 10 ${expectedUrl} ${absDir}`, {
    encoding: "utf-8",
    timeout: 60000,
  });
  return absDir;
}

/** Create a branch and check it out */
export function createBranch(repoDir: string, branchName: string): void {
  const { execSync: exec } = require("child_process");
  try {
    exec(`git checkout -b ${branchName}`, { cwd: repoDir, encoding: "utf-8" });
  } catch {
    // Branch might already exist
    exec(`git checkout ${branchName}`, { cwd: repoDir, encoding: "utf-8" });
  }
}

/** Add upstream remote if working from a fork */
export function addUpstreamRemote(repoDir: string, upstreamOwner: string, repo: string): void {
  const { execSync: exec } = require("child_process");
  // Check if upstream already exists
  try {
    exec("git remote get-url upstream", { cwd: repoDir, encoding: "utf-8", stdio: "pipe" });
    // Already exists — no-op
  } catch {
    // Doesn't exist — add it
    exec(`git remote add upstream https://github.com/${upstreamOwner}/${repo}.git`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
  }
}

/** Push current branch and create a PR. Returns PR URL. */
export function pushAndCreatePR(
  repoDir: string,
  upstreamOwner: string,
  upstreamRepo: string,
  issueNumber: number,
  title: string,
  body: string,
): string {
  const { execSync: exec } = require("child_process");

  // Get current branch
  const branch = exec("git rev-parse --abbrev-ref HEAD", {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();

  // Get the fork owner from origin remote URL
  const originUrl = exec("git remote get-url origin", {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();
  const forkMatch = originUrl.match(/github\.com[/:]([^/]+)\//);
  const forkOwner = forkMatch ? forkMatch[1] : getMyLogin();

  // Push
  exec(`git push -u origin ${branch}`, {
    cwd: repoDir,
    encoding: "utf-8",
    timeout: 30000,
  });

  // Create PR — use forkOwner:branch as head so GitHub knows which fork
  const headRef = forkOwner === upstreamOwner ? branch : `${forkOwner}:${branch}`;
  const prUrl = exec(
    `gh pr create -R ${upstreamOwner}/${upstreamRepo} --head ${headRef} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`,
    { cwd: repoDir, encoding: "utf-8", timeout: 30000 },
  ).trim();

  return prUrl;
}

export interface PRStatusInfo {
  number: number;
  state: string;       // OPEN | MERGED | CLOSED
  mergedAt: string | null;
  closedAt: string | null;
  reviewComments: number;
  reviews: Array<{
    state: string;     // APPROVED | CHANGES_REQUESTED | COMMENTED
    author: string;
    body: string;
  }>;
  needsAction: boolean;  // true if there are unaddressed review requests
  lastUpdated: string;
}

/** Get detailed PR status including reviews */
export function getPRStatus(owner: string, repo: string, prNumber: number): PRStatusInfo {
  const data = ghJson(
    `pr view ${prNumber} -R ${owner}/${repo} --json number,state,mergedAt,closedAt,reviews,comments,updatedAt`
  );

  const reviews = (data.reviews || []).map((r: any) => ({
    state: r.state || "COMMENTED",
    author: r.author?.login || "unknown",
    body: r.body || "",
  }));

  // Needs action if latest review is CHANGES_REQUESTED
  const lastReview = reviews.length > 0 ? reviews[reviews.length - 1] : null;
  const needsAction = lastReview?.state === "CHANGES_REQUESTED";

  return {
    number: data.number,
    state: data.mergedAt ? "MERGED" : data.state,
    mergedAt: data.mergedAt || null,
    closedAt: data.closedAt || null,
    reviewComments: data.comments?.totalCount ?? 0,
    reviews,
    needsAction,
    lastUpdated: data.updatedAt || "",
  };
}

/** Get issue status — is it open, closed, has someone started working on it? */
export function getIssueStatus(owner: string, repo: string, issueNumber: number): {
  state: string;
  comments: number;
  hasLinkedPR: boolean;
} {
  const data = ghJson(
    `issue view ${issueNumber} -R ${owner}/${repo} --json state,comments`
  );
  const state = (data.state || "OPEN").toLowerCase();
  const comments = data.comments?.length ?? 0;

  // Check if any PR references this issue
  const { hasPR } = checkLinkedPRs(owner, repo, issueNumber);

  return { state, comments, hasLinkedPR: hasPR };
}
