const express = require('express');
const router = express.Router();
const dashboardAggregator = require('../aggregators/dashboardAggregator');
const modeManager = require('../utils/modeManager');
const { validateMode, validateQueryMode } = require('../middleware/validateRequest');
const logger = require('../utils/logger');

/**
 * GET /api/dashboard/data
 * Returns aggregated dashboard data for specified mode
 * Query params: mode (optional, defaults to current mode)
 */
router.get('/data', validateQueryMode, async (req, res, next) => {
  try {
    const mode = req.query.mode || modeManager.getCurrentMode();

    logger.debug(`GET /api/dashboard/data?mode=${mode}`);

    // Aggregate dashboard data
    const dashboardData = await dashboardAggregator.aggregateDashboard(mode);

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error(`Error in GET /api/dashboard/data: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/dashboard/mode
 * Changes the current dashboard mode
 * Body: { mode: "personal" | "guest" | "transit" | "morning" | "work" }
 */
router.post('/mode', validateMode, async (req, res, next) => {
  try {
    const { mode } = req.body;

    logger.debug(`POST /api/dashboard/mode - mode: ${mode}`);

    // Use modeManager to set mode
    const result = modeManager.setMode(mode);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: {
        mode: result.mode,
        previousMode: result.previousMode,
        lastChanged: result.lastChanged,
        message: `Mode changed to ${result.mode}`
      }
    });
  } catch (error) {
    logger.error(`Error in POST /api/dashboard/mode: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/dashboard/refresh
 * Forces immediate refresh of dashboard data
 * Returns fresh data for current mode (bypassing cache where applicable)
 */
router.get('/refresh', async (req, res, next) => {
  try {
    logger.debug('GET /api/dashboard/refresh');

    const currentMode = modeManager.getCurrentMode();

    // Note: Cache is handled at service level (30s for transit, 10min for weather)
    // This endpoint simply fetches fresh data for current mode
    const dashboardData = await dashboardAggregator.aggregateDashboard(currentMode);

    res.json({
      success: true,
      data: dashboardData,
      message: 'Dashboard data refreshed'
    });
  } catch (error) {
    logger.error(`Error in GET /api/dashboard/refresh: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/dashboard/mode
 * Returns the current dashboard mode
 */
router.get('/mode', (req, res) => {
  logger.debug('GET /api/dashboard/mode');

  res.json({
    success: true,
    data: {
      mode: modeManager.getCurrentMode(),
      lastChanged: modeManager.getLastChanged()
    }
  });
});

/**
 * GET /api/dashboard/modes
 * Returns list of available dashboard modes
 */
router.get('/modes', (req, res) => {
  logger.debug('GET /api/dashboard/modes');

  const modes = dashboardAggregator.getAvailableModes();

  res.json({
    success: true,
    data: {
      modes,
      currentMode: modeManager.getCurrentMode()
    }
  });
});

/**
 * GET /api/dashboard (alias for /data)
 * Returns aggregated dashboard data for current mode
 */
router.get('/', async (req, res, next) => {
  try {
    logger.debug('GET /api/dashboard');

    const currentMode = modeManager.getCurrentMode();
    const dashboardData = await dashboardAggregator.aggregateDashboard(currentMode);

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error(`Error in GET /api/dashboard: ${error.message}`);
    next(error);
  }
});

module.exports = router;
