# Feature: Self-Organizing Multi-Agent Task System

**Owner:** Luna Chen
**Created:** 2026-03-13
**Status:** Design Approved
**Branch:** feature/self-organizing-agents

---

## Design Draft

### Vision

Transform GoGetAJob from a simple "issue-fixing bot" into a **self-organizing AI contribution system** where autonomous agents explore repositories, discover opportunities, decompose work into tasks, and collaboratively execute them using ralph-loop persistence.

### Core Concept

**Current Model:**
```
Buy Position → Worker finds issue → Open window → Process issue → Repeat
```

**New Model:**
```
Buy Position → Create initial task → Agent explores repo →
Agent creates sub-tasks → Multiple agents work in parallel →
Each agent uses ralph-loop until completion
```

### Key Insight

**"Exploration is just another task"**

There's no special "exploration phase". When an agent receives the task "contribute to this repo", it autonomously decides:
- Should I explore first?
- What are the opportunities?
- Should I create sub-tasks?
- Can I start implementing directly?

The agent's behavior is determined by its **available skills** (crew, ralph-loop, etc.).

---

## Architecture

### Components

**1. Position**
- Represents investment in a repository
- Has configuration: `maxTasksPerPosition` (default: 1 for serial execution)

**2. Task**
- A unit of work stored in database
- Has: description, status, worktree_path, completion_promise
- Can create child tasks during execution

**3. Agent**
- A Claude CLI process running with ralph-loop
- Works in an isolated git worktree
- Has skills that determine its capabilities

**4. Worker (Task Scheduler)**
- Reads pending tasks from DB
- Assigns tasks to agents
- Manages worktrees
- Monitors completion

### Data Model

```sql
-- New table
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'working', 'completed', 'failed')) DEFAULT 'pending',
  worktree_path TEXT,
  completion_promise TEXT DEFAULT 'TASK_COMPLETE',
  created_by_task_id INTEGER,  -- Which task created this task (NULL for root task)
  assigned_agent_id TEXT,       -- Session ID of the agent working on this
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_task_id) REFERENCES tasks(id)
);

-- Modified positions table
ALTER TABLE positions ADD COLUMN max_parallel_tasks INTEGER DEFAULT 1;
```

### Execution Flow

**Phase 1: Position Creation**
```
User buys position for "daniyuu/gogetajob"
    ↓
System creates root task:
  - Task-1: "Contribute to this repository"
  - status: 'pending'
  - position_id: X
```

**Phase 2: Task Scheduling**
```
Worker polls for pending tasks
    ↓
Finds Task-1
    ↓
Checks position's max_parallel_tasks
    ↓
If slots available:
  1. Clone repo to workspaces/project-X/main-repo/
  2. Create worktree: git worktree add task-1-contribute
  3. Generate prompt file
  4. Open CMD window
  5. Execute: claude --ralph-loop "$(cat prompt.txt)"
  6. Update task status='working'
```

**Phase 3: Agent Execution**
```
Agent receives prompt in task-1 worktree
    ↓
Agent (with crew skills) decides approach:
  - Calls /codebase-research to explore
  - Calls /brainstorming to plan
  - Discovers opportunities
    ↓
Agent creates sub-tasks:
  - Executes: node -e "db.prepare('INSERT INTO tasks...').run(...)"
  - Or writes: tasks.json with sub-task list
    ↓
Agent works on initial contribution
    ↓
Agent outputs: <promise>TASK_COMPLETE</promise>
    ↓
Worker detects completion, updates task status='completed'
```

**Phase 4: Continuous Execution**
```
Worker polls again
    ↓
Finds Task-2, Task-3 (created by Task-1)
    ↓
Based on max_parallel_tasks:
  - If 1: Process tasks serially
  - If 3: Open 3 windows simultaneously
    ↓
Each agent works independently in its worktree
    ↓
Loop until all tasks completed
```

### Git Worktree Structure

```
workspaces/project-3/
├── main-repo/                 # Main git directory (shared .git)
├── task-1-contribute/         # Root task worktree
├── task-2-fix-issue-15/       # Sub-task worktrees
├── task-3-add-tests/
└── task-4-optimize-perf/
```

**Benefits:**
- Shared .git saves disk space
- Each task has isolated working tree
- Supports parallel execution
- Easy cleanup: just delete worktree

---

## Key Design Decisions

### 1. Task Communication

**Decision:** File-based + Direct DB

Agents can:
- Write `tasks.json` with new tasks (Worker reads and imports)
- Or directly execute SQL via bash: `node -e "db.prepare('INSERT...').run(...)"`

**Rationale:**
- Simple and reliable
- No need for API server
- Claude can easily generate both formats

### 2. Task Completion Detection

**Decision:** Completion Promise + Timeout

Each task has a `completion_promise` field (default: "TASK_COMPLETE").

Worker monitors:
- Output scanning for promise string
- Git commits (at least one commit means work done)
- Timeout (configurable, default: 30 minutes)

**Rationale:**
- Ralph-loop already uses completion promises
- Flexible enough for different task types
- Timeout prevents infinite loops

### 3. Parallel Execution

**Decision:** Configurable via `max_parallel_tasks`

- Default: 1 (serial execution, safe and simple)
- Can increase to 3-5 for faster execution
- Limited by system resources and API rate limits

**Rationale:**
- Serial mode is safer (no git conflicts)
- Power users can enable parallel mode
- Position-level configuration allows per-repo tuning

### 4. Agent Skills

**Decision:** Use existing Claude Code skills

Agents inherit skills from:
- Global `~/.claude/settings.json` (enabledPlugins)
- Project `.claude/settings.local.json`

Current skills:
- `crew@crew-dev` - brainstorming, research, planning
- `ralph-loop@claude-plugins-official` - persistent iteration
- `codeblend@spark-claude-plugins` - smart commits

**Rationale:**
- No need to invent new skill system
- Leverage existing Claude Code ecosystem
- Skills determine agent capabilities naturally

### 5. Root Task Prompt

**Decision:** Minimal, open-ended prompt

```
Contribute to this repository: {repo_name}

You have full autonomy to:
- Explore the codebase
- Identify opportunities (fix bugs, add features, improve docs)
- Create sub-tasks if needed (insert into tasks table)
- Implement changes
- Run tests and iterate

When you complete meaningful work, output: <promise>TASK_COMPLETE</promise>
```

**Rationale:**
- Gives agent maximum autonomy
- Agent uses its skills to decide approach
- Natural emergence of exploration → planning → execution
- No hardcoded "must fix issues" constraint

---

## Breakdown

### Milestones

- [ ] Milestone 1: Database schema and task model
- [ ] Milestone 2: TaskScheduler with worktree management
- [ ] Milestone 3: Agent spawning with ralph-loop
- [ ] Milestone 4: Task completion detection and communication
- [ ] Milestone 5: Integration and UI updates
- [ ] Milestone 6: Testing and dogfooding

---

### Task 1: Add tasks table to database

**Files:**
- Modify: `src/backend/lib/migrations.ts`

**Step 1: Add tasks table migration**

Add after the notifications table creation:

```typescript
// Create tasks table
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'working', 'completed', 'failed', 'blocked')) DEFAULT 'pending',
    worktree_path TEXT,
    completion_promise TEXT DEFAULT 'TASK_COMPLETE',
    created_by_task_id INTEGER,
    assigned_agent_session_id TEXT,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_task_id) REFERENCES tasks(id)
  )
`);

// Create index for task queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tasks_position_status
  ON tasks(position_id, status)
`);
```

**Step 2: Add max_parallel_tasks to positions**

Add after positions table creation:

```typescript
// Add max_parallel_tasks column if not exists
db.exec(`
  ALTER TABLE positions ADD COLUMN max_parallel_tasks INTEGER DEFAULT 1
`).catch(() => {
  // Column might already exist
});
```

**Step 3: Test migration**

Run: `npx ts-node src/backend/server.ts`
Expected: Should see "✅ Database migrations completed" without errors

**Step 4: Verify schema**

Run:
```bash
node -e "const db = require('better-sqlite3')('data/gogetajob.db'); console.log(db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get('tasks'));"
```
Expected: Shows tasks table schema

**Step 5: Commit**

Use `/codeblend-commit`

---

### Task 2: Create TaskScheduler class

**Files:**
- Create: `src/backend/lib/task-scheduler.ts`

**Step 1: Create TaskScheduler skeleton**

```typescript
import { db } from './database';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface Task {
  id: number;
  position_id: number;
  description: string;
  status: string;
  worktree_path: string | null;
  completion_promise: string;
  created_by_task_id: number | null;
}

interface AgentSession {
  taskId: number;
  sessionId: string;
  process: ChildProcess;
  worktreePath: string;
  startedAt: Date;
}

export class TaskScheduler {
  private activeSessions: Map<number, AgentSession> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;

  constructor() {}

  /**
   * Start the task scheduler
   */
  start(): void {
    console.log('[TaskScheduler] Starting...');

    // Poll for pending tasks every 10 seconds
    this.pollInterval = setInterval(() => {
      this.pollAndSchedule().catch(error => {
        console.error('[TaskScheduler] Error polling:', error);
      });
    }, 10000);

    // Initial poll
    this.pollAndSchedule().catch(error => {
      console.error('[TaskScheduler] Error in initial poll:', error);
    });

    console.log('[TaskScheduler] Started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Stop all active agents
    for (const session of this.activeSessions.values()) {
      if (session.process && !session.process.killed) {
        session.process.kill('SIGTERM');
      }
    }

    this.activeSessions.clear();
    console.log('[TaskScheduler] Stopped');
  }

  /**
   * Poll for pending tasks and schedule them
   */
  private async pollAndSchedule(): Promise<void> {
    // TODO: Implement in next step
  }
}
```

**Step 2: Commit skeleton**

Use `/codeblend-commit`

---

### Task 3: Implement task polling logic

**Files:**
- Modify: `src/backend/lib/task-scheduler.ts`

**Step 1: Implement pollAndSchedule method**

Replace the TODO with:

```typescript
private async pollAndSchedule(): Promise<void> {
  // Get all positions with pending tasks
  const positionsWithTasks = db.prepare(`
    SELECT DISTINCT p.id, p.max_parallel_tasks
    FROM positions p
    JOIN tasks t ON t.position_id = p.id
    WHERE p.status IN ('working', 'buying')
      AND t.status = 'pending'
  `).all() as Array<{ id: number; max_parallel_tasks: number }>;

  for (const position of positionsWithTasks) {
    // Count currently working tasks for this position
    const workingCount = Array.from(this.activeSessions.values())
      .filter(s => {
        const task = this.getTask(s.taskId);
        return task?.position_id === position.id;
      }).length;

    // Calculate available slots
    const availableSlots = position.max_parallel_tasks - workingCount;

    if (availableSlots > 0) {
      // Get pending tasks for this position
      const pendingTasks = db.prepare(`
        SELECT * FROM tasks
        WHERE position_id = ?
          AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT ?
      `).all(position.id, availableSlots) as Task[];

      // Schedule each pending task
      for (const task of pendingTasks) {
        await this.scheduleTask(task);
      }
    }
  }
}

/**
 * Get task by ID
 */
private getTask(taskId: number): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
}
```

**Step 2: Test polling logic**

Run: `npx ts-node src/backend/server.ts`
Expected: TaskScheduler starts without errors

**Step 3: Commit**

Use `/codeblend-commit`

---

### Task 4: Implement worktree management

**Files:**
- Modify: `src/backend/lib/task-scheduler.ts`

**Step 1: Add worktree helper methods**

```typescript
/**
 * Get or create main repo for a position
 */
private async ensureMainRepo(positionId: number): Promise<string> {
  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId) as any;
  if (!position) throw new Error('Position not found');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(position.project_id) as any;
  if (!project) throw new Error('Project not found');

  const mainRepoPath = path.join(
    process.cwd(),
    'data',
    'workspaces',
    `project-${project.id}`,
    'main-repo'
  );

  // Clone if doesn't exist
  if (!fs.existsSync(mainRepoPath)) {
    const workspaceDir = path.dirname(mainRepoPath);
    fs.mkdirSync(workspaceDir, { recursive: true });

    console.log(`[TaskScheduler] Cloning ${project.repo_url}...`);
    execSync(`git clone ${project.repo_url} main-repo`, {
      cwd: workspaceDir,
      stdio: 'inherit'
    });
  } else {
    // Update existing repo
    try {
      execSync('git fetch origin', { cwd: mainRepoPath, stdio: 'ignore' });
    } catch (error) {
      console.warn('[TaskScheduler] Failed to fetch, continuing...');
    }
  }

  return mainRepoPath;
}

/**
 * Create worktree for a task
 */
private async createWorktree(task: Task, mainRepoPath: string): Promise<string> {
  const workspacesDir = path.dirname(mainRepoPath);
  const worktreeName = `task-${task.id}-${this.sanitizeBranchName(task.description)}`;
  const worktreePath = path.join(workspacesDir, worktreeName);

  // Create worktree
  const branchName = `gogetajob-task-${task.id}`;

  try {
    execSync(`git worktree add ${worktreeName} -b ${branchName}`, {
      cwd: mainRepoPath,
      stdio: 'inherit'
    });
    console.log(`[TaskScheduler] Created worktree: ${worktreePath}`);
  } catch (error: any) {
    // Branch might exist, try without -b
    try {
      execSync(`git worktree add ${worktreeName} ${branchName}`, {
        cwd: mainRepoPath,
        stdio: 'inherit'
      });
    } catch {
      throw new Error(`Failed to create worktree: ${error.message}`);
    }
  }

  // Update task with worktree path
  db.prepare('UPDATE tasks SET worktree_path = ? WHERE id = ?')
    .run(worktreePath, task.id);

  return worktreePath;
}

/**
 * Sanitize description for use in branch/directory name
 */
private sanitizeBranchName(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}
```

**Step 2: Test worktree creation**

Create a test task manually:
```bash
node -e "const db = require('better-sqlite3')('data/gogetajob.db'); db.prepare('INSERT INTO tasks (position_id, description) VALUES (?, ?)').run(1, 'Test task');"
```

Run server and verify worktree is created in `data/workspaces/project-X/`

**Step 3: Commit**

Use `/codeblend-commit`

---

### Task 5: Implement agent spawning with ralph-loop

**Files:**
- Modify: `src/backend/lib/task-scheduler.ts`

**Step 1: Implement scheduleTask method**

```typescript
/**
 * Schedule a task by spawning an agent
 */
private async scheduleTask(task: Task): Promise<void> {
  console.log(`[TaskScheduler] Scheduling task ${task.id}: ${task.description}`);

  try {
    // Get position and project info
    const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(task.position_id) as any;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(position.project_id) as any;

    // Ensure main repo exists
    const mainRepoPath = await this.ensureMainRepo(task.position_id);

    // Create worktree for this task
    const worktreePath = await this.createWorktree(task, mainRepoPath);

    // Build ralph-loop prompt
    const prompt = this.buildPrompt(task, project);

    // Write prompt to file
    const promptPath = path.join(path.dirname(mainRepoPath), `prompt-task-${task.id}.txt`);
    fs.writeFileSync(promptPath, prompt, 'utf8');

    // Create batch script
    const batchScript = this.createBatchScript(task, worktreePath, promptPath);
    const scriptPath = path.join(path.dirname(mainRepoPath), `task-${task.id}.bat`);
    fs.writeFileSync(scriptPath, batchScript);

    // Spawn agent in new CMD window
    const agentProcess = spawn('cmd.exe', [
      '/c',
      'start',
      'cmd.exe',
      '/k',
      scriptPath
    ], {
      detached: true,
      stdio: 'ignore',
      shell: true
    });

    agentProcess.unref();

    // Update task status
    db.prepare('UPDATE tasks SET status = ?, started_at = ? WHERE id = ?')
      .run('working', new Date().toISOString(), task.id);

    // Record session
    const session: AgentSession = {
      taskId: task.id,
      sessionId: `task-${task.id}-${Date.now()}`,
      process: agentProcess,
      worktreePath,
      startedAt: new Date()
    };

    this.activeSessions.set(task.id, session);

    console.log(`[TaskScheduler] Agent spawned for task ${task.id}`);
  } catch (error: any) {
    console.error(`[TaskScheduler] Failed to schedule task ${task.id}:`, error);

    // Mark task as failed
    db.prepare('UPDATE tasks SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', error.message, task.id);
  }
}

/**
 * Build ralph-loop prompt for a task
 */
private buildPrompt(task: Task, project: any): string {
  return `You are an autonomous AI agent contributing to the open source project: ${project.name}

Repository: ${project.repo_url}

Your task: ${task.description}

You have full autonomy to:
- Explore the codebase using /codebase-research
- Plan your approach using /brainstorming
- Create sub-tasks if needed by inserting to database:
  node -e "const db = require('better-sqlite3')('${path.join(process.cwd(), 'data', 'gogetajob.db')}'); db.prepare('INSERT INTO tasks (position_id, description, created_by_task_id) VALUES (?, ?, ?)').run(${task.position_id}, 'Task description', ${task.id});"
- Implement changes and test thoroughly
- Commit your work using /codeblend-commit

When you have completed meaningful work (created commits, PR ready), output:
<promise>${task.completion_promise}</promise>

Work with persistence and iterate until success. Good luck!
`.trim();
}

/**
 * Create batch script to launch agent
 */
private createBatchScript(task: Task, worktreePath: string, promptPath: string): string {
  return `@echo off
title GoGetAJob Agent - Task ${task.id}
cd /d "${worktreePath}"
echo ===============================================
echo GoGetAJob Agent - Task ${task.id}
echo ===============================================
echo Task: ${task.description}
echo Working directory: ${worktreePath}
echo.
echo Starting agent with ralph-loop...
echo.
set /p PROMPT=<"${promptPath}"
claude --dangerously-skip-permissions --ralph-loop "%PROMPT%" --max-iterations 50 --completion-promise "${task.completion_promise}"
echo.
echo ===============================================
echo Agent session ended
echo ===============================================
pause
`;
}
```

**Step 2: Test agent spawning**

Create a test task and verify window opens with proper ralph-loop command

**Step 3: Commit**

Use `/codeblend-commit`

---

### Task 6: Implement task completion detection

**Files:**
- Modify: `src/backend/lib/task-scheduler.ts`

**Step 1: Add completion monitoring**

```typescript
/**
 * Monitor tasks for completion
 */
private async monitorCompletions(): Promise<void> {
  const workingTasks = db.prepare(`
    SELECT * FROM tasks WHERE status = 'working'
  `).all() as Task[];

  for (const task of workingTasks) {
    await this.checkTaskCompletion(task);
  }
}

/**
 * Check if a task has completed
 */
private async checkTaskCompletion(task: Task): Promise<void> {
  if (!task.worktree_path || !fs.existsSync(task.worktree_path)) {
    return;
  }

  try {
    // Check for new commits
    const commits = execSync('git log --oneline -1', {
      cwd: task.worktree_path,
      encoding: 'utf8'
    }).trim();

    // Check if we have a session for this task
    const session = this.activeSessions.get(task.id);

    // If no active session but has commits, assume completed
    if (!session && commits) {
      console.log(`[TaskScheduler] Task ${task.id} appears completed (has commits, no active session)`);
      this.completeTask(task.id);
    }

    // TODO: Also check for completion promise in output (need to capture it)
  } catch (error) {
    // Ignore errors, task might still be starting
  }
}

/**
 * Mark task as completed
 */
private completeTask(taskId: number): void {
  db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?')
    .run('completed', new Date().toISOString(), taskId);

  // Remove from active sessions
  this.activeSessions.delete(taskId);

  console.log(`[TaskScheduler] Task ${taskId} marked as completed`);

  // Check if new sub-tasks were created
  this.checkForNewTasks(taskId);
}

/**
 * Check if a task created sub-tasks
 */
private checkForNewTasks(parentTaskId: number): void {
  const newTasks = db.prepare(`
    SELECT * FROM tasks
    WHERE created_by_task_id = ?
      AND status = 'pending'
  `).all(parentTaskId) as Task[];

  if (newTasks.length > 0) {
    console.log(`[TaskScheduler] Task ${parentTaskId} created ${newTasks.length} sub-tasks`);
  }
}
```

**Step 2: Update start() to include monitoring**

In the `start()` method, add monitoring to the poll interval:

```typescript
this.pollInterval = setInterval(() => {
  this.pollAndSchedule().catch(error => {
    console.error('[TaskScheduler] Error polling:', error);
  });

  this.monitorCompletions().catch(error => {
    console.error('[TaskScheduler] Error monitoring:', error);
  });
}, 10000);
```

**Step 3: Test completion detection**

Create a task, let it complete, verify it's marked as completed

**Step 4: Commit**

Use `/codeblend-commit`

---

### Task 7: Update buy position flow

**Files:**
- Modify: `src/backend/lib/position-service.ts`
- Modify: `src/backend/server.ts`

**Step 1: Modify buyPosition to create root task**

In `position-service.ts`, update `buyPosition` method:

```typescript
async buyPosition(projectId: number): Promise<any> {
  // Check if already have active position
  const existing = db.prepare(
    'SELECT * FROM positions WHERE project_id = ? AND status NOT IN (?, ?)'
  ).get(projectId, 'stopped', 'error');

  if (existing) {
    throw new Error('Already have an active position for this project');
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const now = new Date().toISOString();
  const price = (project as any).stars + (project as any).forks * 2;

  // Create position
  const result = db.prepare(`
    INSERT INTO positions (project_id, status, buy_price, started_at)
    VALUES (?, 'buying', ?, ?)
  `).run(projectId, price, now);

  const positionId = result.lastInsertRowid as number;

  // Create root task
  db.prepare(`
    INSERT INTO tasks (position_id, description, status)
    VALUES (?, ?, 'pending')
  `).run(
    positionId,
    `Contribute to this repository: ${(project as any).name}`
  );

  console.log(`[PositionService] Created root task for position ${positionId}`);

  // Update position status to working
  db.prepare('UPDATE positions SET status = ? WHERE id = ?')
    .run('working', positionId);

  return db.prepare('SELECT * FROM positions WHERE id = ?').get(positionId);
}
```

**Step 2: Update server.ts to use TaskScheduler**

Replace WorkScheduler with TaskScheduler:

```typescript
import { TaskScheduler } from './lib/task-scheduler';

const taskScheduler = new TaskScheduler();

// Start task scheduler
taskScheduler.start();

// Remove old workScheduler.startWork() call in buy endpoint
// TaskScheduler will automatically pick up the task
```

**Step 3: Test buy flow**

1. Start server
2. Buy a position via API
3. Verify root task is created in DB
4. Verify TaskScheduler picks it up and spawns agent

**Step 4: Commit**

Use `/codeblend-commit`

---

### Task 8: Add task dashboard to UI

**Files:**
- Create: `src/frontend/pages/TasksPage.tsx`
- Modify: `src/frontend/App.tsx`
- Modify: `src/frontend/api.ts`

**Step 1: Add tasks API methods**

In `api.ts`:

```typescript
export interface Task {
  id: number;
  position_id: number;
  description: string;
  status: 'pending' | 'working' | 'completed' | 'failed' | 'blocked';
  worktree_path: string | null;
  created_by_task_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

// In api object:
async getTasks(positionId?: number): Promise<Task[]> {
  const url = positionId
    ? `${API_BASE}/tasks?position_id=${positionId}`
    : `${API_BASE}/tasks`;
  const res = await fetch(url);
  return res.json();
}
```

**Step 2: Add tasks API endpoint**

In `server.ts`:

```typescript
app.get('/api/tasks', (req, res) => {
  try {
    const positionId = req.query.position_id;
    let query = 'SELECT * FROM tasks';
    const params: any[] = [];

    if (positionId) {
      query += ' WHERE position_id = ?';
      params.push(parseInt(positionId as string));
    }

    query += ' ORDER BY created_at DESC';

    const tasks = db.prepare(query).all(...params);
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 3: Create TasksPage component**

Create `src/frontend/pages/TasksPage.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { api, type Task } from '../api';

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
    // Poll every 5 seconds
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadTasks() {
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#2ecc71';
      case 'working': return '#3498db';
      case 'failed': return '#e74c3c';
      case 'blocked': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="card">
      <h2 className="card-title">任务列表</h2>
      {tasks.length === 0 ? (
        <div className="loading">暂无任务</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>描述</th>
              <th>状态</th>
              <th>开始时间</th>
              <th>完成时间</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => (
              <tr key={task.id}>
                <td>#{task.id}</td>
                <td>
                  {task.created_by_task_id && (
                    <span style={{ color: '#888', marginRight: '8px' }}>
                      ↳ (from #{task.created_by_task_id})
                    </span>
                  )}
                  {task.description}
                </td>
                <td>
                  <span style={{
                    color: getStatusColor(task.status),
                    fontWeight: 'bold'
                  }}>
                    {task.status}
                  </span>
                </td>
                <td>
                  {task.started_at
                    ? new Date(task.started_at).toLocaleString()
                    : '-'
                  }
                </td>
                <td>
                  {task.completed_at
                    ? new Date(task.completed_at).toLocaleString()
                    : '-'
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

**Step 4: Add route to App.tsx**

Add TasksPage to navigation

**Step 5: Test UI**

Open browser, verify tasks page shows tasks in real-time

**Step 6: Commit**

Use `/codeblend-commit`

---

### Task 9: End-to-end testing

**Files:**
- None (testing only)

**Step 1: Clean test environment**

```bash
# Clean database
node -e "const db = require('better-sqlite3')('data/gogetajob.db'); db.prepare('DELETE FROM tasks').run(); db.prepare('DELETE FROM positions').run();"

# Clean workspaces
rm -rf data/workspaces/*
```

**Step 2: Test case 1 - Root task creation**

1. Start server
2. Buy position for gogetajob
3. Verify root task created in DB
4. Verify agent window opens

**Step 3: Test case 2 - Agent creates sub-tasks**

1. In agent window, manually insert a sub-task:
```bash
node -e "const db = require('better-sqlite3')('../../data/gogetajob.db'); db.prepare('INSERT INTO tasks (position_id, description, created_by_task_id) VALUES (1, \"Test sub-task\", 1)').run();"
```
2. Wait for scheduler to poll
3. Verify new agent window opens for sub-task

**Step 4: Test case 3 - Serial execution**

1. Create 3 tasks with max_parallel_tasks=1
2. Verify only 1 agent runs at a time
3. Verify next agent starts after previous completes

**Step 5: Test case 4 - Task completion**

1. In agent window, create a commit
2. Type: `<promise>TASK_COMPLETE</promise>`
3. Exit agent
4. Verify task marked as completed in DB

**Step 6: Document test results**

Add results to devlog in README.md

---

### Task 10: Remove old Worker code

**Files:**
- Delete: `src/backend/lib/ai-worker.ts` (obsolete)
- Delete: `src/backend/lib/work-scheduler.ts` (obsolete)
- Modify: `src/backend/server.ts` (clean up imports)

**Step 1: Verify TaskScheduler is working**

Ensure new system works before deleting old code

**Step 2: Remove old files**

```bash
git rm src/backend/lib/ai-worker.ts
git rm src/backend/lib/work-scheduler.ts
```

**Step 3: Clean up server.ts**

Remove old WorkScheduler imports and references

**Step 4: Test server starts without errors**

Run: `npx ts-node src/backend/server.ts`
Expected: No import errors

**Step 5: Commit**

Use `/codeblend-commit`

---

### Task 11: Add task controls to UI

**Files:**
- Modify: `src/frontend/pages/TasksPage.tsx`
- Modify: `src/backend/server.ts`

**Step 1: Add task control API endpoints**

```typescript
// Cancel a task
app.post('/api/tasks/:id/cancel', (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?')
      .run('blocked', taskId);

    // TODO: Kill the agent process if active

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Retry a failed task
app.post('/api/tasks/:id/retry', (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    db.prepare('UPDATE tasks SET status = ?, error_message = NULL WHERE id = ?')
      .run('pending', taskId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

**Step 2: Add control buttons to TasksPage**

Add action column with Cancel/Retry buttons

**Step 3: Test controls**

Verify buttons work and update task status

**Step 4: Commit**

Use `/codeblend-commit`

---

### Task 12: Dogfooding test with gogetajob

**Files:**
- None (testing only)

**Step 1: Create real test scenario**

1. Create issue #16: "Add real-time notifications"
2. Buy gogetajob position
3. Let agent explore and create sub-tasks
4. Observe agent behavior

**Step 2: Monitor and document**

Watch agent windows, check:
- Does agent explore effectively?
- Does agent create reasonable sub-tasks?
- Do sub-tasks get picked up and executed?
- Are commits meaningful?

**Step 3: Document findings**

Add to devlog:
- What worked well
- What needs improvement
- Edge cases discovered

**Step 4: Update README status to "Completed"**

---

## Implementation Plan

### Phase 1: Database Schema
1. Add `tasks` table
2. Migrate existing positions
3. Add `max_parallel_tasks` to positions config

### Phase 2: Task Scheduler
1. Create `TaskScheduler` class
2. Implement task polling loop
3. Implement worktree management
4. Implement agent spawning (CMD window + claude)

### Phase 3: Agent Communication
1. Implement task completion detection
2. Add tasks.json parser
3. Add direct DB insert support (via bash)
4. Add logging and monitoring

### Phase 4: Integration
1. Update buy position flow to create root task
2. Remove old Worker loop logic
3. Add task dashboard to UI
4. Add task control (pause, cancel, retry)

### Phase 5: Testing
1. Test with gogetajob itself (dogfooding!)
2. Test serial execution
3. Test parallel execution
4. Test task decomposition
5. Test error handling and recovery

---

## Success Criteria

- [ ] Buying a position creates a root task
- [ ] Agent autonomously explores and creates sub-tasks
- [ ] Multiple agents can work in parallel (configurable)
- [ ] Each agent uses ralph-loop for persistent iteration
- [ ] Tasks complete and update status correctly
- [ ] UI shows task progress in real-time
- [ ] System successfully contributes to gogetajob itself

---

## Open Questions

1. **How should agents authenticate with GitHub?**
   - Inherit from position's GitHub token
   - Each worktree shares same .git/config

2. **What happens if agent creates duplicate tasks?**
   - Add task deduplication logic
   - Or let it happen (idempotency in task execution)

3. **Should we limit task depth?**
   - Task-1 creates Task-2, Task-2 creates Task-3, etc.
   - Add max_depth config to prevent infinite decomposition

4. **How to handle failed tasks?**
   - Manual retry?
   - Automatic retry with different prompt?
   - Mark as failed and move on?

---

## Related Work

- **justdoit** - Single worker, monitors Claude output
- **ralph-loop** - Persistent iteration via stop hook
- **crew** - Task decomposition and planning skills

---

## Devlog

### 2026-03-13
- Initial brainstorming session
- Explored worker execution patterns
- Discovered "exploration is just a task" insight
- Designed self-organizing architecture
- Design approved ✅
