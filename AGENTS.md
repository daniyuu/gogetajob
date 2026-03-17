# AGENTS.md — For AI Agents Contributing to GoGetAJob

You're an AI agent. You want to contribute to this repo. Here's what you need to know.

## What Is This

GoGetAJob is a CLI toolkit for AI agents to find work on GitHub, do the work, submit PRs, and track results. It's a tool built by an agent, for agents.

## Before You Code

```bash
npm install
npm run build   # Must pass. Pre-commit hook enforces this.
```

Read the codebase before changing it. Key files:
- `src/cli/index.ts` — All CLI commands live here
- `src/backend/lib/job-service.ts` — Business logic (companies, jobs, work log)
- `src/backend/lib/github.ts` — `gh` CLI wrapper (all GitHub interactions go through here)
- `src/backend/lib/migrations.ts` — DB schema (SQLite)

## Rules

1. **Build must pass.** `npm run build` is enforced by pre-commit hook and CI. No exceptions.
2. **Don't break existing commands.** Users depend on `scan`, `feed`, `start`, `submit`, `sync`, `stats`. If you change their behavior, it's a breaking change.
3. **Use `gh` CLI for GitHub.** Don't import octokit or use raw HTTP. Everything goes through `src/backend/lib/github.ts`.
4. **SQLite is the truth.** All state lives in `data/gogetajob.db`. Don't add JSON state files.
5. **Commit messages matter.** Use conventional commits (`fix:`, `feat:`, `ci:`, `docs:`). Future agents read these.

## Architecture Decisions

- **Why `gh` CLI instead of API?** Because agents already have `gh` authenticated. No token management needed.
- **Why SQLite?** Single file, zero config, portable. An agent can carry their whole work history in one file.
- **Why no ORM?** `better-sqlite3` is fast, synchronous, and predictable. ORMs add abstraction we don't need.
- **Why Commander.js?** Standard CLI framework. Well-documented. Agents understand it.

## Common Pitfalls

- `gh` CLI sends errors to stderr. Use `stdio: ["pipe", "pipe", "pipe"]` to capture them.
- The CLI resolves `data/` relative to the package root (not `process.cwd()`). Respect `GOGETAJOB_DATA` env var.
- DB migrations run on every CLI invocation. Make them idempotent (`CREATE TABLE IF NOT EXISTS`).
- GitHub API has rate limits. Don't loop through hundreds of repos in one scan.

## Want to Add a Command?

1. Add it in `src/cli/index.ts` using Commander
2. Put business logic in `src/backend/lib/job-service.ts` (not in the CLI handler)
3. Format output through `src/cli/format.ts`
4. Build, test manually, commit

## Quality Levels (We're Growing)

Current: **Level 0** — Build passes
Next: Add smoke tests for core commands
Goal: Full test suite + lint + coverage
