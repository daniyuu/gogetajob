import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompanyProfiler, CompanyProfile } from '../../../src/v3/core/company-profiler';
import { GitHubClient, GitHubPR } from '../../../src/v3/github/client';
import { Database } from '../../../src/v3/db/database';

// Mock dependencies
vi.mock('../../../src/v3/github/client');
vi.mock('../../../src/v3/db/database');

describe('CompanyProfiler', () => {
  let profiler: CompanyProfiler;
  let mockGitHubClient: GitHubClient;
  let mockDatabase: Database;

  beforeEach(() => {
    mockGitHubClient = new GitHubClient() as any;
    mockDatabase = new Database() as any;
    profiler = new CompanyProfiler(mockGitHubClient, mockDatabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateMergeRateFromPRs', () => {
    it('calculates merge rate from PRs (2 merged out of 3 closed = 0.67)', () => {
      const prs: GitHubPR[] = [
        { number: 1, title: 'PR 1', state: 'closed', merged: true, merged_at: '2024-01-01', created_at: '2024-01-01', closed_at: '2024-01-02' },
        { number: 2, title: 'PR 2', state: 'closed', merged: true, merged_at: '2024-01-02', created_at: '2024-01-02', closed_at: '2024-01-03' },
        { number: 3, title: 'PR 3', state: 'closed', merged: false, merged_at: null, created_at: '2024-01-03', closed_at: '2024-01-04' },
      ];

      const rate = profiler.calculateMergeRateFromPRs(prs);
      expect(rate).toBeCloseTo(0.67, 2);
    });

    it('returns 0 for no closed PRs', () => {
      const prs: GitHubPR[] = [
        { number: 1, title: 'PR 1', state: 'open', merged: false, merged_at: null, created_at: '2024-01-01', closed_at: null },
      ];

      const rate = profiler.calculateMergeRateFromPRs(prs);
      expect(rate).toBe(0);
    });

    it('returns 0 for empty PRs array', () => {
      const rate = profiler.calculateMergeRateFromPRs([]);
      expect(rate).toBe(0);
    });
  });

  describe('calculateAvgResponseHours', () => {
    it('calculates average response hours correctly', () => {
      const prs: GitHubPR[] = [
        { number: 1, title: 'PR 1', state: 'closed', merged: true, merged_at: '2024-01-02T00:00:00Z', created_at: '2024-01-01T00:00:00Z', closed_at: '2024-01-02T00:00:00Z' }, // 24h
        { number: 2, title: 'PR 2', state: 'closed', merged: true, merged_at: '2024-01-04T00:00:00Z', created_at: '2024-01-01T00:00:00Z', closed_at: '2024-01-04T00:00:00Z' }, // 72h
      ];

      const avgHours = profiler.calculateAvgResponseHours(prs);
      expect(avgHours).toBe(48); // (24 + 72) / 2
    });

    it('returns 0 for no closed PRs', () => {
      const prs: GitHubPR[] = [
        { number: 1, title: 'PR 1', state: 'open', merged: false, merged_at: null, created_at: '2024-01-01', closed_at: null },
      ];

      const avgHours = profiler.calculateAvgResponseHours(prs);
      expect(avgHours).toBe(0);
    });
  });

  describe('inferMaintainerStyle', () => {
    it('returns friendly for high merge rate (0.8) and fast response (24h)', () => {
      const style = profiler.inferMaintainerStyle(0.8, 24);
      expect(style).toBe('friendly');
    });

    it('returns strict for high merge rate (0.7) but slow response (120h)', () => {
      const style = profiler.inferMaintainerStyle(0.7, 120);
      expect(style).toBe('strict');
    });

    it('returns abandoned for very low merge rate (0.1)', () => {
      const style = profiler.inferMaintainerStyle(0.1, 24);
      expect(style).toBe('abandoned');
    });

    it('returns unknown for edge cases', () => {
      const style = profiler.inferMaintainerStyle(0, 0);
      expect(style).toBe('unknown');
    });
  });

  describe('isRepoActive', () => {
    it('returns true if commit within 6 months', () => {
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 3);
      const isActive = profiler.isRepoActive(recentDate.toISOString());
      expect(isActive).toBe(true);
    });

    it('returns false if commit older than 6 months', () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8);
      const isActive = profiler.isRepoActive(oldDate.toISOString());
      expect(isActive).toBe(false);
    });

    it('returns false for null date', () => {
      const isActive = profiler.isRepoActive(null);
      expect(isActive).toBe(false);
    });
  });

  describe('analyze', () => {
    it('returns full CompanyProfile for a repo', async () => {
      const mockRepoData = {
        owner: 'test-owner',
        repo: 'test-repo',
        description: 'A test repo',
        language: 'TypeScript',
        stars: 100,
        forks: 10,
        open_issues_count: 5,
        pushed_at: new Date().toISOString(),
        default_branch: 'main',
      };

      const mockPRs: GitHubPR[] = [
        { number: 1, title: 'PR 1', state: 'closed', merged: true, merged_at: '2024-01-02T00:00:00Z', created_at: '2024-01-01T00:00:00Z', closed_at: '2024-01-02T00:00:00Z' },
        { number: 2, title: 'PR 2', state: 'closed', merged: true, merged_at: '2024-01-03T00:00:00Z', created_at: '2024-01-02T00:00:00Z', closed_at: '2024-01-03T00:00:00Z' },
      ];

      vi.mocked(mockGitHubClient.fetchRepo).mockResolvedValue(mockRepoData);
      vi.mocked(mockGitHubClient.fetchPullRequests).mockResolvedValue(mockPRs);
      vi.mocked(mockGitHubClient.checkFileExists).mockResolvedValue(true);

      const profile = await profiler.analyze('test-owner', 'test-repo');

      expect(profile.owner).toBe('test-owner');
      expect(profile.repo).toBe('test-repo');
      expect(profile.pr_merge_rate).toBe(1); // Both PRs merged
      expect(profile.is_active).toBe(true);
      expect(profile.has_contributing_guide).toBe(true);
    });
  });

  describe('saveToDatabase', () => {
    it('inserts or updates company profile in database', async () => {
      const profile: CompanyProfile = {
        owner: 'test-owner',
        repo: 'test-repo',
        description: 'A test repo',
        language: 'TypeScript',
        stars: 100,
        forks: 10,
        open_issues_count: 5,
        pr_merge_rate: 0.8,
        avg_response_hours: 24,
        last_commit_at: new Date().toISOString(),
        is_active: true,
        maintainer_style: 'friendly',
        has_cla: false,
        has_contributing_guide: true,
        analyzed_at: new Date().toISOString(),
      };

      vi.mocked(mockDatabase.run).mockReturnValue({ changes: 1, lastInsertRowid: 1 } as any);

      const result = await profiler.saveToDatabase(profile);

      expect(mockDatabase.run).toHaveBeenCalled();
      expect(result).toBe(1);
    });
  });
});
