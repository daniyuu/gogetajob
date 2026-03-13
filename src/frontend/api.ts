const API_BASE = 'http://localhost:9393/api';

export interface Project {
  id: number;
  repo_url: string;
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  last_commit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: number;
  project_id: number;
  status: 'active' | 'stopped';
  claude_session_id: string | null;
  buy_price: number;
  token_cost: number;
  started_at: string;
  stopped_at: string | null;
}

export const api = {
  // Projects
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    return res.json();
  },

  async getProject(id: number): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    return res.json();
  },

  async addProject(repoUrl: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_url: repoUrl })
    });
    return res.json();
  },

  async getProjectSnapshots(id: number) {
    const res = await fetch(`${API_BASE}/projects/${id}/snapshots`);
    return res.json();
  },

  // Positions
  async getPositions(): Promise<Position[]> {
    const res = await fetch(`${API_BASE}/positions`);
    return res.json();
  },

  async getActivePositions(): Promise<Position[]> {
    const res = await fetch(`${API_BASE}/positions/active`);
    return res.json();
  },

  async buyPosition(projectId: number): Promise<Position> {
    const res = await fetch(`${API_BASE}/positions/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId })
    });
    return res.json();
  },

  async sellPosition(positionId: number): Promise<void> {
    await fetch(`${API_BASE}/positions/${positionId}/sell`, {
      method: 'POST'
    });
  },

  async getPositionROI(positionId: number): Promise<{ roi: number }> {
    const res = await fetch(`${API_BASE}/positions/${positionId}/roi`);
    return res.json();
  },

  async getPositionPRs(positionId: number) {
    const res = await fetch(`${API_BASE}/positions/${positionId}/prs`);
    return res.json();
  },

  // Notifications
  async getNotifications(unreadOnly: boolean = false) {
    const res = await fetch(`${API_BASE}/notifications?unread=${unreadOnly}`);
    return res.json();
  },

  async markNotificationRead(id: number): Promise<void> {
    await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'POST'
    });
  }
};
