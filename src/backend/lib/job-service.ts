import Database from "better-sqlite3";

export interface CompanyProfile {
  id: number;
  owner: string;
  repo: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  pr_merge_rate: number | null;
  avg_response_hours: number | null;
  has_contributing_guide: boolean;
  has_cla: boolean;
  last_commit_at: string | null;
  last_scanned_at: string | null;
}

export interface Job {
  id: number;
  company_id: number;
  issue_number: number;
  title: string;
  body: string | null;
  labels: string[];
  job_type: string;
  difficulty: string;
  has_bounty: boolean;
  bounty_amount: string | null;
  url: string;
  state: string;
  company_name?: string;
  company_language?: string;
}

export interface WorkEntry {
  id: number;
  job_id: number;
  status: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
  tokens_used: number | null;
  notes: string | null;
  taken_at: string;
  completed_at: string | null;
  job_title?: string;
  company_name?: string;
  issue_number?: number;
}

export class JobService {
  constructor(private db: Database.Database) {}

  // --- Companies ---

  upsertCompany(data: {
    owner: string;
    repo: string;
    description?: string;
    language?: string;
    stars?: number;
    forks?: number;
    open_issues?: number;
    pr_merge_rate?: number;
    avg_response_hours?: number;
    has_contributing_guide?: boolean;
    has_cla?: boolean;
    last_commit_at?: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO companies (owner, repo, full_name, description, language, stars, forks, open_issues,
        pr_merge_rate, avg_response_hours, has_contributing_guide, has_cla, last_commit_at, last_scanned_at)
      VALUES ($owner, $repo, $full_name, $description, $language, $stars, $forks, $open_issues,
        $pr_merge_rate, $avg_response_hours, $has_contributing_guide, $has_cla, $last_commit_at, datetime('now'))
      ON CONFLICT(owner, repo) DO UPDATE SET
        description = COALESCE($description, description),
        language = COALESCE($language, language),
        stars = COALESCE($stars, stars),
        forks = COALESCE($forks, forks),
        open_issues = COALESCE($open_issues, open_issues),
        pr_merge_rate = COALESCE($pr_merge_rate, pr_merge_rate),
        avg_response_hours = COALESCE($avg_response_hours, avg_response_hours),
        has_contributing_guide = COALESCE($has_contributing_guide, has_contributing_guide),
        has_cla = COALESCE($has_cla, has_cla),
        last_commit_at = COALESCE($last_commit_at, last_commit_at),
        last_scanned_at = datetime('now')
    `);
    const params = {
      owner: data.owner,
      repo: data.repo,
      full_name: `${data.owner}/${data.repo}`,
      description: data.description ?? null,
      language: data.language ?? null,
      stars: data.stars ?? 0,
      forks: data.forks ?? 0,
      open_issues: data.open_issues ?? 0,
      pr_merge_rate: data.pr_merge_rate ?? null,
      avg_response_hours: data.avg_response_hours ?? null,
      has_contributing_guide: data.has_contributing_guide ? 1 : 0,
      has_cla: data.has_cla ? 1 : 0,
      last_commit_at: data.last_commit_at ?? null,
    };
    const result = stmt.run(params);
    if (result.changes > 0 && result.lastInsertRowid) {
      return Number(result.lastInsertRowid);
    }
    const row = this.db.prepare("SELECT id FROM companies WHERE owner = $owner AND repo = $repo").get({
      owner: data.owner, repo: data.repo
    }) as { id: number } | undefined;
    return row?.id ?? 0;
  }

  getCompany(owner: string, repo: string): CompanyProfile | null {
    const row = this.db.prepare("SELECT * FROM companies WHERE owner = $owner AND repo = $repo").get({
      owner, repo
    }) as any;
    if (!row) return null;
    return { ...row, has_contributing_guide: !!row.has_contributing_guide, has_cla: !!row.has_cla };
  }

  listCompanies(sort: string = "stars"): CompanyProfile[] {
    const validSorts: Record<string, string> = {
      "merge-rate": "pr_merge_rate DESC NULLS LAST",
      "activity": "last_commit_at DESC NULLS LAST",
      "stars": "stars DESC",
    };
    const orderBy = validSorts[sort] || "stars DESC";
    return (this.db.prepare(`SELECT * FROM companies ORDER BY ${orderBy}`).all() as any[]).map(r => ({
      ...r, has_contributing_guide: !!r.has_contributing_guide, has_cla: !!r.has_cla,
    }));
  }

  // --- Jobs ---

  upsertJob(companyId: number, data: {
    issue_number: number;
    title: string;
    body?: string;
    labels?: string[];
    job_type?: string;
    difficulty?: string;
    has_bounty?: boolean;
    bounty_amount?: string;
    url?: string;
    state?: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (company_id, issue_number, title, body, labels, job_type, difficulty, has_bounty, bounty_amount, url, state)
      VALUES ($company_id, $issue_number, $title, $body, $labels, $job_type, $difficulty, $has_bounty, $bounty_amount, $url, $state)
      ON CONFLICT(company_id, issue_number) DO UPDATE SET
        title = $title,
        body = COALESCE($body, body),
        labels = COALESCE($labels, labels),
        job_type = COALESCE($job_type, job_type),
        state = COALESCE($state, state)
    `);
    const params = {
      company_id: companyId,
      issue_number: data.issue_number,
      title: data.title,
      body: data.body ?? null,
      labels: JSON.stringify(data.labels ?? []),
      job_type: data.job_type ?? "unknown",
      difficulty: data.difficulty ?? "unknown",
      has_bounty: data.has_bounty ? 1 : 0,
      bounty_amount: data.bounty_amount ?? null,
      url: data.url ?? null,
      state: data.state ?? "open",
    };
    const result = stmt.run(params);
    if (result.changes > 0 && result.lastInsertRowid) {
      return Number(result.lastInsertRowid);
    }
    const row = this.db.prepare(
      "SELECT id FROM jobs WHERE company_id = $company_id AND issue_number = $issue_number"
    ).get({ company_id: companyId, issue_number: data.issue_number }) as { id: number } | undefined;
    return row?.id ?? 0;
  }

  listJobs(filters: { lang?: string; type?: string; limit?: number } = {}): Job[] {
    const conditions: string[] = ["j.state = 'open'"];
    const params: Record<string, any> = {};

    if (filters.lang) {
      conditions.push("LOWER(c.language) = LOWER($lang)");
      params.lang = filters.lang;
    }
    if (filters.type) {
      conditions.push("j.job_type = $type");
      params.type = filters.type;
    }

    params.limit = filters.limit ?? 20;
    const where = conditions.join(" AND ");

    const rows = this.db.prepare(`
      SELECT j.*, c.full_name as company_name, c.language as company_language
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE ${where}
      ORDER BY j.discovered_at DESC
      LIMIT $limit
    `).all(params) as any[];

    return rows.map(r => ({
      ...r,
      labels: JSON.parse(r.labels || "[]"),
      has_bounty: !!r.has_bounty,
    }));
  }

  getJob(owner: string, repo: string, issueNumber: number): Job | null {
    const row = this.db.prepare(`
      SELECT j.*, c.full_name as company_name, c.language as company_language
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE c.owner = $owner AND c.repo = $repo AND j.issue_number = $issue_number
    `).get({ owner, repo, issue_number: issueNumber }) as any;
    if (!row) return null;
    return { ...row, labels: JSON.parse(row.labels || "[]"), has_bounty: !!row.has_bounty };
  }

  // --- Work Log ---

  takeJob(jobId: number): number {
    const existing = this.db.prepare(
      "SELECT id FROM work_log WHERE job_id = $job_id AND status IN ('taken', 'in_progress')"
    ).get({ job_id: jobId });
    if (existing) throw new Error("Already working on this job");

    const result = this.db.prepare(
      "INSERT INTO work_log (job_id, status) VALUES ($job_id, 'taken')"
    ).run({ job_id: jobId });
    return Number(result.lastInsertRowid);
  }

  completeJob(jobId: number, data: {
    pr_number?: number;
    pr_url?: string;
    tokens_used?: number;
    notes?: string;
  }): void {
    const entry = this.db.prepare(
      "SELECT id FROM work_log WHERE job_id = $job_id AND status IN ('taken', 'in_progress') ORDER BY taken_at DESC LIMIT 1"
    ).get({ job_id: jobId }) as { id: number } | undefined;
    if (!entry) throw new Error("No active work entry for this job");

    this.db.prepare(`
      UPDATE work_log SET
        status = 'done',
        pr_number = COALESCE($pr_number, pr_number),
        pr_url = COALESCE($pr_url, pr_url),
        tokens_used = COALESCE($tokens_used, tokens_used),
        notes = COALESCE($notes, notes),
        completed_at = datetime('now')
      WHERE id = $id
    `).run({
      pr_number: data.pr_number ?? null,
      pr_url: data.pr_url ?? null,
      tokens_used: data.tokens_used ?? null,
      notes: data.notes ?? null,
      id: entry.id,
    });
  }

  dropJob(jobId: number): void {
    const entry = this.db.prepare(
      "SELECT id FROM work_log WHERE job_id = $job_id AND status IN ('taken', 'in_progress') ORDER BY taken_at DESC LIMIT 1"
    ).get({ job_id: jobId }) as { id: number } | undefined;
    if (!entry) throw new Error("No active work entry for this job");

    this.db.prepare(
      "UPDATE work_log SET status = 'dropped', completed_at = datetime('now') WHERE id = $id"
    ).run({ id: entry.id });
  }

  listWorkHistory(filters: { repo?: string; status?: string } = {}): WorkEntry[] {
    const conditions: string[] = ["1=1"];
    const params: Record<string, any> = {};

    if (filters.status) {
      conditions.push("w.status = $status");
      params.status = filters.status;
    }
    if (filters.repo) {
      conditions.push("c.full_name = $repo");
      params.repo = filters.repo;
    }

    const where = conditions.join(" AND ");
    return this.db.prepare(`
      SELECT w.*, j.title as job_title, j.issue_number, c.full_name as company_name
      FROM work_log w
      JOIN jobs j ON w.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE ${where}
      ORDER BY w.taken_at DESC
    `).all(params) as WorkEntry[];
  }

  getStats(): { total_jobs: number; taken: number; done: number; dropped: number; total_tokens: number } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'taken' OR status = 'in_progress' THEN 1 ELSE 0 END) as taken,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) as dropped,
        COALESCE(SUM(tokens_used), 0) as total_tokens
      FROM work_log
    `).get() as any;
    return stats;
  }
}
