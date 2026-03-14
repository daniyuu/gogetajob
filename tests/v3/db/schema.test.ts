import { describe, it, expect } from 'vitest';
import type { Company, Job, WorkReport, AgentProfile, JobType, Difficulty } from '../../../src/v3/db/schema';

describe('Schema Types', () => {
  it('Company type has required fields', () => {
    const company: Company = {
      id: 1,
      owner: 'facebook',
      repo: 'react',
      description: 'A JavaScript library',
      language: 'JavaScript',
      stars: 220000,
      forks: 45000,
      open_issues_count: 1200,
      pr_merge_rate: 0.72,
      avg_response_hours: 48,
      last_commit_at: '2026-03-13T10:00:00Z',
      is_active: true,
      maintainer_style: 'strict',
      has_cla: true,
      has_contributing_guide: true,
      analyzed_at: '2026-03-14T08:00:00Z',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-14T08:00:00Z',
    };
    expect(company.owner).toBe('facebook');
    expect(company.maintainer_style).toBe('strict');
  });

  it('Job type has required fields', () => {
    const job: Job = {
      id: 1,
      company_id: 1,
      issue_number: 12345,
      title: 'Fix memory leak',
      body: 'Description here',
      labels: ['bug', 'good-first-issue'],
      html_url: 'https://github.com/facebook/react/issues/12345',
      job_type: 'bug_fix',
      difficulty: 'medium',
      languages: ['TypeScript'],
      estimated_tokens: 50000,
      context_files: ['src/hooks/useEffect.ts'],
      has_bounty: false,
      bounty_amount: null,
      bounty_currency: null,
      merge_probability: 0.72,
      status: 'open',
      parsed_at: '2026-03-14T08:00:00Z',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-14T08:00:00Z',
    };
    expect(job.job_type).toBe('bug_fix');
    expect(job.difficulty).toBe('medium');
  });

  it('JobType literal union is correct', () => {
    const types: JobType[] = ['bug_fix', 'feature', 'docs', 'test', 'refactor', 'other'];
    expect(types).toHaveLength(6);
  });

  it('Difficulty literal union is correct', () => {
    const levels: Difficulty[] = ['easy', 'medium', 'hard', 'unknown'];
    expect(levels).toHaveLength(4);
  });
});
