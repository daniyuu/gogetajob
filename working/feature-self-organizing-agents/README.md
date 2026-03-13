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
