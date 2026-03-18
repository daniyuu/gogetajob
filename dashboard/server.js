#!/usr/bin/env node
// gogetajob dashboard — lightweight status board for Luna
// Port 7100 | Reads from gogetajob SQLite only

const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = 7100;
const DB_PATH = path.join(__dirname, '..', 'data', 'gogetajob.db');
const HTML_PATH = path.join(__dirname, 'index.html');

function getDB() {
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

function queryData() {
  const db = getDB();
  try {
    // --- Overview ---
    const totalPRs = db.prepare(`SELECT COUNT(*) as c FROM work_log WHERE work_type = 'pr'`).get().c;
    const merged = db.prepare(`SELECT COUNT(*) as c FROM work_log WHERE LOWER(pr_status) = 'merged'`).get().c;
    const pending = db.prepare(`SELECT COUNT(*) as c FROM work_log WHERE LOWER(pr_status) = 'open' OR (pr_status IS NULL AND status IN ('taken','submitted'))`).get().c;
    const closed = db.prepare(`SELECT COUNT(*) as c FROM work_log WHERE LOWER(pr_status) = 'closed'`).get().c;
    const dropped = db.prepare(`SELECT COUNT(*) as c FROM work_log WHERE status = 'dropped'`).get().c;
    const totalTokens = db.prepare(`SELECT COALESCE(SUM(tokens_used),0) as t FROM work_log`).get().t;
    const mergeRate = totalPRs > 0 ? (merged / totalPRs * 100).toFixed(1) : '0.0';
    const tokensPerMerge = merged > 0 ? Math.round(totalTokens / merged) : 0;

    const overview = { totalPRs, merged, pending, closed, dropped, totalTokens, mergeRate, tokensPerMerge };

    // --- PR Board ---
    const prs = db.prepare(`
      SELECT w.id, w.pr_number, w.pr_url, w.pr_status, w.status, w.tokens_used,
             w.taken_at, w.completed_at, w.notes,
             j.issue_number, j.title, j.url as issue_url,
             c.full_name as repo
      FROM work_log w
      LEFT JOIN jobs j ON w.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      ORDER BY
        CASE
          WHEN w.status IN ('taken','submitted') THEN 0
          ELSE 1
        END,
        w.taken_at DESC
    `).all();

    // --- Companies ---
    const companies = db.prepare(`
      SELECT c.id, c.full_name, c.stars, c.open_issues, c.pr_merge_rate, c.language,
        (SELECT COUNT(*) FROM work_log w JOIN jobs j ON w.job_id=j.id WHERE j.company_id=c.id) as our_prs,
        (SELECT COUNT(*) FROM work_log w JOIN jobs j ON w.job_id=j.id WHERE j.company_id=c.id AND LOWER(w.pr_status)='merged') as our_merged,
        (SELECT COALESCE(SUM(w.tokens_used),0) FROM work_log w JOIN jobs j ON w.job_id=j.id WHERE j.company_id=c.id) as tokens_spent
      FROM companies c
      ORDER BY our_prs DESC
    `).all();

    // --- Daily Activity (last 14 days) ---
    const daily = db.prepare(`
      SELECT date(taken_at) as day, COUNT(*) as count
      FROM work_log
      WHERE taken_at >= date('now','-14 days')
      GROUP BY day ORDER BY day
    `).all();

    // --- Tokens today ---
    const tokensToday = db.prepare(`
      SELECT COALESCE(SUM(tokens_used),0) as t FROM work_log
      WHERE date(taken_at) = date('now')
    `).get().t;

    // --- Tokens per company ---
    const tokensByCompany = db.prepare(`
      SELECT c.full_name as repo, COALESCE(SUM(w.tokens_used),0) as tokens
      FROM work_log w
      JOIN jobs j ON w.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      GROUP BY c.id
      ORDER BY tokens DESC
    `).all();

    return { overview, prs, companies, daily, tokensToday, tokensByCompany };
  } finally {
    db.close();
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try {
      res.end(JSON.stringify(queryData()));
    } catch (e) {
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    // Serve index.html for everything else
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500);
      res.end('Failed to load dashboard: ' + e.message);
    }
  }
});

server.listen(PORT, () => {
  console.log(`🚀 gogetajob dashboard running at http://localhost:${PORT}`);
});
