const logger = require('../utils/logger');
const { isValidMode } = require('../../config/modes');

/**
 * Request Validation Middleware
 * Validates request body, query params, and other inputs
 */

/**
 * Validate mode parameter
 * Used for POST /api/dashboard/mode and POST /api/profile
 */
function validateMode(req, res, next) {
  const { mode } = req.body;

  // Check if mode is provided
  if (!mode) {
    logger.warn('Validation failed: mode is required');
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: {
        field: 'mode',
        message: 'Mode is required in request body'
      }
    });
  }

  // Check if mode is a string
  if (typeof mode !== 'string') {
    logger.warn(`Validation failed: mode must be a string, received ${typeof mode}`);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: {
        field: 'mode',
        message: 'Mode must be a string'
      }
    });
  }

  // Check if mode is valid
  if (!isValidMode(mode)) {
    logger.warn(`Validation failed: invalid mode '${mode}'`);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: {
        field: 'mode',
        message: `Invalid mode: '${mode}'. Valid modes are: personal, guest, transit, morning, work`,
        validModes: ['personal', 'guest', 'transit', 'morning', 'work']
      }
    });
  }

  // Validation passed
  next();
}

/**
 * Validate query mode parameter (optional)
 * Used for GET /api/dashboard/data?mode=guest
 */
function validateQueryMode(req, res, next) {
  const { mode } = req.query;

  // Mode is optional, so skip if not provided
  if (!mode) {
    return next();
  }

  // Check if mode is valid
  if (!isValidMode(mode)) {
    logger.warn(`Validation failed: invalid query mode '${mode}'`);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: {
        field: 'mode',
        message: `Invalid mode: '${mode}'. Valid modes are: personal, guest, transit, morning, work`,
        validModes: ['personal', 'guest', 'transit', 'morning', 'work']
      }
    });
  }

  // Validation passed
  next();
}

/**
 * Validate JSON body exists
 * Used for POST/PUT requests that require a body
 */
function validateBody(req, res, next) {
  if (!req.body || Object.keys(req.body).length === 0) {
    logger.warn('Validation failed: empty request body');
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: {
        message: 'Request body is required'
      }
    });
  }

  next();
}

/**
 * Sanitize string input (prevent XSS)
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return str;
  }

  // Remove potentially dangerous characters
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Sanitize request body
 * Applies to all string fields in the body
 */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }

  next();
}

/**
 * Validate WebSocket command
 * Used by WebSocket handler
 */
function validateWebSocketCommand(data) {
  try {
    // Check if data is an object
    if (typeof data !== 'object' || data === null) {
      return {
        valid: false,
        error: 'Invalid command format: must be an object'
      };
    }

    // Check if command exists
    if (!data.command || typeof data.command !== 'string') {
      return {
        valid: false,
        error: 'Invalid command: command field is required and must be a string'
      };
    }

    // Validate specific commands
    const validCommands = ['setMode', 'refresh', 'ping'];
    if (!validCommands.includes(data.command)) {
      return {
        valid: false,
        error: `Unknown command: ${data.command}. Valid commands: ${validCommands.join(', ')}`
      };
    }

    // Validate setMode payload
    if (data.command === 'setMode') {
      if (!data.payload || !data.payload.mode) {
        return {
          valid: false,
          error: 'setMode command requires payload.mode'
        };
      }

      if (!isValidMode(data.payload.mode)) {
        return {
          valid: false,
          error: `Invalid mode: ${data.payload.mode}. Valid modes: personal, guest, transit, morning, work`
        };
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid JSON format'
    };
  }
}

module.exports = {
  validateMode,
  validateQueryMode,
  validateBody,
  sanitizeBody,
  sanitizeString,
  validateWebSocketCommand
};
