import { describe, it, expect } from 'vitest';
import { JDParser, ParsedJob } from '../../../src/v3/core/jd-parser';
import { GitHubIssue } from '../../../src/v3/github/client';

function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 123,
    title: 'Test issue',
    body: 'Test body',
    labels: [],
    html_url: 'https://github.com/test/repo/issues/123',
    state: 'open',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    assignee: null,
    ...overrides,
  };
}

describe('JDParser', () => {
  const parser = new JDParser();

  describe('inferJobType', () => {
    it('detects bug_fix from labels', () => {
      expect(parser.inferJobType(createMockIssue({ labels: ['bug'] }))).toBe('bug_fix');
      expect(parser.inferJobType(createMockIssue({ labels: ['fix'] }))).toBe('bug_fix');
      expect(parser.inferJobType(createMockIssue({ labels: ['defect'] }))).toBe('bug_fix');
      expect(parser.inferJobType(createMockIssue({ labels: ['error'] }))).toBe('bug_fix');
      expect(parser.inferJobType(createMockIssue({ labels: ['crash'] }))).toBe('bug_fix');
    });

    it('detects bug_fix from title keywords', () => {
      expect(parser.inferJobType(createMockIssue({ title: 'Fix login button' }))).toBe('bug_fix');
      expect(parser.inferJobType(createMockIssue({ title: 'Bug: user cannot sign in' }))).toBe('bug_fix');
      expect(parser.inferJobType(createMockIssue({ title: 'Error when clicking submit' }))).toBe('bug_fix');
    });

    it('detects feature from labels', () => {
      expect(parser.inferJobType(createMockIssue({ labels: ['enhancement'] }))).toBe('feature');
      expect(parser.inferJobType(createMockIssue({ labels: ['feature'] }))).toBe('feature');
      expect(parser.inferJobType(createMockIssue({ labels: ['feature-request'] }))).toBe('feature');
      expect(parser.inferJobType(createMockIssue({ labels: ['improvement'] }))).toBe('feature');
    });

    it('detects docs from labels', () => {
      expect(parser.inferJobType(createMockIssue({ labels: ['documentation'] }))).toBe('docs');
      expect(parser.inferJobType(createMockIssue({ labels: ['docs'] }))).toBe('docs');
      expect(parser.inferJobType(createMockIssue({ labels: ['readme'] }))).toBe('docs');
    });

    it('detects test from labels', () => {
      expect(parser.inferJobType(createMockIssue({ labels: ['test'] }))).toBe('test');
      expect(parser.inferJobType(createMockIssue({ labels: ['testing'] }))).toBe('test');
      expect(parser.inferJobType(createMockIssue({ labels: ['coverage'] }))).toBe('test');
    });

    it('detects refactor from labels', () => {
      expect(parser.inferJobType(createMockIssue({ labels: ['refactor'] }))).toBe('refactor');
      expect(parser.inferJobType(createMockIssue({ labels: ['cleanup'] }))).toBe('refactor');
      expect(parser.inferJobType(createMockIssue({ labels: ['tech-debt'] }))).toBe('refactor');
    });

    it('returns other when no match', () => {
      expect(parser.inferJobType(createMockIssue({ labels: ['random-label'] }))).toBe('other');
      expect(parser.inferJobType(createMockIssue({ title: 'Some random title' }))).toBe('other');
    });
  });

  describe('inferDifficulty', () => {
    it('returns easy for good-first-issue label', () => {
      expect(parser.inferDifficulty(createMockIssue({ labels: ['good-first-issue'] }))).toBe('easy');
      expect(parser.inferDifficulty(createMockIssue({ labels: ['beginner'] }))).toBe('easy');
      expect(parser.inferDifficulty(createMockIssue({ labels: ['easy'] }))).toBe('easy');
      expect(parser.inferDifficulty(createMockIssue({ labels: ['starter'] }))).toBe('easy');
    });

    it('returns hard for long body (>1000 chars)', () => {
      const longBody = 'a'.repeat(1001);
      expect(parser.inferDifficulty(createMockIssue({ body: longBody }))).toBe('hard');
    });

    it('returns medium for medium-length body (200-1000 chars)', () => {
      const mediumBody = 'a'.repeat(500);
      expect(parser.inferDifficulty(createMockIssue({ body: mediumBody }))).toBe('medium');
    });

    it('returns easy for short body (<200 chars)', () => {
      const shortBody = 'a'.repeat(100);
      expect(parser.inferDifficulty(createMockIssue({ body: shortBody }))).toBe('easy');
    });

    it('returns unknown for null body', () => {
      expect(parser.inferDifficulty(createMockIssue({ body: null }))).toBe('unknown');
    });

    it('prioritizes labels over body length', () => {
      const longBody = 'a'.repeat(1001);
      expect(parser.inferDifficulty(createMockIssue({
        labels: ['good-first-issue'],
        body: longBody
      }))).toBe('easy');
    });
  });

  describe('estimateTokens', () => {
    it('returns 10k-30k for easy difficulty', () => {
      const tokens = parser.estimateTokens('easy');
      expect(tokens).toBeGreaterThanOrEqual(10000);
      expect(tokens).toBeLessThanOrEqual(30000);
    });

    it('returns 30k-80k for medium difficulty', () => {
      const tokens = parser.estimateTokens('medium');
      expect(tokens).toBeGreaterThanOrEqual(30000);
      expect(tokens).toBeLessThanOrEqual(80000);
    });

    it('returns 80k-200k for hard difficulty', () => {
      const tokens = parser.estimateTokens('hard');
      expect(tokens).toBeGreaterThanOrEqual(80000);
      expect(tokens).toBeLessThanOrEqual(200000);
    });

    it('returns medium range for unknown difficulty', () => {
      const tokens = parser.estimateTokens('unknown');
      expect(tokens).toBeGreaterThanOrEqual(30000);
      expect(tokens).toBeLessThanOrEqual(80000);
    });
  });

  describe('extractContextFiles', () => {
    it('extracts file paths from issue body', () => {
      const body = `
        Please look at src/components/Button.tsx
        Also check lib/utils.js and test/button.test.ts
      `;
      const files = parser.extractContextFiles(body);
      expect(files).toContain('src/components/Button.tsx');
      expect(files).toContain('lib/utils.js');
      expect(files).toContain('test/button.test.ts');
    });

    it('extracts paths in code blocks', () => {
      const body = '```\nsrc/index.ts\n```';
      const files = parser.extractContextFiles(body);
      expect(files).toContain('src/index.ts');
    });

    it('extracts paths with backticks', () => {
      const body = 'Check `src/main.rs` for the issue';
      const files = parser.extractContextFiles(body);
      expect(files).toContain('src/main.rs');
    });

    it('returns empty array for null body', () => {
      expect(parser.extractContextFiles(null)).toEqual([]);
    });

    it('returns empty array for body with no file paths', () => {
      expect(parser.extractContextFiles('Just some text here')).toEqual([]);
    });

    it('deduplicates file paths', () => {
      const body = 'src/app.ts mentioned twice: src/app.ts';
      const files = parser.extractContextFiles(body);
      expect(files.filter(f => f === 'src/app.ts')).toHaveLength(1);
    });
  });

  describe('detectBounty', () => {
    it('detects bounty from labels', () => {
      const result = parser.detectBounty(createMockIssue({ labels: ['$100', 'bounty'] }));
      expect(result.hasBounty).toBe(true);
      expect(result.amount).toBe(100);
      expect(result.currency).toBe('USD');
    });

    it('detects bounty from title', () => {
      const result = parser.detectBounty(createMockIssue({ title: 'Fix bug [$50 bounty]' }));
      expect(result.hasBounty).toBe(true);
      expect(result.amount).toBe(50);
      expect(result.currency).toBe('USD');
    });

    it('detects bounty from body', () => {
      const result = parser.detectBounty(createMockIssue({ body: 'Bounty: $200 for fixing this' }));
      expect(result.hasBounty).toBe(true);
      expect(result.amount).toBe(200);
      expect(result.currency).toBe('USD');
    });

    it('returns false for no bounty', () => {
      const result = parser.detectBounty(createMockIssue({ title: 'Just a normal issue' }));
      expect(result.hasBounty).toBe(false);
      expect(result.amount).toBeNull();
      expect(result.currency).toBeNull();
    });
  });

  describe('predictMergeProbability', () => {
    it('uses company merge rate as baseline', () => {
      // Use medium-length body to get 'medium' difficulty (no boost/penalty)
      const issue = createMockIssue({ body: 'a'.repeat(500) });
      const prob = parser.predictMergeProbability(issue, 0.5);
      expect(prob).toBeCloseTo(0.5, 1);
    });

    it('increases probability for easy issues', () => {
      const issue = createMockIssue({ labels: ['good-first-issue'] });
      const prob = parser.predictMergeProbability(issue, 0.5);
      expect(prob).toBeGreaterThan(0.5);
    });

    it('decreases probability for assigned issues', () => {
      const issue = createMockIssue({ assignee: 'someone' });
      const prob = parser.predictMergeProbability(issue, 0.5);
      expect(prob).toBeLessThan(0.5);
    });

    it('clamps probability between 0 and 1', () => {
      const easyIssue = createMockIssue({ labels: ['good-first-issue'] });
      const probHigh = parser.predictMergeProbability(easyIssue, 0.95);
      expect(probHigh).toBeLessThanOrEqual(1);

      const hardIssue = createMockIssue({ assignee: 'someone', body: 'a'.repeat(2000) });
      const probLow = parser.predictMergeProbability(hardIssue, 0.1);
      expect(probLow).toBeGreaterThanOrEqual(0);
    });
  });

  describe('parse', () => {
    it('returns complete ParsedJob object', () => {
      const issue = createMockIssue({
        number: 456,
        title: 'Fix login bug',
        body: 'Check src/auth.ts for the issue',
        labels: ['bug', 'good-first-issue'],
        html_url: 'https://github.com/test/repo/issues/456',
      });

      const result = parser.parse(issue, 0.7);

      expect(result.issue_number).toBe(456);
      expect(result.title).toBe('Fix login bug');
      expect(result.body).toBe('Check src/auth.ts for the issue');
      expect(result.labels).toEqual(['bug', 'good-first-issue']);
      expect(result.html_url).toBe('https://github.com/test/repo/issues/456');
      expect(result.job_type).toBe('bug_fix');
      expect(result.difficulty).toBe('easy');
      expect(result.estimated_tokens).toBeGreaterThanOrEqual(10000);
      expect(result.estimated_tokens).toBeLessThanOrEqual(30000);
      expect(result.context_files).toContain('src/auth.ts');
      expect(result.has_bounty).toBe(false);
      expect(result.merge_probability).toBeGreaterThan(0.7); // boosted for easy issue
    });

    it('handles issue with bounty', () => {
      const issue = createMockIssue({
        title: 'Implement feature [$100]',
        labels: ['enhancement'],
      });

      const result = parser.parse(issue, 0.5);

      expect(result.job_type).toBe('feature');
      expect(result.has_bounty).toBe(true);
      expect(result.bounty_amount).toBe(100);
      expect(result.bounty_currency).toBe('USD');
    });
  });
});
