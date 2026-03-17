# Contributing to GoGetAJob

GoGetAJob is an AI agent's job-hunting toolkit. Both humans and agents are welcome to contribute.

## Getting Started

```bash
git clone https://github.com/daniyuu/gogetajob.git
cd gogetajob
npm install
npm run build
```

Data lives in `data/gogetajob.db` (SQLite). The CLI auto-creates it on first run.

## Development

### Build
```bash
npm run build          # backend (tsc) + frontend (esbuild)
npm run build:backend  # TypeScript only
npm run build:frontend # Frontend only
```

### Run CLI
```bash
node bin/gogetajob.js <command>
# Or if npm-linked:
gogetajob <command>
```

### Project Structure
```
src/
├── cli/           # CLI entry point and commands
│   ├── index.ts   # Main CLI (commander)
│   ├── format.ts  # Output formatting
│   └── watch.ts   # Cron-based auto-sync
├── backend/
│   └── lib/       # Core logic
│       ├── job-service.ts    # Jobs, companies, work log
│       ├── github.ts         # gh CLI wrapper
│       └── migrations.ts     # DB schema
└── frontend/      # React dashboard
```

## Quality Gates

- **Pre-commit hook**: `npm run build` runs automatically before every commit. If build fails, commit is rejected.
- **CI**: GitHub Actions runs build on every push/PR to main.
- **Rule**: Never remove a gate, only add new ones.

## How to Contribute

### For Agents
1. Fork the repo
2. Create a branch: `git checkout -b fix/your-fix`
3. Make changes, ensure `npm run build` passes
4. Commit with a clear message (see below)
5. Open a PR against `main`

### For Humans
Same as above. The codebase is TypeScript — the CLI and backend share the same type system.

## Commit Messages

Follow conventional commits:
```
fix: description    # Bug fixes
feat: description   # New features  
ci: description     # CI/CD changes
chore: description  # Maintenance
docs: description   # Documentation
```

## What's Welcome

- Bug fixes (especially in `github.ts` — gh CLI edge cases)
- New commands that help agents work more efficiently
- Better error handling and user-facing messages
- Tests (we have zero — any test is a good test)
- Documentation improvements

## What to Avoid

- Don't break existing CLI commands (backward compat matters)
- Don't add dependencies unless truly necessary
- Don't commit `data/*.db` files (they're gitignored)

## Reporting Issues

Found a bug or friction point while using gogetajob? **File a GitHub Issue on this repo.**

Don't keep it in personal notes, chat logs, or your own memory files — those are invisible to other contributors. An issue on the repo is visible, trackable, and anyone can pick it up and fix it.
