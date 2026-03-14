import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobDiscovery, SUITABLE_LABELS } from '../../../src/v3/core/job-discovery';
import { GitHubIssue } from '../../../src/v3/github/client';

// Helper to create mock issues
function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: 'Test issue',
    body: 'Test body',
    labels: [],
    html_url: 'https://github.com/test/repo/issues/1',
    state: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    assignee: null,
    ...overrides,
  };
}

describe('JobDiscovery', () => {
  let discovery: JobDiscovery;

  beforeEach(() => {
    discovery = new JobDiscovery();
  });

  describe('isSuitableIssue', () => {
    it('accepts issues with good-first-issue label', () => {
      const issue = createMockIssue({ labels: ['good-first-issue'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with "good first issue" label (space variant)', () => {
      const issue = createMockIssue({ labels: ['good first issue'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with help-wanted label', () => {
      const issue = createMockIssue({ labels: ['help-wanted'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with "help wanted" label (space variant)', () => {
      const issue = createMockIssue({ labels: ['help wanted'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with bug label', () => {
      const issue = createMockIssue({ labels: ['bug'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with documentation label', () => {
      const issue = createMockIssue({ labels: ['documentation'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with enhancement label', () => {
      const issue = createMockIssue({ labels: ['enhancement'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with beginner label', () => {
      const issue = createMockIssue({ labels: ['beginner'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with starter label', () => {
      const issue = createMockIssue({ labels: ['starter'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with easy label', () => {
      const issue = createMockIssue({ labels: ['easy'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues with multiple labels including a suitable one', () => {
      const issue = createMockIssue({ labels: ['priority:high', 'bug', 'frontend'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('rejects issues with no suitable labels', () => {
      const issue = createMockIssue({ labels: ['question', 'wontfix'] });
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('rejects issues with empty labels', () => {
      const issue = createMockIssue({ labels: [] });
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('rejects assigned issues', () => {
      const issue = createMockIssue({
        labels: ['good-first-issue'],
        assignee: 'some-user',
      });
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('rejects closed issues', () => {
      const issue = createMockIssue({
        labels: ['good-first-issue'],
        state: 'closed',
      });
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('rejects stale issues (> 30 days old)', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      const issue = createMockIssue({
        labels: ['good-first-issue'],
        updated_at: oldDate.toISOString(),
      });
      expect(discovery.isSuitableIssue(issue)).toBe(false);
    });

    it('accepts issues updated exactly 30 days ago', () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const issue = createMockIssue({
        labels: ['good-first-issue'],
        updated_at: thirtyDaysAgo.toISOString(),
      });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('accepts issues updated within 30 days', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 15);

      const issue = createMockIssue({
        labels: ['help-wanted'],
        updated_at: recentDate.toISOString(),
      });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });

    it('handles case-insensitive label matching', () => {
      const issue = createMockIssue({ labels: ['GOOD-FIRST-ISSUE'] });
      expect(discovery.isSuitableIssue(issue)).toBe(true);
    });
  });

  describe('filterSuitableIssues', () => {
    it('filters out unsuitable issues from array', () => {
      const issues = [
        createMockIssue({ number: 1, labels: ['good-first-issue'] }),
        createMockIssue({ number: 2, labels: ['question'] }),
        createMockIssue({ number: 3, labels: ['help-wanted'] }),
        createMockIssue({ number: 4, labels: ['bug'], assignee: 'user' }),
        createMockIssue({ number: 5, labels: ['enhancement'], state: 'closed' }),
      ];

      const suitable = discovery.filterSuitableIssues(issues);

      expect(suitable).toHaveLength(2);
      expect(suitable.map(i => i.number)).toEqual([1, 3]);
    });

    it('returns empty array when no suitable issues', () => {
      const issues = [
        createMockIssue({ number: 1, labels: ['question'] }),
        createMockIssue({ number: 2, labels: ['wontfix'] }),
      ];

      const suitable = discovery.filterSuitableIssues(issues);
      expect(suitable).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      const suitable = discovery.filterSuitableIssues([]);
      expect(suitable).toHaveLength(0);
    });

    it('returns all issues when all are suitable', () => {
      const issues = [
        createMockIssue({ number: 1, labels: ['good-first-issue'] }),
        createMockIssue({ number: 2, labels: ['bug'] }),
        createMockIssue({ number: 3, labels: ['help-wanted'] }),
      ];

      const suitable = discovery.filterSuitableIssues(issues);
      expect(suitable).toHaveLength(3);
    });
  });

  describe('SUITABLE_LABELS', () => {
    it('contains all expected labels', () => {
      const expectedLabels = [
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

      for (const label of expectedLabels) {
        expect(SUITABLE_LABELS).toContain(label);
      }
    });
  });

  describe('discoverFromRepo', () => {
    it('fetches and filters issues from a repo', async () => {
      // Create mock GitHub client
      const mockClient = {
        fetchIssues: vi.fn().mockResolvedValue([
          createMockIssue({ number: 1, labels: ['good-first-issue'] }),
          createMockIssue({ number: 2, labels: ['question'] }),
          createMockIssue({ number: 3, labels: ['bug'] }),
        ]),
      };

      const discoveryWithClient = new JobDiscovery(mockClient as any);
      const issues = await discoveryWithClient.discoverFromRepo('facebook', 'react');

      expect(mockClient.fetchIssues).toHaveBeenCalledWith('facebook', 'react', { state: 'open' });
      expect(issues).toHaveLength(2);
      expect(issues.map(i => i.number)).toEqual([1, 3]);
    });

    it('returns empty array when fetch fails', async () => {
      const mockClient = {
        fetchIssues: vi.fn().mockRejectedValue(new Error('API error')),
      };

      const discoveryWithClient = new JobDiscovery(mockClient as any);
      const issues = await discoveryWithClient.discoverFromRepo('facebook', 'react');

      expect(issues).toEqual([]);
    });
  });

  describe('discoverFromRepos', () => {
    it('fetches from multiple repos and combines results', async () => {
      const mockClient = {
        fetchIssues: vi.fn()
          .mockResolvedValueOnce([
            createMockIssue({ number: 1, labels: ['good-first-issue'], html_url: 'https://github.com/org/repo1/issues/1' }),
          ])
          .mockResolvedValueOnce([
            createMockIssue({ number: 2, labels: ['bug'], html_url: 'https://github.com/org/repo2/issues/2' }),
          ]),
      };

      const discoveryWithClient = new JobDiscovery(mockClient as any);
      const repos = [
        { owner: 'org', repo: 'repo1' },
        { owner: 'org', repo: 'repo2' },
      ];

      const issues = await discoveryWithClient.discoverFromRepos(repos);

      expect(mockClient.fetchIssues).toHaveBeenCalledTimes(2);
      expect(issues).toHaveLength(2);
    });

    it('handles partial failures gracefully', async () => {
      const mockClient = {
        fetchIssues: vi.fn()
          .mockResolvedValueOnce([
            createMockIssue({ number: 1, labels: ['good-first-issue'] }),
          ])
          .mockRejectedValueOnce(new Error('API error')),
      };

      const discoveryWithClient = new JobDiscovery(mockClient as any);
      const repos = [
        { owner: 'org', repo: 'repo1' },
        { owner: 'org', repo: 'repo2' },
      ];

      const issues = await discoveryWithClient.discoverFromRepos(repos);

      expect(issues).toHaveLength(1);
    });

    it('returns empty array for empty repos list', async () => {
      const mockClient = { fetchIssues: vi.fn() };
      const discoveryWithClient = new JobDiscovery(mockClient as any);

      const issues = await discoveryWithClient.discoverFromRepos([]);

      expect(mockClient.fetchIssues).not.toHaveBeenCalled();
      expect(issues).toEqual([]);
    });
  });

  describe('saveJobsToDatabase', () => {
    it('saves parsed jobs to database', () => {
      const mockDb = {
        run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }),
      };

      const discoveryWithDb = new JobDiscovery(undefined, mockDb as any);
      const issues = [
        createMockIssue({ number: 1, labels: ['good-first-issue'], title: 'Fix bug' }),
        createMockIssue({ number: 2, labels: ['bug'], title: 'Add feature' }),
      ];

      const savedCount = discoveryWithDb.saveJobsToDatabase(1, issues);

      expect(savedCount).toBe(2);
      expect(mockDb.run).toHaveBeenCalledTimes(2);
    });

    it('returns 0 for empty issues array', () => {
      const mockDb = { run: vi.fn() };
      const discoveryWithDb = new JobDiscovery(undefined, mockDb as any);

      const savedCount = discoveryWithDb.saveJobsToDatabase(1, []);

      expect(savedCount).toBe(0);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully', () => {
      const mockDb = {
        run: vi.fn().mockImplementation(() => {
          throw new Error('DB error');
        }),
      };

      const discoveryWithDb = new JobDiscovery(undefined, mockDb as any);
      const issues = [createMockIssue({ number: 1, labels: ['bug'] })];

      // Should not throw, but return 0
      const savedCount = discoveryWithDb.saveJobsToDatabase(1, issues);
      expect(savedCount).toBe(0);
    });
  });
});
