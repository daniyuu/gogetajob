import { GitHubClient, GitHubPR } from '../github/client';
import { Database } from '../db/database';

export interface CompanyProfile {
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues_count: number;
  pr_merge_rate: number;
  avg_response_hours: number;
  last_commit_at: string | null;
  is_active: boolean;
  maintainer_style: 'friendly' | 'strict' | 'abandoned' | 'unknown';
  has_cla: boolean;
  has_contributing_guide: boolean;
  analyzed_at: string;
}

export class CompanyProfiler {
  private githubClient: GitHubClient;
  private database: Database;

  constructor(githubClient: GitHubClient, database: Database) {
    this.githubClient = githubClient;
    this.database = database;
  }

  /**
   * Calculate the merge rate from a list of PRs.
   * Returns ratio of merged PRs to closed PRs.
   */
  calculateMergeRateFromPRs(prs: GitHubPR[]): number {
    const closedPRs = prs.filter((pr) => pr.state === 'closed');
    if (closedPRs.length === 0) {
      return 0;
    }

    const mergedPRs = closedPRs.filter((pr) => pr.merged);
    return mergedPRs.length / closedPRs.length;
  }

  /**
   * Calculate average hours from PR created to closed.
   */
  calculateAvgResponseHours(prs: GitHubPR[]): number {
    const closedPRs = prs.filter((pr) => pr.state === 'closed' && pr.closed_at);
    if (closedPRs.length === 0) {
      return 0;
    }

    const totalHours = closedPRs.reduce((sum, pr) => {
      const createdAt = new Date(pr.created_at).getTime();
      const closedAt = new Date(pr.closed_at!).getTime();
      const hours = (closedAt - createdAt) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);

    return totalHours / closedPRs.length;
  }

  /**
   * Infer maintainer style based on merge rate and response time.
   * - 'friendly': High merge rate (>= 0.6) and fast response (< 72h)
   * - 'strict': High merge rate (>= 0.5) but slow response (>= 72h)
   * - 'abandoned': Very low merge rate (< 0.2)
   * - 'unknown': Edge cases or insufficient data
   */
  inferMaintainerStyle(
    mergeRate: number,
    avgResponseHours: number
  ): 'friendly' | 'strict' | 'abandoned' | 'unknown' {
    // Edge case: no data
    if (mergeRate === 0 && avgResponseHours === 0) {
      return 'unknown';
    }

    // Very low merge rate indicates abandoned or highly selective
    if (mergeRate < 0.2) {
      return 'abandoned';
    }

    // High merge rate with fast response = friendly maintainers
    if (mergeRate >= 0.6 && avgResponseHours < 72) {
      return 'friendly';
    }

    // Decent merge rate but slow response = strict/thorough reviewers
    if (mergeRate >= 0.5 && avgResponseHours >= 72) {
      return 'strict';
    }

    return 'unknown';
  }

  /**
   * Check if repo is active (commit within 6 months).
   */
  isRepoActive(lastCommitAt: string | null): boolean {
    if (!lastCommitAt) {
      return false;
    }

    const lastCommit = new Date(lastCommitAt);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return lastCommit > sixMonthsAgo;
  }

  /**
   * Full analysis of a GitHub repository.
   */
  async analyze(owner: string, repo: string): Promise<CompanyProfile> {
    // Fetch repo data
    const repoData = await this.githubClient.fetchRepo(owner, repo);

    // Fetch PRs for analysis
    const prs = await this.githubClient.fetchPullRequests(owner, repo, {
      state: 'all',
      per_page: 100,
    });

    // Calculate metrics
    const prMergeRate = this.calculateMergeRateFromPRs(prs);
    const avgResponseHours = this.calculateAvgResponseHours(prs);
    const maintainerStyle = this.inferMaintainerStyle(prMergeRate, avgResponseHours);
    const isActive = this.isRepoActive(repoData.pushed_at);

    // Check for contributing guide and CLA
    const hasContributingGuide = await this.checkContributingGuide(owner, repo);
    const hasCla = await this.checkCla(owner, repo);

    return {
      owner: repoData.owner,
      repo: repoData.repo,
      description: repoData.description,
      language: repoData.language,
      stars: repoData.stars,
      forks: repoData.forks,
      open_issues_count: repoData.open_issues_count,
      pr_merge_rate: prMergeRate,
      avg_response_hours: avgResponseHours,
      last_commit_at: repoData.pushed_at,
      is_active: isActive,
      maintainer_style: maintainerStyle,
      has_cla: hasCla,
      has_contributing_guide: hasContributingGuide,
      analyzed_at: new Date().toISOString(),
    };
  }

  /**
   * Check if repo has a contributing guide.
   */
  private async checkContributingGuide(owner: string, repo: string): Promise<boolean> {
    const paths = ['CONTRIBUTING.md', 'CONTRIBUTING', '.github/CONTRIBUTING.md'];
    for (const path of paths) {
      if (await this.githubClient.checkFileExists(owner, repo, path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if repo has a CLA requirement.
   */
  private async checkCla(owner: string, repo: string): Promise<boolean> {
    const paths = ['CLA.md', '.github/CLA.md', 'docs/CLA.md'];
    for (const path of paths) {
      if (await this.githubClient.checkFileExists(owner, repo, path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Save company profile to database using upsert.
   */
  async saveToDatabase(profile: CompanyProfile): Promise<number> {
    const sql = `
      INSERT INTO companies (
        owner, repo, description, language, stars, forks, open_issues_count,
        pr_merge_rate, avg_response_hours, last_commit_at, is_active,
        maintainer_style, has_cla, has_contributing_guide, analyzed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(owner, repo) DO UPDATE SET
        description = excluded.description,
        language = excluded.language,
        stars = excluded.stars,
        forks = excluded.forks,
        open_issues_count = excluded.open_issues_count,
        pr_merge_rate = excluded.pr_merge_rate,
        avg_response_hours = excluded.avg_response_hours,
        last_commit_at = excluded.last_commit_at,
        is_active = excluded.is_active,
        maintainer_style = excluded.maintainer_style,
        has_cla = excluded.has_cla,
        has_contributing_guide = excluded.has_contributing_guide,
        analyzed_at = excluded.analyzed_at,
        updated_at = datetime('now')
    `;

    const result = this.database.run(sql, [
      profile.owner,
      profile.repo,
      profile.description,
      profile.language,
      profile.stars,
      profile.forks,
      profile.open_issues_count,
      profile.pr_merge_rate,
      profile.avg_response_hours,
      profile.last_commit_at,
      profile.is_active ? 1 : 0,
      profile.maintainer_style,
      profile.has_cla ? 1 : 0,
      profile.has_contributing_guide ? 1 : 0,
      profile.analyzed_at,
    ]);

    return result.lastInsertRowid as number;
  }
}
