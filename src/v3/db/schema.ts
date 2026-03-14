// Company (GitHub Repo)
export interface Company {
  id: number;
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
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Job (GitHub Issue)
export type JobType = 'bug_fix' | 'feature' | 'docs' | 'test' | 'refactor' | 'other';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'unknown';
export type JobStatus = 'open' | 'taken' | 'completed' | 'closed';

export interface Job {
  id: number;
  company_id: number;
  issue_number: number;
  title: string;
  body: string;
  labels: string[];
  html_url: string;
  job_type: JobType;
  difficulty: Difficulty;
  languages: string[];
  estimated_tokens: number;
  context_files: string[];
  has_bounty: boolean;
  bounty_amount: number | null;
  bounty_currency: string | null;
  merge_probability: number;
  status: JobStatus;
  parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Work Report
export type WorkStatus = 'in_progress' | 'pr_submitted' | 'pr_merged' | 'pr_closed' | 'abandoned';

export interface WorkReport {
  id: number;
  job_id: number;
  agent_id: string;
  status: WorkStatus;
  pr_number: number | null;
  pr_url: string | null;
  token_cost: number;
  started_at: string;
  pr_submitted_at: string | null;
  completed_at: string | null;
}

// Agent Profile
export interface AgentProfile {
  id: string;
  total_jobs: number;
  completed_jobs: number;
  total_prs: number;
  merged_prs: number;
  total_token_cost: number;
  top_languages: string[];
  top_job_types: string[];
  created_at: string;
  updated_at: string;
}

// Blacklist entry
export interface BlacklistEntry {
  id: number;
  owner: string;
  repo: string | null;
  reason: string | null;
  created_at: string;
}

// Config
export interface Config {
  github_token: string | null;
  agent_id: string;
  sync_interval: number;
  api_port: number;
}

// Query options
export interface JobQueryOptions {
  lang?: string;
  type?: JobType;
  difficulty?: Difficulty;
  min_merge_rate?: number;
  has_bounty?: boolean;
  limit?: number;
  sort?: 'bounty' | 'merge_rate' | 'difficulty' | 'newest';
}
