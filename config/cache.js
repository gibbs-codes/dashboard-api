/**
 * Cache Configuration
 * Centralized TTL (Time To Live) configurations for all cached data
 * All values are in seconds
 */

module.exports = {
  // Transit data cache configuration
  transit: {
    ttl: 30,  // 30 seconds - transit data changes frequently
    description: 'CTA Bus and Train arrival predictions'
  },

  // Weather data cache configuration
  weather: {
    ttl: 600,  // 10 minutes - weather changes less frequently
    description: 'Current weather and forecast data'
  },

  // Lifestack data cache configuration
  lifestack: {
    ttl: 0,  // No caching - Lifestack handles its own caching
    description: 'Calendar events and tasks from Lifestack API'
  },

  // Dashboard aggregation cache (currently not used, but available)
  dashboard: {
    ttl: 30,  // 30 seconds - same as transit for consistency
    description: 'Full dashboard aggregated data'
  },

  // Default cache TTL (from environment or fallback)
  default: {
    ttl: parseInt(process.env.CACHE_TTL) || 300,  // 5 minutes default
    description: 'Default cache TTL for miscellaneous data'
  },

  // Cache check period (how often to check for expired keys)
  checkPeriod: 60,  // 1 minute

  // Cache options
  options: {
    useClones: false,  // Better performance, but objects are mutable
    deleteOnExpire: true  // Automatically delete expired keys
  }
};
