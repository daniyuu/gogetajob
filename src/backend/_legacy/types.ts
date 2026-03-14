// === Existing types (kept for backward compat) ===

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

// === New types for AI Agent Job Market ===

export interface Company {
  id: number;
  repo_url: string;
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  open_issues_count: number;
  pr_merge_rate: number | null;
  avg_response_time_hours: number | null;
  contribution_guide: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export type JobType = 'bug' | 'feature' | 'docs' | 'test' | 'other';
export type JobDifficulty = 'easy' | 'medium' | 'hard' | 'unknown';
export type JobStatus = 'open' | 'taken' | 'done' | 'dropped' | 'closed';

export interface Job {
  id: number;
  company_id: number;
  issue_number: number;
  issue_url: string;
  title: string;
  body: string | null;
  labels: string;  // JSON array stored as string
  type: JobType;
  difficulty: JobDifficulty;
  status: JobStatus;
  language: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkLogStatus = 'taken' | 'done' | 'dropped';

export interface WorkLog {
  id: number;
  job_id: number;
  company_id: number;
  status: WorkLogStatus;
  taken_at: string;
  completed_at: string | null;
  dropped_at: string | null;
  pr_number: number | null;
  pr_url: string | null;
  tokens_used: number | null;
  notes: string | null;
  created_at: string;
}
