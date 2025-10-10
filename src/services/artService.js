const axios = require('axios');
const logger = require('../utils/logger');
const cacheManager = require('../utils/cacheManager');

// Art Institute of Chicago API
const ART_API_BASE = 'https://api.artic.edu/api/v1';
const IIIF_BASE = 'https://www.artic.edu/iiif/2';

// Cache TTL for artwork (1 hour as specified)
const ARTWORK_CACHE_TTL = 3600; // 1 hour in seconds

// Rotation intervals
const ROTATION_INTERVAL_CENTER = 300; // 5 minutes in seconds (for portrait/center)
const ROTATION_INTERVAL_RIGHT = 420; // 7 minutes in seconds (for landscape/right)

// Retry delay (500ms as specified)
const RETRY_DELAY = 500;

// Fallback artwork data
const FALLBACK_ARTWORK = null;

// Request headers for Art Institute API
const API_HEADERS = {
  'User-Agent': 'Dashboard-App/1.0 (contact@example.com)',
  'Accept': 'application/json'
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch random artwork from Art Institute API using pagination fallback
 * @param {string} orientation - 'portrait' or 'landscape'
 */
async function fetchRandomArtwork(orientation = null) {
  try {
    // Use pagination to get random artworks (more reliable than search)
    const randomPage = Math.floor(Math.random() * 200) + 1;

    logger.debug(`Fetching ${orientation || 'any'} artworks from page ${randomPage}`);

    const response = await axios.get(`${ART_API_BASE}/artworks`, {
      params: {
        page: randomPage,
        limit: 100,
        fields: 'id,title,artist_display,date_display,image_id,thumbnail'
      },
      headers: API_HEADERS,
      timeout: 10000
    });

    logger.debug(`API response status: ${response.status}`);

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      logger.error('No artworks found in API response');
      throw new Error('No artworks found in API response');
    }

    // Filter artworks that have image_id
    let artworksWithImages = response.data.data.filter(art => art.image_id);

    if (artworksWithImages.length === 0) {
      logger.warn('No artworks with images found on this page, trying again');
      throw new Error('No artworks with images found');
    }

    // Filter by orientation if specified
    if (orientation) {
      const orientationFiltered = artworksWithImages.filter(art => {
        if (!art.thumbnail) return false;

        const width = art.thumbnail.width;
        const height = art.thumbnail.height;

        if (!width || !height) return false;

        if (orientation === 'portrait') {
          return height > width; // Portrait: height > width
        } else if (orientation === 'landscape') {
          return width > height; // Landscape: width > height
        }

        return true;
      });

      if (orientationFiltered.length > 0) {
        artworksWithImages = orientationFiltered;
        logger.debug(`Filtered to ${artworksWithImages.length} ${orientation} artworks`);
      } else {
        logger.warn(`No ${orientation} artworks found, using any orientation`);
      }
    }

    // Pick a random artwork from the results
    const randomIndex = Math.floor(Math.random() * artworksWithImages.length);
    const artwork = artworksWithImages[randomIndex];

    logger.debug(`Selected artwork: ${artwork.title} (ID: ${artwork.id})`);

    // Validate image_id before formatting
    if (!artwork.image_id) {
      throw new Error('Selected artwork missing image_id');
    }

    return formatArtwork(artwork);
  } catch (error) {
    if (error.response) {
      logger.error(`Art Institute API error: ${error.response.status} - ${error.response.statusText}`);
      logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
    } else {
      logger.error(`Error fetching random artwork: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Format artwork data for dashboard
 */
function formatArtwork(data) {
  try {
    if (!data.image_id) {
      throw new Error('Artwork missing image_id');
    }

    // Build IIIF image URL (843px width as specified)
    const imageUrl = `${IIIF_BASE}/${data.image_id}/full/843,/0/default.jpg`;

    return {
      imageUrl,
      title: data.title || 'Untitled',
      artist: data.artist_display || 'Unknown Artist',
      date: data.date_display || 'Unknown Date',
      id: data.id.toString()
    };
  } catch (error) {
    logger.error(`Error formatting artwork data: ${error.message}`);
    throw error;
  }
}

/**
 * Get current artwork with rotation logic by orientation
 * - Caches artwork for 1 hour (to avoid rate limits)
 * - Rotates based on orientation-specific intervals
 * @param {string} orientation - 'portrait' for center canvas, 'landscape' for right canvas
 */
async function getArtworkByOrientation(orientation) {
  try {
    // Determine rotation interval based on orientation
    const rotationInterval = orientation === 'portrait'
      ? ROTATION_INTERVAL_CENTER
      : ROTATION_INTERVAL_RIGHT;

    // Check if we have a rotation slot
    const now = Date.now();
    const rotationSlot = Math.floor(now / (rotationInterval * 1000));
    const cacheKey = `artwork:rotation:${orientation}:${rotationSlot}`;

    // Try to get artwork for current rotation slot
    return await cacheManager.getOrSet(
      cacheKey,
      async () => {
        // Check if we have cached artworks pool for this orientation
        const poolKey = `artwork:pool:${orientation}`;
        let artworkPool = cacheManager.get(poolKey);

        if (!artworkPool || artworkPool.length === 0) {
          // Fetch multiple artworks to create a pool
          logger.info(`Fetching new ${orientation} artwork pool`);
          artworkPool = await fetchArtworkPool(12, orientation);

          // Cache the pool for 1 hour
          cacheManager.set(poolKey, artworkPool, ARTWORK_CACHE_TTL);
        }

        // Get artwork for current rotation from pool
        const poolIndex = rotationSlot % artworkPool.length;
        const artwork = artworkPool[poolIndex];

        logger.info(`Serving ${orientation} artwork: ${artwork.title} (rotation slot: ${rotationSlot})`);
        return artwork;
      },
      rotationInterval
    );
  } catch (error) {
    logger.error(`Error getting ${orientation} artwork: ${error.message}`);

    // Try to return cached artwork if available
    const poolKey = `artwork:pool:${orientation}`;
    const cachedPool = cacheManager.get(poolKey);

    if (cachedPool && cachedPool.length > 0) {
      logger.warn(`Returning cached ${orientation} artwork from pool due to error`);
      return cachedPool[0];
    }

    // Return fallback
    logger.warn(`Returning fallback ${orientation} artwork data`);
    return FALLBACK_ARTWORK;
  }
}

/**
 * Get both artworks (center portrait and right landscape)
 */
async function getCurrentArtwork() {
  try {
    const [artworkCenter, artworkRight] = await Promise.all([
      getArtworkByOrientation('portrait'),
      getArtworkByOrientation('landscape')
    ]);

    return {
      artworkCenter,
      artworkRight
    };
  } catch (error) {
    logger.error(`Error getting current artworks: ${error.message}`);
    return {
      artworkCenter: FALLBACK_ARTWORK,
      artworkRight: FALLBACK_ARTWORK
    };
  }
}

/**
 * Fetch a pool of artworks for rotation
 * @param {number} poolSize - Number of artworks to fetch
 * @param {string} orientation - 'portrait' or 'landscape'
 */
async function fetchArtworkPool(poolSize = 12, orientation = null) {
  const artworks = [];
  const maxAttempts = poolSize * 3; // Try more times to get enough artworks with orientation filter

  for (let attempt = 0; attempt < maxAttempts && artworks.length < poolSize; attempt++) {
    try {
      const artwork = await fetchRandomArtwork(orientation);

      // Avoid duplicates
      if (!artworks.find(a => a.id === artwork.id)) {
        artworks.push(artwork);
        logger.debug(`Added ${orientation || 'any'} artwork to pool: ${artwork.title} (${artworks.length}/${poolSize})`);
      }

      // Add delay between requests to respect rate limits
      if (artworks.length < poolSize) {
        await sleep(RETRY_DELAY);
      }
    } catch (error) {
      logger.warn(`Failed to fetch ${orientation || 'any'} artwork for pool (attempt ${attempt + 1}): ${error.message}`);

      // Add delay before retry
      await sleep(RETRY_DELAY);

      // If we've tried many times and have at least some artworks, continue
      if (attempt > poolSize && artworks.length > 0) {
        break;
      }
    }
  }

  if (artworks.length === 0) {
    throw new Error(`Failed to fetch any ${orientation || ''} artworks for pool`);
  }

  logger.info(`Created ${orientation || 'any'} artwork pool with ${artworks.length} artworks`);
  return artworks;
}

/**
 * Refresh artwork pools (can be called manually or by scheduler)
 */
async function refreshArtworkPool() {
  try {
    logger.info('Refreshing artwork pools');

    // Refresh both portrait and landscape pools
    const [portraitPool, landscapePool] = await Promise.all([
      fetchArtworkPool(12, 'portrait'),
      fetchArtworkPool(12, 'landscape')
    ]);

    cacheManager.set('artwork:pool:portrait', portraitPool, ARTWORK_CACHE_TTL);
    cacheManager.set('artwork:pool:landscape', landscapePool, ARTWORK_CACHE_TTL);

    logger.info('Artwork pools refreshed successfully');
    return {
      success: true,
      portraitPoolSize: portraitPool.length,
      landscapePoolSize: landscapePool.length
    };
  } catch (error) {
    logger.error(`Error refreshing artwork pools: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getCurrentArtwork,
  refreshArtworkPool
};
