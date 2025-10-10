require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const logger = require('./src/utils/logger');
const requestLogger = require('./src/middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const { validateAndExit } = require('./src/utils/envValidator');

// Validate environment variables on startup
validateAndExit();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health check endpoint (basic)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Dashboard API. See /health for status.' });
});

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'Dashboard API Server' });
});

// Import and register route modules
const transitRoutes = require('./src/routes/transit');
const weatherRoutes = require('./src/routes/weather');
const calendarRoutes = require('./src/routes/calendar');
const tasksRoutes = require('./src/routes/tasks');
const dashboardRoutes = require('./src/routes/dashboard');
const profileRoutes = require('./src/routes/profile');

app.use('/api/transit', transitRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server });
const wsHandler = require('./src/websocket/wsHandler');

// Initialize WebSocket handler
wsHandler.initialize(wss);

// Setup refresh scheduler
const refreshScheduler = require('./src/scheduler/refreshScheduler');
refreshScheduler.setBroadcastHandler(wsHandler.broadcast);
refreshScheduler.start();

// Import utilities for status endpoint
const modeManager = require('./src/utils/modeManager');
const cacheManager = require('./src/utils/cacheManager');
const lifestackClient = require('./src/services/lifestackClient');

// Detailed status endpoint
app.get('/status', async (req, res) => {
  try {
    // Get cache statistics
    const cacheStats = cacheManager.getStats();

    // Get scheduler status
    const schedulerStatus = refreshScheduler.getStatus();

    // Get WebSocket connection count
    const wsConnectionCount = wsHandler.getConnectedClientsCount();

    // Get current mode
    const currentMode = modeManager.getCurrentMode();
    const profile = modeManager.getProfile();

    // Check Lifestack API health
    const lifestackHealth = await lifestackClient.healthCheck();

    // Build detailed status
    const status = {
      server: {
        status: 'healthy',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      },
      websocket: {
        activeConnections: wsConnectionCount,
        enabled: true
      },
      scheduler: {
        isRunning: schedulerStatus.isRunning,
        schedule: schedulerStatus.schedule,
        lastRefreshTime: schedulerStatus.lastRefreshTime,
        refreshCount: schedulerStatus.refreshCount,
        errorCount: schedulerStatus.errorCount
      },
      cache: {
        keys: cacheStats.keys,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: cacheStats.misses > 0
          ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(2) + '%'
          : 'N/A'
      },
      profile: {
        currentMode: currentMode,
        modeName: profile.name,
        lastChanged: profile.lastChanged
      },
      services: {
        lifestack: {
          status: lifestackHealth.status,
          url: lifestackHealth.lifestackUrl
        },
        transit: {
          status: 'operational',
          cacheEnabled: true,
          cacheTTL: 30
        },
        weather: {
          status: 'operational',
          cacheEnabled: true,
          cacheTTL: 600
        }
      }
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error(`Error in /status endpoint: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve status',
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`WebSocket server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  refreshScheduler.stop();
  wsHandler.shutdown();
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:');
  console.error(error);
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
