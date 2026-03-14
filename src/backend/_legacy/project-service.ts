import { db } from './database';
import { GitHubAPI } from './github-api';
import type { Project, ProjectSnapshot } from '../types';

export class ProjectService {
  private githubApi: GitHubAPI;

  constructor(githubToken?: string) {
    this.githubApi = new GitHubAPI(githubToken);
  }

  /**
   * Add a new project from GitHub URL
   */
  async addProject(repoUrl: string): Promise<Project> {
    // Check if project already exists
    const existing = this.getProjectByUrl(repoUrl);
    if (existing) {
      return existing;
    }

    // Fetch from GitHub
    const data = await this.githubApi.fetchRepoByUrl(repoUrl);

    // Insert into database
    const result = db.prepare(`
      INSERT INTO projects (repo_url, name, description, stars, forks, language, last_commit_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      repoUrl,
      data.full_name,
      data.description,
      data.stargazers_count,
      data.forks_count,
      data.language,
      data.pushed_at
    );

    const projectId = result.lastInsertRowid as number;

    // Create initial snapshot
    this.createSnapshot(projectId, data.stargazers_count, data.forks_count, data.open_issues_count);

    return this.getProjectById(projectId)!;
  }

  /**
   * Get project by ID
   */
  getProjectById(id: number): Project | undefined {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  }

  /**
   * Get project by URL
   */
  getProjectByUrl(url: string): Project | undefined {
    return db.prepare('SELECT * FROM projects WHERE repo_url = ?').get(url) as Project | undefined;
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    return db.prepare('SELECT * FROM projects ORDER BY stars DESC').all() as Project[];
  }

  /**
   * Update project data from GitHub
   */
  async updateProject(projectId: number): Promise<void> {
    const project = this.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const data = await this.githubApi.fetchRepoByUrl(project.repo_url);

    db.prepare(`
      UPDATE projects
      SET stars = ?, forks = ?, last_commit_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(data.stargazers_count, data.forks_count, data.pushed_at, projectId);

    // Create snapshot
    this.createSnapshot(projectId, data.stargazers_count, data.forks_count, data.open_issues_count);
  }

  /**
   * Create a snapshot of project data
   */
  createSnapshot(projectId: number, stars: number, forks: number, openIssues: number): void {
    db.prepare(`
      INSERT INTO project_snapshots (project_id, stars, forks, open_issues, commits_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, stars, forks, openIssues, 0); // commits_count to be implemented later
  }

  /**
   * Get snapshots for a project (for K-line chart)
   */
  getProjectSnapshots(projectId: number, limit: number = 100): ProjectSnapshot[] {
    return db.prepare(`
      SELECT * FROM project_snapshots
      WHERE project_id = ?
      ORDER BY snapshot_at DESC
      LIMIT ?
    `).all(projectId, limit) as ProjectSnapshot[];
  }

  /**
   * Delete a project
   */
  deleteProject(projectId: number): void {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  }
}
