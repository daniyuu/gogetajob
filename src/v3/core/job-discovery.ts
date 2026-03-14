// Job discovery service
import { GitHubClient, GitHubIssue, RepoIdentifier } from '../github/client';
import { Database } from '../db/database';

/**
 * Labels that indicate an issue is suitable for contribution
 */
export const SUITABLE_LABELS = [
  'good-first-issue',
  'good first issue',
  'help-wanted',
  'help wanted',
  'bug',
  'documentation',
  'enhancement',
  'beginner',
  'starter',
  'easy',
];

/**
 * Maximum age (in days) for an issue to be considered fresh
 */
const MAX_ISSUE_AGE_DAYS = 30;

/**
 * JobDiscovery service for finding suitable GitHub issues from tracked repos.
 *
 * Issues are filtered by:
 * - Open state
 * - Not assigned
 * - Has suitable labels (good-first-issue, help-wanted, bug, etc.)
 * - Recently updated (within 30 days)
 */
export class JobDiscovery {
  private client: GitHubClient;
  private db: Database | null;

  constructor(client?: GitHubClient, db?: Database) {
    this.client = client || new GitHubClient();
    this.db = db || null;
  }

  /**
   * Check if an issue meets all criteria to be considered suitable:
   * - Must be open
   * - Must not be assigned
   * - Must have at least one suitable label
   * - Must have been updated within the last 30 days
   */
  isSuitableIssue(issue: GitHubIssue): boolean {
    // Must be open
    if (issue.state !== 'open') {
      return false;
    }

    // Must not be assigned
    if (issue.assignee !== null) {
      return false;
    }

    // Must have at least one suitable label
    const hasGoodLabel = this.hasSuitableLabel(issue.labels);
    if (!hasGoodLabel) {
      return false;
    }

    // Must be recently updated (within 30 days)
    if (this.isStale(issue.updated_at)) {
      return false;
    }

    return true;
  }

  /**
   * Filter an array of issues to only include suitable ones
   */
  filterSuitableIssues(issues: GitHubIssue[]): GitHubIssue[] {
    return issues.filter(issue => this.isSuitableIssue(issue));
  }

  /**
   * Fetch and filter issues from a single repository
   */
  async discoverFromRepo(owner: string, repo: string): Promise<GitHubIssue[]> {
    try {
      const issues = await this.client.fetchIssues(owner, repo, { state: 'open' });
      return this.filterSuitableIssues(issues);
    } catch (error) {
      console.error(`Failed to fetch issues from ${owner}/${repo}:`, error);
      return [];
    }
  }

  /**
   * Fetch and filter issues from multiple repositories
   */
  async discoverFromRepos(repos: RepoIdentifier[]): Promise<GitHubIssue[]> {
    if (repos.length === 0) {
      return [];
    }

    const results = await Promise.all(
      repos.map(({ owner, repo }) => this.discoverFromRepo(owner, repo))
    );

    return results.flat();
  }

  /**
   * Save discovered issues to the database as jobs
   * Returns the number of successfully saved jobs
   */
  saveJobsToDatabase(companyId: number, issues: GitHubIssue[]): number {
    if (issues.length === 0 || !this.db) {
      return 0;
    }

    let savedCount = 0;

    for (const issue of issues) {
      try {
        this.db.run(
          `INSERT INTO jobs (
            company_id, issue_number, title, body, labels, html_url, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'open')
          ON CONFLICT(company_id, issue_number) DO UPDATE SET
            title = excluded.title,
            body = excluded.body,
            labels = excluded.labels,
            html_url = excluded.html_url,
            updated_at = datetime('now')`,
          [
            companyId,
            issue.number,
            issue.title,
            issue.body || '',
            JSON.stringify(issue.labels),
            issue.html_url,
          ]
        );
        savedCount++;
      } catch (error) {
        console.error(`Failed to save issue #${issue.number}:`, error);
      }
    }

    return savedCount;
  }

  /**
   * Check if any of the labels match suitable labels (case-insensitive)
   */
  private hasSuitableLabel(labels: string[]): boolean {
    const labelsLower = labels.map(l => l.toLowerCase());
    return SUITABLE_LABELS.some(suitable =>
      labelsLower.includes(suitable.toLowerCase())
    );
  }

  /**
   * Check if an issue is stale (updated more than MAX_ISSUE_AGE_DAYS ago)
   * Issues updated exactly 30 days ago are NOT considered stale.
   */
  private isStale(updatedAt: string): boolean {
    const updatedDate = new Date(updatedAt);
    const now = new Date();
    // Set time to start of day for consistent day comparison
    const updatedDay = new Date(updatedDate.getFullYear(), updatedDate.getMonth(), updatedDate.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = today.getTime() - updatedDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays > MAX_ISSUE_AGE_DAYS;
  }
}
