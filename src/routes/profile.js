const express = require('express');
const router = express.Router();
const modeManager = require('../utils/modeManager');
const { validateMode } = require('../middleware/validateRequest');
const logger = require('../utils/logger');

/**
 * GET /api/profile
 * Returns current profile information (mode + metadata)
 */
router.get('/', (req, res) => {
  try {
    logger.debug('GET /api/profile');

    const profile = modeManager.getProfile();

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error(`Error in GET /api/profile: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile'
    });
  }
});

/**
 * POST /api/profile
 * Changes the current profile mode
 * Body: { mode: "personal" | "guest" | "transit" | "morning" | "work" }
 */
router.post('/', validateMode, (req, res) => {
  try {
    const { mode } = req.body;

    logger.debug(`POST /api/profile - mode: ${mode}`);

    // Use modeManager to set mode
    const result = modeManager.setMode(mode);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Return updated profile
    const profile = modeManager.getProfile();

    res.json({
      success: true,
      data: profile,
      message: `Profile mode changed to ${result.mode}`
    });
  } catch (error) {
    logger.error(`Error in POST /api/profile: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

/**
 * GET /api/profile/history
 * Returns mode change history
 */
router.get('/history', (req, res) => {
  try {
    logger.debug('GET /api/profile/history');

    const history = modeManager.getChangeHistory();

    res.json({
      success: true,
      data: {
        history,
        count: history.length
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/profile/history: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve history'
    });
  }
});

/**
 * POST /api/profile/reset
 * Resets profile to default mode (personal)
 */
router.post('/reset', (req, res) => {
  try {
    logger.debug('POST /api/profile/reset');

    const result = modeManager.reset();

    const profile = modeManager.getProfile();

    res.json({
      success: true,
      data: profile,
      message: `Profile reset to ${result.mode}`
    });
  } catch (error) {
    logger.error(`Error in POST /api/profile/reset: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to reset profile'
    });
  }
});

module.exports = router;
