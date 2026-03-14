export interface GitHubRepoData {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  open_issues_count: number;
  has_contributing?: boolean;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  labels: Array<{ name: string }>;
  state: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubPullRequest {
  number: number;
  state: string;
  merged_at: string | null;
  created_at: string;
  closed_at: string | null;
}

export class GitHubAPI {
  private baseUrl = 'https://api.github.com';
  private token: string | null;

  constructor(token?: string) {
    this.token = token || null;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GoGetAJob/1.0'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  async fetchRepo(owner: string, repo: string): Promise<GitHubRepoData> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}`;
    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as GitHubRepoData;
  }

  async fetchRepoByUrl(repoUrl: string): Promise<GitHubRepoData> {
    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) {
      throw new Error('Invalid GitHub repository URL');
    }
    return this.fetchRepo(parsed.owner, parsed.repo);
  }

  calculateProjectScore(data: GitHubRepoData): number {
    return data.stargazers_count + (data.forks_count * 2);
  }

  /**
   * Fetch open issues for a repository
   */
  async fetchIssues(owner: string, repo: string, page: number = 1, perPage: number = 30): Promise<GitHubIssue[]> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/issues?state=open&per_page=${perPage}&page=${page}&sort=created&direction=desc`;
    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const issues = await response.json() as any[];
    // Filter out pull requests (GitHub API includes them in issues)
    return issues.filter((i: any) => !i.pull_request) as GitHubIssue[];
  }

  /**
   * Fetch recent closed PRs to calculate merge rate
   */
  async fetchRecentPRs(owner: string, repo: string, count: number = 100): Promise<GitHubPullRequest[]> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls?state=closed&per_page=${Math.min(count, 100)}&sort=updated&direction=desc`;
    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as GitHubPullRequest[];
  }

  /**
   * Calculate PR merge rate from recent PRs
   */
  async calculateMergeRate(owner: string, repo: string): Promise<number> {
    const prs = await this.fetchRecentPRs(owner, repo);
    if (prs.length === 0) return 0;

    const merged = prs.filter(pr => pr.merged_at !== null).length;
    return Math.round((merged / prs.length) * 100);
  }

  /**
   * Calculate average PR response time (time from creation to close) in hours
   */
  async calculateAvgResponseTime(owner: string, repo: string): Promise<number> {
    const prs = await this.fetchRecentPRs(owner, repo, 50);
    const closedPRs = prs.filter(pr => pr.closed_at);

    if (closedPRs.length === 0) return 0;

    let totalHours = 0;
    for (const pr of closedPRs) {
      const created = new Date(pr.created_at).getTime();
      const closed = new Date(pr.closed_at!).getTime();
      totalHours += (closed - created) / (1000 * 60 * 60);
    }

    return Math.round(totalHours / closedPRs.length);
  }

  /**
   * Check if repo has a CONTRIBUTING.md file
   */
  async fetchContributingGuide(owner: string, repo: string): Promise<string | null> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/CONTRIBUTING.md`;
    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) return null;

    const data = await response.json() as any;
    if (data.download_url) {
      return data.download_url;
    }
    return null;
  }
}
