import express from 'express';
import cors from 'cors';
import path from 'path';
import { runMigrations } from './lib/migrations';
import { loadConfig } from './lib/config';
import { ProjectService } from './lib/project-service';
import { PositionService } from './lib/position-service';
import { WorkScheduler } from './lib/work-scheduler';
import { BackgroundDaemon } from './lib/daemon';
import { TaskScheduler } from './lib/task-scheduler';

const app = express();
const config = loadConfig();

// Initialize database
runMigrations();

// Services
const projectService = new ProjectService(config.githubToken || undefined);
const positionService = new PositionService(config.githubToken || undefined);
const workScheduler = new WorkScheduler();
const daemon = new BackgroundDaemon();
const taskScheduler = new TaskScheduler();

// Start background services
daemon.start();
taskScheduler.start();

// Resume active positions
workScheduler.resumeActivePositions().catch(error => {
  console.error('Failed to resume active positions:', error);
});

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
    console.log(`[Server] Position created:`, position);

    // Start AI worker
    try {
      console.log(`[Server] Starting worker for position ${position.id}...`);
      await workScheduler.startWork(position.id);
      console.log(`[Server] Worker started successfully`);
    } catch (error: any) {
      console.error('[Server] Failed to start worker:', error.message);
      console.error('[Server] Error stack:', error.stack);
      // Position is created but worker failed to start
      // User can retry or check notifications
    }

    res.json(position);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/positions/:id/sell', async (req, res) => {
  try {
    const positionId = parseInt(req.params.id);

    // Stop AI worker first
    await workScheduler.stopWork(positionId);

    // Then sell the position
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

// Work scheduler status
app.get('/api/workers', (req, res) => {
  try {
    const sessions = workScheduler.getActiveSessions();
    res.json(sessions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workers/:positionId/start', async (req, res) => {
  try {
    await workScheduler.startWork(parseInt(req.params.positionId));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workers/:positionId/stop', async (req, res) => {
  try {
    await workScheduler.stopWork(parseInt(req.params.positionId));
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
  await workScheduler.stopAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  daemon.stop();
  taskScheduler.stop();
  await workScheduler.stopAll();
  process.exit(0);
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 GoGetAJob server running on http://localhost:${PORT}`);
});
