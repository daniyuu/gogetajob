import { Octokit } from '@octokit/rest';

export interface RepoIdentifier {
  owner: string;
  repo: string;
}

export interface GitHubRepoData {
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues_count: number;
  pushed_at: string;
  default_branch: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  assignee: string | null;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  merged_at: string | null;
  created_at: string;
  closed_at: string | null;
}

export class GitHubClient {
  private octokit: Octokit;
  private token: string | null;

  constructor(token?: string) {
    this.token = token || null;
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'GoGetAJob/3.0',
    });
  }

  parseRepoUrl(url: string): RepoIdentifier | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    return {
      owner: match[1],
      repo: match[2].replace(/\/$/, '').replace(/\.git$/, '')
    };
  }

  parseRepoIdentifier(input: string): RepoIdentifier | null {
    const fromUrl = this.parseRepoUrl(input);
    if (fromUrl) return fromUrl;
    const match = input.match(/^([^\/]+)\/([^\/]+)$/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  async fetchRepo(owner: string, repo: string): Promise<GitHubRepoData> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return {
      owner: data.owner.login,
      repo: data.name,
      description: data.description,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      open_issues_count: data.open_issues_count,
      pushed_at: data.pushed_at || '',
      default_branch: data.default_branch,
    };
  }

  async fetchIssues(
    owner: string,
    repo: string,
    options: { state?: 'open' | 'closed' | 'all'; labels?: string; per_page?: number } = {}
  ): Promise<GitHubIssue[]> {
    const { data } = await this.octokit.issues.listForRepo({
      owner, repo,
      state: options.state || 'open',
      labels: options.labels,
      per_page: options.per_page || 100,
    });
    return data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? null,
        labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name || '')),
        html_url: issue.html_url,
        state: issue.state,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        assignee: issue.assignee?.login || null,
      }));
  }

  async fetchPullRequests(
    owner: string,
    repo: string,
    options: { state?: 'open' | 'closed' | 'all'; per_page?: number } = {}
  ): Promise<GitHubPR[]> {
    const { data } = await this.octokit.pulls.list({
      owner, repo,
      state: options.state || 'all',
      per_page: options.per_page || 100,
    });
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged_at !== null,
      merged_at: pr.merged_at,
      created_at: pr.created_at,
      closed_at: pr.closed_at,
    }));
  }

  async checkFileExists(owner: string, repo: string, path: string): Promise<boolean> {
    try {
      await this.octokit.repos.getContent({ owner, repo, path });
      return true;
    } catch {
      return false;
    }
  }

  async fetchFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({ owner, repo, path });
      if ('content' in data && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }
}
