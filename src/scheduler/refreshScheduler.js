const cron = require('node-cron');
const dashboardAggregator = require('../aggregators/dashboardAggregator');
const modeManager = require('../utils/modeManager');
const logger = require('../utils/logger');

// Scheduler configuration
const REFRESH_SCHEDULE = '*/30 * * * * *'; // Every 30 seconds

// Scheduler state
let schedulerTask = null;
let isRunning = false;
let lastRefreshTime = null;
let refreshCount = 0;
let errorCount = 0;

// WebSocket broadcast handler (injected from wsHandler)
let broadcastHandler = null;

/**
 * Perform dashboard refresh
 * Fetches latest data and broadcasts to all WebSocket clients
 */
async function performRefresh() {
  try {
    logger.debug('Scheduler: Starting dashboard refresh');

    const currentMode = modeManager.getCurrentMode();
    const dashboardData = await dashboardAggregator.aggregateDashboard(currentMode);

    // Broadcast to all WebSocket clients if handler is available
    if (broadcastHandler) {
      broadcastHandler('dashboard:update', dashboardData);
      logger.debug('Scheduler: Dashboard data broadcasted to WebSocket clients');
    } else {
      logger.warn('Scheduler: No WebSocket broadcast handler available');
    }

    // Update stats
    lastRefreshTime = new Date().toISOString();
    refreshCount++;

    logger.debug(`Scheduler: Refresh completed (count: ${refreshCount})`);
  } catch (error) {
    errorCount++;
    logger.error(`Scheduler: Error during refresh (error count: ${errorCount}): ${error.message}`);
    // Don't throw - keep scheduler running
  }
}

/**
 * Start the refresh scheduler
 */
function start(wsHandlerBroadcast = null) {
  if (isRunning) {
    logger.warn('Scheduler: Already running');
    return false;
  }

  // Set broadcast handler if provided
  if (wsHandlerBroadcast) {
    broadcastHandler = wsHandlerBroadcast;
  }

  // Create scheduled task
  schedulerTask = cron.schedule(REFRESH_SCHEDULE, async () => {
    await performRefresh();
  });

  isRunning = true;
  logger.info(`Scheduler: Started with schedule: ${REFRESH_SCHEDULE}`);

  return true;
}

/**
 * Stop the refresh scheduler
 */
function stop() {
  if (!isRunning) {
    logger.warn('Scheduler: Not running');
    return false;
  }

  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }

  isRunning = false;
  logger.info('Scheduler: Stopped');

  return true;
}

/**
 * Manually trigger an immediate refresh
 * @returns {Promise<boolean>} Success status
 */
async function triggerRefresh() {
  logger.info('Scheduler: Manual refresh triggered');

  try {
    await performRefresh();
    return true;
  } catch (error) {
    logger.error(`Scheduler: Manual refresh failed: ${error.message}`);
    return false;
  }
}

/**
 * Get scheduler status and statistics
 */
function getStatus() {
  return {
    isRunning,
    schedule: REFRESH_SCHEDULE,
    lastRefreshTime,
    refreshCount,
    errorCount,
    hasBroadcastHandler: broadcastHandler !== null
  };
}

/**
 * Reset scheduler statistics
 */
function resetStats() {
  refreshCount = 0;
  errorCount = 0;
  lastRefreshTime = null;
  logger.info('Scheduler: Statistics reset');
}

/**
 * Set the WebSocket broadcast handler
 */
function setBroadcastHandler(handler) {
  broadcastHandler = handler;
  logger.debug('Scheduler: Broadcast handler set');
}

module.exports = {
  start,
  stop,
  triggerRefresh,
  getStatus,
  resetStats,
  setBroadcastHandler
};
