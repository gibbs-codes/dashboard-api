/**
 * Simple console-based logger with different log levels
 * Can be replaced with Winston or other logging libraries later
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  HTTP: 'HTTP',
  DEBUG: 'DEBUG'
};

const COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  HTTP: '\x1b[35m',  // Magenta
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m'
};

/**
 * Format log message with timestamp and level
 */
function formatMessage(level, message) {
  const timestamp = new Date().toISOString();
  const color = COLORS[level] || COLORS.RESET;
  return `${color}[${timestamp}] [${level}]${COLORS.RESET} ${formatContent(message)}`;
}

/**
 * Format message content (handle objects, errors, etc.)
 */
function formatContent(content) {
  if (content instanceof Error) {
    return `${content.message}\n${content.stack}`;
  }
  if (typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }
  return content;
}

/**
 * Log at a specific level
 */
function log(level, message) {
  const formattedMessage = formatMessage(level, message);

  switch (level) {
    case LOG_LEVELS.ERROR:
      console.error(formattedMessage);
      break;
    case LOG_LEVELS.WARN:
      console.warn(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
  }
}

/**
 * Logger object with methods for each log level
 */
const logger = {
  error: (message) => log(LOG_LEVELS.ERROR, message),
  warn: (message) => log(LOG_LEVELS.WARN, message),
  info: (message) => log(LOG_LEVELS.INFO, message),
  http: (message) => log(LOG_LEVELS.HTTP, message),
  debug: (message) => {
    if (process.env.NODE_ENV === 'development') {
      log(LOG_LEVELS.DEBUG, message);
    }
  }
};

module.exports = logger;
