const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Lifestack HTTP Client
 * Connects to Lifestack API for calendar and task data
 * No caching - Lifestack handles caching internally
 */

// Get Lifestack URL from environment
const LIFESTACK_BASE_URL = process.env.LIFESTACK_URL || 'http://localhost:3000';

// Request timeout
const REQUEST_TIMEOUT = 5000;

/**
 * Create axios instance for Lifestack API
 */
const lifestackApi = axios.create({
  baseURL: LIFESTACK_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Get today's complete data from Lifestack
 */
async function getTodayData() {
  try {
    logger.debug('Fetching today data from Lifestack');

    const response = await lifestackApi.get('/api/today');

    logger.debug('Successfully fetched today data from Lifestack');

    return response.data;
  } catch (error) {
    logger.error(`Error fetching today data from Lifestack: ${error.message}`);

    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.warn('Lifestack API is not reachable. Is it running?');
    }

    // Return empty fallback data
    return {
      events: [],
      tasks: [],
      timestamp: new Date().toISOString(),
      error: true,
      errorMessage: 'Unable to connect to Lifestack API'
    };
  }
}

/**
 * Get today's events from Lifestack
 */
async function getTodayEvents() {
  try {
    logger.debug('Fetching today events from Lifestack');

    const response = await lifestackApi.get('/api/today/events');

    logger.debug('Successfully fetched today events from Lifestack');

    return response.data;
  } catch (error) {
    logger.error(`Error fetching today events from Lifestack: ${error.message}`);

    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.warn('Lifestack API is not reachable. Is it running?');
    }

    // Return empty array fallback
    return [];
  }
}

/**
 * Get tasks from Lifestack
 */
async function getTasks() {
  try {
    logger.debug('Fetching tasks from Lifestack');

    const response = await lifestackApi.get('/api/tasks');

    logger.debug('Successfully fetched tasks from Lifestack');

    return response.data;
  } catch (error) {
    logger.error(`Error fetching tasks from Lifestack: ${error.message}`);

    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.warn('Lifestack API is not reachable. Is it running?');
    }

    // Return empty array fallback
    return [];
  }
}

/**
 * Health check for Lifestack API
 */
async function healthCheck() {
  try {
    const response = await lifestackApi.get('/health', {
      timeout: 2000
    });

    return {
      status: 'healthy',
      lifestackUrl: LIFESTACK_BASE_URL,
      data: response.data
    };
  } catch (error) {
    logger.error(`Lifestack health check failed: ${error.message}`);

    return {
      status: 'unhealthy',
      lifestackUrl: LIFESTACK_BASE_URL,
      error: error.message,
      code: error.code
    };
  }
}

module.exports = {
  getTodayData,
  getTodayEvents,
  getTasks,
  healthCheck
};
