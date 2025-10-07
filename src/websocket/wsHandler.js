const WebSocket = require('ws');
const dashboardAggregator = require('../aggregators/dashboardAggregator');
const modeManager = require('../utils/modeManager');
const { validateWebSocketCommand } = require('../middleware/validateRequest');
const logger = require('../utils/logger');

// WebSocket clients set
let clients = new Set();

// Intervals
let dashboardUpdateInterval = null;
let pingInterval = null;

// Configuration
const DASHBOARD_UPDATE_INTERVAL = 30000; // 30 seconds
const PING_INTERVAL = 15000; // 15 seconds

/**
 * Create WebSocket event message
 */
function createEvent(event, data) {
  return JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Send message to a specific client
 */
function sendToClient(ws, event, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(createEvent(event, data));
    } catch (error) {
      logger.error(`Error sending to client: ${error.message}`);
    }
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(event, data) {
  const message = createEvent(event, data);
  let successCount = 0;
  let failCount = 0;

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        successCount++;
      } catch (error) {
        logger.error(`Error broadcasting to client: ${error.message}`);
        failCount++;
      }
    }
  });

  logger.debug(`Broadcast ${event} to ${successCount} clients (${failCount} failed)`);
}

/**
 * Fetch and broadcast dashboard update
 */
async function broadcastDashboardUpdate() {
  try {
    const currentMode = modeManager.getCurrentMode();
    const dashboardData = await dashboardAggregator.aggregateDashboard(currentMode);

    broadcast('dashboard:update', dashboardData);
  } catch (error) {
    logger.error(`Error broadcasting dashboard update: ${error.message}`);
  }
}

/**
 * Broadcast profile change event
 */
function broadcastProfileChange(profile) {
  broadcast('profile:changed', profile);
}

/**
 * Handle client message
 */
async function handleClientMessage(ws, message) {
  try {
    const data = JSON.parse(message);

    // Validate command
    const validation = validateWebSocketCommand(data);
    if (!validation.valid) {
      logger.warn(`Invalid WebSocket command: ${validation.error}`);
      sendToClient(ws, 'error', {
        message: validation.error
      });
      return;
    }

    const { command, payload } = data;

    logger.debug(`Received command: ${command}`);

    switch (command) {
      case 'setMode':
        if (payload && payload.mode) {
          const result = modeManager.setMode(payload.mode);

          if (result.success) {
            const profile = modeManager.getProfile();
            // Send confirmation to requesting client
            sendToClient(ws, 'profile:changed', profile);
            // Broadcast to all other clients
            broadcastProfileChange(profile);
            // Send updated dashboard data
            await broadcastDashboardUpdate();
          } else {
            sendToClient(ws, 'error', {
              message: result.error,
              command: 'setMode'
            });
          }
        } else {
          sendToClient(ws, 'error', {
            message: 'Mode is required',
            command: 'setMode'
          });
        }
        break;

      case 'refresh':
        // Send fresh dashboard data to requesting client
        try {
          const currentMode = modeManager.getCurrentMode();
          const dashboardData = await dashboardAggregator.aggregateDashboard(currentMode);
          sendToClient(ws, 'dashboard:update', dashboardData);
        } catch (error) {
          sendToClient(ws, 'error', {
            message: 'Failed to refresh dashboard',
            command: 'refresh'
          });
        }
        break;

      case 'ping':
        // Respond with pong
        sendToClient(ws, 'pong', { timestamp: new Date().toISOString() });
        break;

      default:
        sendToClient(ws, 'error', {
          message: `Unknown command: ${command}`,
          command
        });
    }
  } catch (error) {
    logger.error(`Error handling client message: ${error.message}`);
    sendToClient(ws, 'error', {
      message: 'Invalid message format'
    });
  }
}

/**
 * Handle new WebSocket connection
 */
function handleConnection(ws, req) {
  logger.info('New WebSocket client connected');

  // Add client to set
  clients.add(ws);

  // Send connection event
  sendToClient(ws, 'connection', {
    message: 'Connected to Dashboard API WebSocket',
    clientId: clients.size
  });

  // Send current profile
  const profile = modeManager.getProfile();
  sendToClient(ws, 'profile:changed', profile);

  // Send initial dashboard data
  (async () => {
    try {
      const currentMode = modeManager.getCurrentMode();
      const dashboardData = await dashboardAggregator.aggregateDashboard(currentMode);
      sendToClient(ws, 'dashboard:update', dashboardData);
    } catch (error) {
      logger.error(`Error sending initial dashboard data: ${error.message}`);
    }
  })();

  // Handle messages from client
  ws.on('message', (message) => {
    logger.debug(`Received: ${message.toString()}`);
    handleClientMessage(ws, message.toString());
  });

  // Handle client disconnect
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    clients.delete(ws);
  });

  // Handle errors
  ws.on('error', (error) => {
    logger.error(`WebSocket error: ${error.message}`);
    clients.delete(ws);
  });

  // Respond to pings
  ws.on('ping', () => {
    ws.pong();
  });
}

/**
 * Start periodic dashboard updates
 */
function startDashboardUpdates() {
  if (dashboardUpdateInterval) {
    clearInterval(dashboardUpdateInterval);
  }

  dashboardUpdateInterval = setInterval(() => {
    broadcastDashboardUpdate();
  }, DASHBOARD_UPDATE_INTERVAL);

  logger.info(`Dashboard update broadcasts started (${DASHBOARD_UPDATE_INTERVAL / 1000}s interval)`);
}

/**
 * Start ping/pong keepalive
 */
function startPingPong() {
  if (pingInterval) {
    clearInterval(pingInterval);
  }

  pingInterval = setInterval(() => {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.ping();
        } catch (error) {
          logger.error(`Error sending ping: ${error.message}`);
        }
      }
    });
  }, PING_INTERVAL);

  logger.info(`Ping/pong keepalive started (${PING_INTERVAL / 1000}s interval)`);
}

/**
 * Stop all intervals
 */
function stopIntervals() {
  if (dashboardUpdateInterval) {
    clearInterval(dashboardUpdateInterval);
    dashboardUpdateInterval = null;
    logger.info('Dashboard update broadcasts stopped');
  }

  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
    logger.info('Ping/pong keepalive stopped');
  }
}

/**
 * Initialize WebSocket server
 */
function initialize(wss) {
  logger.info('Initializing WebSocket handler');

  // Handle connections
  wss.on('connection', handleConnection);

  // Start periodic updates
  startDashboardUpdates();
  startPingPong();

  logger.info('WebSocket handler initialized');
}

/**
 * Shutdown WebSocket handler
 */
function shutdown() {
  logger.info('Shutting down WebSocket handler');

  // Stop intervals
  stopIntervals();

  // Close all client connections
  clients.forEach((client) => {
    try {
      client.close(1000, 'Server shutting down');
    } catch (error) {
      logger.error(`Error closing client connection: ${error.message}`);
    }
  });

  clients.clear();
  logger.info('WebSocket handler shutdown complete');
}

/**
 * Get connected clients count
 */
function getConnectedClientsCount() {
  return clients.size;
}

module.exports = {
  initialize,
  shutdown,
  broadcast,
  broadcastDashboardUpdate,
  broadcastProfileChange,
  getConnectedClientsCount
};
