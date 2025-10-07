const NodeCache = require('node-cache');
const logger = require('./logger');
const cacheConfig = require('../../config/cache');

/**
 * CacheManager - Wrapper around node-cache with TTL support and utilities
 */
class CacheManager {
  constructor(options = {}) {
    const defaultOptions = {
      stdTTL: cacheConfig.default.ttl,
      checkperiod: cacheConfig.checkPeriod,
      useClones: cacheConfig.options.useClones,
      deleteOnExpire: cacheConfig.options.deleteOnExpire
    };

    this.cache = new NodeCache({ ...defaultOptions, ...options });

    // Setup event listeners
    this.cache.on('set', (key, value) => {
      logger.debug(`Cache SET: ${key}`);
    });

    this.cache.on('del', (key, value) => {
      logger.debug(`Cache DEL: ${key}`);
    });

    this.cache.on('expired', (key, value) => {
      logger.debug(`Cache EXPIRED: ${key}`);
    });

    logger.info('Cache Manager initialized');
  }

  /**
   * Get value from cache
   */
  get(key) {
    try {
      const value = this.cache.get(key);
      if (value === undefined) {
        logger.debug(`Cache MISS: ${key}`);
        return null;
      }
      logger.debug(`Cache HIT: ${key}`);
      return value;
    } catch (err) {
      logger.error(`Cache GET error for key ${key}: ${err.message}`);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  set(key, value, ttl = null) {
    try {
      const success = ttl
        ? this.cache.set(key, value, ttl)
        : this.cache.set(key, value);

      if (success) {
        logger.debug(`Cache SET success: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
      }
      return success;
    } catch (err) {
      logger.error(`Cache SET error for key ${key}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  del(key) {
    try {
      const count = this.cache.del(key);
      return count > 0;
    } catch (err) {
      logger.error(`Cache DEL error for key ${key}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete multiple keys from cache
   */
  delMultiple(keys) {
    try {
      const count = this.cache.del(keys);
      logger.debug(`Cache deleted ${count} keys`);
      return count;
    } catch (err) {
      logger.error(`Cache DEL multiple error: ${err.message}`);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Get TTL for a key
   */
  getTtl(key) {
    try {
      return this.cache.getTtl(key);
    } catch (err) {
      logger.error(`Cache getTTL error for key ${key}: ${err.message}`);
      return null;
    }
  }

  /**
   * Get all keys in cache
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * Flush all cache entries
   */
  flush() {
    try {
      this.cache.flushAll();
      logger.info('Cache flushed');
      return true;
    } catch (err) {
      logger.error(`Cache FLUSH error: ${err.message}`);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  async getOrSet(key, fetchFunction, ttl = null) {
    try {
      // Try to get from cache first
      let value = this.get(key);

      if (value !== null) {
        return value;
      }

      // If not in cache, execute fetch function
      logger.debug(`Cache MISS, fetching: ${key}`);
      value = await fetchFunction();

      // Store in cache
      if (value !== null && value !== undefined) {
        this.set(key, value, ttl);
      }

      return value;
    } catch (err) {
      logger.error(`Cache getOrSet error for key ${key}: ${err.message}`);
      throw err;
    }
  }
}

// Export singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
