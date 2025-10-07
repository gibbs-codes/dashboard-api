const morgan = require('morgan');
const logger = require('../utils/logger');

/**
 * Custom token for response time in seconds
 */
morgan.token('response-time-sec', (req, res) => {
  const responseTime = parseFloat(morgan['response-time'](req, res));
  return (responseTime / 1000).toFixed(3);
});

/**
 * Custom format string for morgan
 */
const format = process.env.NODE_ENV === 'development'
  ? ':method :url :status :response-time ms - :res[content-length]'
  : ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

/**
 * Stream object to write logs to our custom logger
 */
const stream = {
  write: (message) => {
    // Remove trailing newline
    logger.http(message.trim());
  }
};

/**
 * Request logger middleware using morgan
 */
const requestLogger = morgan(format, { stream });

module.exports = requestLogger;
