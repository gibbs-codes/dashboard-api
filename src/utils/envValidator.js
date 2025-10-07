const logger = require('./logger');

/**
 * Environment Variable Validator
 * Validates required environment variables on startup
 */

// Define required environment variables
const REQUIRED_VARS = [
  'PORT',
  'NODE_ENV'
];

// Define optional but recommended variables
const RECOMMENDED_VARS = [
  'CTA_BUS_API_KEY',
  'CTA_TRAIN_API_KEY',
  'OPENWEATHER_API_KEY',
  'WEATHER_LAT',
  'WEATHER_LON',
  'LIFESTACK_URL',
  'CORS_ORIGIN',
  'TIMEZONE'
];

/**
 * Validate a single environment variable
 */
function validateVar(varName, isRequired = true) {
  const value = process.env[varName];

  if (!value || value.trim() === '') {
    if (isRequired) {
      return {
        valid: false,
        message: `Missing required environment variable: ${varName}`
      };
    } else {
      return {
        valid: true,
        warning: `Optional environment variable not set: ${varName}`
      };
    }
  }

  // Additional validation for specific variables
  switch (varName) {
    case 'PORT':
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return {
          valid: false,
          message: `Invalid PORT value: ${value}. Must be a number between 1 and 65535.`
        };
      }
      break;

    case 'NODE_ENV':
      const validEnvs = ['development', 'production', 'test'];
      if (!validEnvs.includes(value.toLowerCase())) {
        return {
          valid: true,
          warning: `NODE_ENV is '${value}'. Recommended values: ${validEnvs.join(', ')}`
        };
      }
      break;

    case 'WEATHER_LAT':
    case 'WEATHER_LON':
      const coord = parseFloat(value);
      if (isNaN(coord)) {
        return {
          valid: false,
          message: `Invalid ${varName} value: ${value}. Must be a valid coordinate.`
        };
      }
      if (varName === 'WEATHER_LAT' && (coord < -90 || coord > 90)) {
        return {
          valid: false,
          message: `Invalid WEATHER_LAT value: ${value}. Must be between -90 and 90.`
        };
      }
      if (varName === 'WEATHER_LON' && (coord < -180 || coord > 180)) {
        return {
          valid: false,
          message: `Invalid WEATHER_LON value: ${value}. Must be between -180 and 180.`
        };
      }
      break;

    case 'LIFESTACK_URL':
    case 'CORS_ORIGIN':
      // Basic URL validation
      if (!value.startsWith('http://') && !value.startsWith('https://') && value !== '*') {
        return {
          valid: true,
          warning: `${varName} should start with http:// or https://. Current value: ${value}`
        };
      }
      break;
  }

  return { valid: true };
}

/**
 * Validate all environment variables
 */
function validateEnvironment() {
  const results = {
    valid: true,
    errors: [],
    warnings: []
  };

  logger.info('Validating environment variables...');

  // Validate required variables
  REQUIRED_VARS.forEach(varName => {
    const result = validateVar(varName, true);
    if (!result.valid) {
      results.valid = false;
      results.errors.push(result.message);
      logger.error(result.message);
    }
  });

  // Validate recommended variables
  RECOMMENDED_VARS.forEach(varName => {
    const result = validateVar(varName, false);
    if (result.warning) {
      results.warnings.push(result.warning);
      logger.warn(result.warning);
    } else if (!result.valid) {
      results.warnings.push(result.message);
      logger.warn(result.message);
    }
  });

  // Summary
  if (results.valid) {
    if (results.warnings.length > 0) {
      logger.warn(`Environment validation passed with ${results.warnings.length} warning(s)`);
    } else {
      logger.info('Environment validation passed');
    }
  } else {
    logger.error(`Environment validation failed with ${results.errors.length} error(s)`);
  }

  return results;
}

/**
 * Validate environment and exit if critical errors
 */
function validateAndExit() {
  const results = validateEnvironment();

  if (!results.valid) {
    logger.error('Cannot start server due to missing required environment variables');
    logger.error('Please check .env.example for required configuration');
    process.exit(1);
  }

  return results;
}

/**
 * Get environment summary
 */
function getEnvironmentSummary() {
  return {
    nodeEnv: process.env.NODE_ENV || 'not set',
    port: process.env.PORT || 'not set',
    corsOrigin: process.env.CORS_ORIGIN || 'not set',
    timezone: process.env.TIMEZONE || 'not set',
    hasCtaBusKey: !!process.env.CTA_BUS_API_KEY,
    hasCtaTrainKey: !!process.env.CTA_TRAIN_API_KEY,
    hasWeatherKey: !!process.env.OPENWEATHER_API_KEY,
    lifestackUrl: process.env.LIFESTACK_URL || 'not set'
  };
}

module.exports = {
  validateEnvironment,
  validateAndExit,
  getEnvironmentSummary
};
