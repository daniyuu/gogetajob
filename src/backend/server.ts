import express from 'express';
import cors from 'cors';
import path from 'path';
import { runMigrations } from './lib/migrations';
import { loadConfig } from './lib/config';
import { ProjectService } from './lib/project-service';
import { PositionService } from './lib/position-service';
import { BackgroundDaemon } from './lib/daemon';
import { TaskScheduler } from './lib/task-scheduler';

const app = express();
const config = loadConfig();

// Initialize database
runMigrations();

// Services
const projectService = new ProjectService(config.githubToken || undefined);
const positionService = new PositionService(config.githubToken || undefined);
const daemon = new BackgroundDaemon();
const taskScheduler = new TaskScheduler();

// Start background services
daemon.start();
taskScheduler.start();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

// API Routes

// Projects
app.get('/api/projects', (req, res) => {
  try {
    const projects = projectService.getAllProjects();
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const project = projectService.getProjectById(parseInt(req.params.id));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const { repo_url } = req.body;
    if (!repo_url) {
      return res.status(400).json({ error: 'repo_url is required' });
    }
    const project = await projectService.addProject(repo_url);
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/snapshots', (req, res) => {
  try {
    const snapshots = projectService.getProjectSnapshots(parseInt(req.params.id));
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Positions
app.get('/api/positions', (req, res) => {
  try {
    const positions = positionService.getAllPositions();
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/active', (req, res) => {
  try {
    const positions = positionService.getActivePositions();
    res.json(positions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/positions/buy', async (req, res) => {
  try {
    const { project_id } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    console.log(`[Server] Buying position for project ${project_id}`);
    const position = await positionService.buyPosition(project_id);
    console.log(`[Server] Position created with ID ${position.id}`);
    console.log(`[Server] Root exploration task created - TaskScheduler will pick it up`);

    res.json(position);
  } catch (error: any) {
    console.error('[Server] Failed to buy position:', error.message);
    console.error('[Server] Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/positions/:id/sell', async (req, res) => {
  try {
    const positionId = parseInt(req.params.id);

    // Sell the position
    positionService.sellPosition(positionId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/:id/prs', (req, res) => {
  try {
    const prs = positionService.getPositionPRs(parseInt(req.params.id));
    res.json(prs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/:id/roi', (req, res) => {
  try {
    const roi = positionService.calculateROI(parseInt(req.params.id));
    res.json({ roi });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Notifications
app.get('/api/notifications', (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = positionService.getNotifications(unreadOnly);
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    positionService.markNotificationRead(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tasks
app.get('/api/tasks', (req, res) => {
  try {
    const { db } = require('./lib/database');
    const positionId = req.query.position_id;

    let tasks;
    if (positionId) {
      tasks = db.prepare('SELECT * FROM tasks WHERE position_id = ? ORDER BY created_at DESC').all(parseInt(positionId as string));
    } else {
      tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    }

    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const { db } = require('./lib/database');
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(req.params.id));

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { db } = require('./lib/database');
    const { position_id, description, completion_promise, created_by_task_id } = req.body;

    // Validation
    if (!position_id || !description) {
      return res.status(400).json({ error: 'position_id and description are required' });
    }

    // Set default completion promise if not provided
    const promise = completion_promise || `TASK_${Date.now()}_COMPLETE`;

    // Insert task
    const result = db.prepare(`
      INSERT INTO tasks (position_id, description, status, completion_promise, created_by_task_id)
      VALUES (?, ?, 'pending', ?, ?)
    `).run(position_id, description, promise, created_by_task_id || null);

    // Get the created task
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);

    console.log(`[Server] Task created: ID ${task.id} for position ${position_id}`);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/tasks/:id/complete', (req, res) => {
  try {
    const { db } = require('./lib/database');
    const taskId = parseInt(req.params.id);

    // Mark task as completed
    db.prepare(`
      UPDATE tasks
      SET status = 'completed', completed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), taskId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    console.log(`[Server] Task ${taskId} marked as completed`);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/tasks/:id/fail', (req, res) => {
  try {
    const { db } = require('./lib/database');
    const taskId = parseInt(req.params.id);
    const { error_message } = req.body;

    // Mark task as failed
    db.prepare(`
      UPDATE tasks
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `).run(error_message || 'Task failed', taskId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    console.log(`[Server] Task ${taskId} marked as failed: ${error_message}`);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions/:id/tasks', (req, res) => {
  try {
    const { db } = require('./lib/database');
    const tasks = db.prepare('SELECT * FROM tasks WHERE position_id = ? ORDER BY created_at DESC').all(parseInt(req.params.id));
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Config
app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  try {
    const { saveConfig } = require('./lib/config');
    saveConfig(req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  daemon.stop();
  taskScheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  daemon.stop();
  taskScheduler.stop();
  process.exit(0);
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 GoGetAJob server running on http://localhost:${PORT}`);
});
