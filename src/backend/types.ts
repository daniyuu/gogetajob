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

export interface ProjectSnapshot {
  id: number;
  project_id: number;
  stars: number;
  forks: number;
  open_issues: number;
  commits_count: number;
  snapshot_at: string;
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

export interface PullRequest {
  id: number;
  position_id: number;
  pr_number: number;
  pr_url: string;
  issue_url: string | null;
  status: 'pending' | 'merged' | 'closed' | 'review';
  token_cost: number;
  created_at: string;
  merged_at: string | null;
}

export interface Notification {
  id: number;
  position_id: number;
  type: 'pr_merged' | 'pr_closed' | 'pr_review' | 'error' | 'milestone';
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Config {
  port: number;
  githubToken: string | null;
  claudePath: string;
  maxParallelWorkers: number;
  updateIntervals: {
    hot: number;    // stars > 10k
    warm: number;   // 1k-10k stars
    cold: number;   // < 1k stars
    positions: number;
  };
}
