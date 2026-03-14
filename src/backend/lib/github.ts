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
  let cmd = `issue list -R ${owner}/${repo} --state open --limit ${limit} --json number,title,body,labels,state,url,createdAt`;
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
