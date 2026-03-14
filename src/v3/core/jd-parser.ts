// JD parser service
import { GitHubIssue } from '../github/client';
import { JobType, Difficulty } from '../db/schema';

export interface BountyInfo {
  hasBounty: boolean;
  amount: number | null;
  currency: string | null;
}

export interface ParsedJob {
  issue_number: number;
  title: string;
  body: string;
  labels: string[];
  html_url: string;
  job_type: JobType;
  difficulty: Difficulty;
  estimated_tokens: number;
  context_files: string[];
  has_bounty: boolean;
  bounty_amount: number | null;
  bounty_currency: string | null;
  merge_probability: number;
}

// Label detection patterns
const LABEL_PATTERNS: Record<JobType, string[]> = {
  bug_fix: ['bug', 'fix', 'defect', 'error', 'crash'],
  feature: ['enhancement', 'feature', 'feature-request', 'improvement'],
  docs: ['documentation', 'docs', 'readme'],
  test: ['test', 'testing', 'coverage'],
  refactor: ['refactor', 'cleanup', 'tech-debt'],
  other: [],
};

const EASY_LABELS = ['good-first-issue', 'beginner', 'easy', 'starter'];

// Title keywords for job type detection
const TITLE_PATTERNS: Record<string, JobType> = {
  'fix': 'bug_fix',
  'bug': 'bug_fix',
  'error': 'bug_fix',
  'crash': 'bug_fix',
};

// Token estimation ranges per difficulty
const TOKEN_RANGES: Record<Difficulty, [number, number]> = {
  easy: [10000, 30000],
  medium: [30000, 80000],
  hard: [80000, 200000],
  unknown: [30000, 80000],
};

// File path regex patterns
const FILE_PATH_PATTERNS = [
  // Standard file paths with extensions
  /(?:^|\s|`|['"])([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})(?:\s|$|`|['"])/g,
  // Paths starting with common directories
  /(?:^|\s|`|['"])((?:src|lib|test|tests|app|components|utils|packages|modules|bin|cmd|internal|pkg)\/[a-zA-Z0-9_\-./]+)(?:\s|$|`|['"])/g,
];

// Bounty detection patterns
const BOUNTY_PATTERNS = [
  /\$(\d+)/,
  /(\d+)\s*(?:USD|usd|\$)/,
  /bounty[:\s]*\$?(\d+)/i,
];

export class JDParser {
  /**
   * Infer job type from issue labels and title
   */
  inferJobType(issue: GitHubIssue): JobType {
    const labelsLower = issue.labels.map(l => l.toLowerCase());

    // Check labels first (higher priority)
    for (const [jobType, patterns] of Object.entries(LABEL_PATTERNS)) {
      if (jobType === 'other') continue;
      for (const pattern of patterns) {
        if (labelsLower.some(label => label.includes(pattern))) {
          return jobType as JobType;
        }
      }
    }

    // Check title keywords
    const titleLower = issue.title.toLowerCase();
    for (const [keyword, jobType] of Object.entries(TITLE_PATTERNS)) {
      if (titleLower.includes(keyword)) {
        return jobType;
      }
    }

    return 'other';
  }

  /**
   * Infer difficulty based on labels and body length
   */
  inferDifficulty(issue: GitHubIssue): Difficulty {
    const labelsLower = issue.labels.map(l => l.toLowerCase());

    // Check for easy labels first (takes priority)
    for (const easyLabel of EASY_LABELS) {
      if (labelsLower.some(label => label.includes(easyLabel))) {
        return 'easy';
      }
    }

    // Infer from body length
    if (issue.body === null) {
      return 'unknown';
    }

    const bodyLength = issue.body.length;
    if (bodyLength > 1000) {
      return 'hard';
    } else if (bodyLength >= 200) {
      return 'medium';
    } else {
      return 'easy';
    }
  }

  /**
   * Estimate token cost based on difficulty
   * Returns a value within the range for the given difficulty
   */
  estimateTokens(difficulty: Difficulty): number {
    const [min, max] = TOKEN_RANGES[difficulty];
    // Return midpoint of range for consistency
    return Math.floor((min + max) / 2);
  }

  /**
   * Extract file paths mentioned in issue body
   */
  extractContextFiles(body: string | null): string[] {
    if (!body) return [];

    const files = new Set<string>();

    for (const pattern of FILE_PATH_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(body)) !== null) {
        const filePath = match[1].trim();
        // Filter out likely false positives
        if (this.isLikelyFilePath(filePath)) {
          files.add(filePath);
        }
      }
    }

    return Array.from(files);
  }

  /**
   * Check if a string is likely a valid file path
   */
  private isLikelyFilePath(path: string): boolean {
    // Must have at least one slash or dot
    if (!path.includes('/') && !path.includes('.')) return false;

    // Common file extensions
    const validExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.rb', '.go', '.rs', '.java', '.kt',
      '.c', '.cpp', '.h', '.hpp', '.cs',
      '.json', '.yaml', '.yml', '.toml', '.xml',
      '.md', '.txt', '.html', '.css', '.scss',
      '.sh', '.bash', '.zsh', '.fish',
      '.sql', '.graphql', '.proto',
    ];

    const ext = path.substring(path.lastIndexOf('.'));
    if (validExtensions.includes(ext.toLowerCase())) return true;

    // Paths with directory structure
    if (path.includes('/') && !path.startsWith('http')) return true;

    return false;
  }

  /**
   * Detect bounty information from issue
   */
  detectBounty(issue: GitHubIssue): BountyInfo {
    const textToSearch = [
      issue.title,
      issue.body || '',
      ...issue.labels,
    ].join(' ');

    for (const pattern of BOUNTY_PATTERNS) {
      const match = textToSearch.match(pattern);
      if (match && match[1]) {
        const amount = parseInt(match[1], 10);
        if (amount > 0) {
          return {
            hasBounty: true,
            amount,
            currency: 'USD',
          };
        }
      }
    }

    return {
      hasBounty: false,
      amount: null,
      currency: null,
    };
  }

  /**
   * Predict merge probability based on issue characteristics
   */
  predictMergeProbability(issue: GitHubIssue, companyMergeRate: number): number {
    let probability = companyMergeRate;

    // Boost for easy issues
    const difficulty = this.inferDifficulty(issue);
    if (difficulty === 'easy') {
      probability += 0.1;
    } else if (difficulty === 'hard') {
      probability -= 0.1;
    }

    // Penalty for assigned issues (someone is already working on it)
    if (issue.assignee) {
      probability -= 0.2;
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, probability));
  }

  /**
   * Parse a GitHub issue into a structured job posting
   */
  parse(issue: GitHubIssue, companyMergeRate: number): ParsedJob {
    const jobType = this.inferJobType(issue);
    const difficulty = this.inferDifficulty(issue);
    const bounty = this.detectBounty(issue);

    return {
      issue_number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels,
      html_url: issue.html_url,
      job_type: jobType,
      difficulty: difficulty,
      estimated_tokens: this.estimateTokens(difficulty),
      context_files: this.extractContextFiles(issue.body),
      has_bounty: bounty.hasBounty,
      bounty_amount: bounty.amount,
      bounty_currency: bounty.currency,
      merge_probability: this.predictMergeProbability(issue, companyMergeRate),
    };
  }
}
