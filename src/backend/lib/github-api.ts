import type { Project } from '../types';

export interface GitHubRepoData {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  open_issues_count: number;
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

  /**
   * Parse GitHub URL to extract owner and repo name
   */
  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  /**
   * Fetch repository data from GitHub API
   */
  async fetchRepo(owner: string, repo: string): Promise<GitHubRepoData> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}`;
    const response = await fetch(url, { headers: this.getHeaders() });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as GitHubRepoData;
  }

  /**
   * Fetch repository by URL
   */
  async fetchRepoByUrl(repoUrl: string): Promise<GitHubRepoData> {
    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) {
      throw new Error('Invalid GitHub repository URL');
    }
    return this.fetchRepo(parsed.owner, parsed.repo);
  }

  /**
   * Calculate project score (for buy_price)
   */
  calculateProjectScore(data: GitHubRepoData): number {
    // Simple scoring: stars + forks * 2
    return data.stargazers_count + (data.forks_count * 2);
  }

  /**
   * Fetch GitHub Trending repositories
   */
  async fetchTrending(language?: string, since: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<string[]> {
    // Note: GitHub doesn't have official trending API
    // In production, you might scrape github.com/trending or use third-party service
    // For MVP, return empty array (users can add projects manually)
    console.warn('Trending API not implemented - returning empty list');
    return [];
  }
}
