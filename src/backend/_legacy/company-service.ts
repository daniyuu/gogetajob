import { db } from './database';
import { GitHubAPI } from './github-api';
import type { Company } from '../types';

export class CompanyService {
  private githubApi: GitHubAPI;

  constructor(githubToken?: string) {
    this.githubApi = new GitHubAPI(githubToken);
  }

  /**
   * Add or update a company from owner/repo string
   */
  async addCompany(ownerRepo: string): Promise<Company> {
    const parts = ownerRepo.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid format: expected owner/repo, got "${ownerRepo}"`);
    }
    const [owner, repo] = parts;
    const repoUrl = `https://github.com/${owner}/${repo}`;

    const existing = this.getCompanyByUrl(repoUrl);
    if (existing) {
      return existing;
    }

    const data = await this.githubApi.fetchRepo(owner, repo);

    const result = db.prepare(`
      INSERT INTO companies (repo_url, owner, repo, name, description, stars, forks, language, open_issues_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      repoUrl,
      owner,
      repo,
      data.full_name,
      data.description,
      data.stargazers_count,
      data.forks_count,
      data.language,
      data.open_issues_count
    );

    return this.getCompanyById(result.lastInsertRowid as number)!;
  }

  /**
   * Full scan: update company stats including merge rate and response time
   */
  async scanCompany(ownerRepo: string): Promise<Company> {
    const company = await this.addCompany(ownerRepo);
    const { owner, repo } = company;

    const data = await this.githubApi.fetchRepo(owner, repo);
    const mergeRate = await this.githubApi.calculateMergeRate(owner, repo);
    const avgResponseTime = await this.githubApi.calculateAvgResponseTime(owner, repo);
    const contributionGuide = await this.githubApi.fetchContributingGuide(owner, repo);

    db.prepare(`
      UPDATE companies
      SET stars = ?, forks = ?, open_issues_count = ?,
          pr_merge_rate = ?, avg_response_time_hours = ?,
          contribution_guide = ?, last_scanned_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.stargazers_count,
      data.forks_count,
      data.open_issues_count,
      mergeRate,
      avgResponseTime,
      contributionGuide,
      company.id
    );

    return this.getCompanyById(company.id)!;
  }

  getCompanyById(id: number): Company | undefined {
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined;
  }

  getCompanyByUrl(url: string): Company | undefined {
    return db.prepare('SELECT * FROM companies WHERE repo_url = ?').get(url) as Company | undefined;
  }

  getCompanyByOwnerRepo(owner: string, repo: string): Company | undefined {
    return db.prepare('SELECT * FROM companies WHERE owner = ? AND repo = ?').get(owner, repo) as Company | undefined;
  }

  getAllCompanies(sortBy: string = 'stars'): Company[] {
    const orderMap: Record<string, string> = {
      'stars': 'stars DESC',
      'merge-rate': 'pr_merge_rate DESC',
      'activity': 'open_issues_count DESC',
    };
    const order = orderMap[sortBy] || 'stars DESC';
    return db.prepare(`SELECT * FROM companies ORDER BY ${order}`).all() as Company[];
  }
}
