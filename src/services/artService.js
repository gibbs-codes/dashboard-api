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
const ROTATION_INTERVAL_TV = 360; // 6 minutes in seconds (for TV landscape)

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
 * Fetch random artwork from Art Institute API using search by style
 * @param {string} orientation - 'portrait' or 'landscape'
 * @param {object} filters - Optional filters (styles: array of style names)
 */
async function fetchRandomArtwork(orientation = null, filters = {}) {
  try {
    // Select a random style from the provided styles, or use default
    const styles = filters.styles || ['Cubism', 'Expressionism', 'Surrealism', 'Abstract', 'Minimalism', 'Constructivism', 'Symbolism', 'Suprematism', 'Bauhaus'];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];

    logger.debug(`Searching for ${randomStyle} ${orientation || 'any'} artworks`);

    const response = await axios.get(`${ART_API_BASE}/artworks/search`, {
      params: {
        q: `${randomStyle} painting`,
        fields: 'id,title,artist_display,date_display,image_id,thumbnail',
        limit: 100
      },
      headers: API_HEADERS,
      timeout: 10000
    });

    logger.debug(`API response status: ${response.status}`);

    if (!response.data || !response.data.data || response.data.data.length === 0) {
      logger.warn(`No artworks found for style: ${randomStyle}`);
      throw new Error('No artworks found in API response');
    }

    logger.debug(`Found ${response.data.data.length} artworks for style: ${randomStyle}`);

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

    logger.debug(`Selected ${randomStyle} artwork: ${artwork.title} (ID: ${artwork.id})`);

    // Validate image_id before formatting
    if (!artwork.image_id) {
      throw new Error('Selected artwork missing image_id');
    }

    return formatArtwork(artwork, randomStyle);
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
function formatArtwork(data, style = null) {
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
      id: data.id.toString(),
      style: style || 'Unknown Style'
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
 * @param {string} orientation - 'portrait' for center canvas, 'landscape' for right canvas, 'tv' for TV display
 * @param {object} filters - Optional filters (styles, etc.)
 */
async function getArtworkByOrientation(orientation, filters = {}) {
  try {
    // Determine rotation interval based on orientation
    let rotationInterval;
    if (orientation === 'portrait') {
      rotationInterval = ROTATION_INTERVAL_CENTER;
    } else if (orientation === 'tv') {
      rotationInterval = ROTATION_INTERVAL_TV;
    } else {
      rotationInterval = ROTATION_INTERVAL_RIGHT;
    }

    // Check if we have a rotation slot
    const now = Date.now();
    const rotationSlot = Math.floor(now / (rotationInterval * 1000));
    const filterKey = filters.styles ? `:${filters.styles.join('-')}` : '';
    const cacheKey = `artwork:rotation:${orientation}${filterKey}:${rotationSlot}`;

    // Try to get artwork for current rotation slot
    return await cacheManager.getOrSet(
      cacheKey,
      async () => {
        // Check if we have cached artworks pool for this orientation
        const poolKey = `artwork:pool:${orientation}${filterKey}`;
        let artworkPool = cacheManager.get(poolKey);

        if (!artworkPool || artworkPool.length === 0) {
          // Fetch multiple artworks to create a pool
          logger.info(`Fetching new ${orientation} artwork pool with filters: ${JSON.stringify(filters)}`);
          artworkPool = await fetchArtworkPool(12, orientation, filters);

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
    const filterKey = filters.styles ? `:${filters.styles.join('-')}` : '';
    const poolKey = `artwork:pool:${orientation}${filterKey}`;
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
 * Get all three artworks (center portrait, right landscape, and TV landscape)
 * @param {object} filters - Optional filters (styles, etc.)
 */
async function getCurrentArtwork(filters = {}) {
  try {
    const [artworkCenter, artworkRight, artworkTV] = await Promise.all([
      getArtworkByOrientation('portrait', filters),
      getArtworkByOrientation('landscape', filters),
      getArtworkByOrientation('tv', filters) // TV uses its own rotation schedule
    ]);

    return {
      artworkCenter,
      artworkRight,
      artworkTV
    };
  } catch (error) {
    logger.error(`Error getting current artworks: ${error.message}`);
    return {
      artworkCenter: FALLBACK_ARTWORK,
      artworkRight: FALLBACK_ARTWORK,
      artworkTV: FALLBACK_ARTWORK
    };
  }
}

/**
 * Fetch a pool of artworks for rotation
 * @param {number} poolSize - Number of artworks to fetch
 * @param {string} orientation - 'portrait' or 'landscape'
 * @param {object} filters - Optional filters (artworkTypes, etc.)
 */
async function fetchArtworkPool(poolSize = 12, orientation = null, filters = {}) {
  const artworks = [];
  const maxAttempts = poolSize * 3; // Try more times to get enough artworks with orientation filter

  for (let attempt = 0; attempt < maxAttempts && artworks.length < poolSize; attempt++) {
    try {
      const artwork = await fetchRandomArtwork(orientation, filters);

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
 * @param {object} filters - Optional filters (artworkTypes, etc.)
 */
async function refreshArtworkPool(filters = {}) {
  try {
    logger.info('Refreshing artwork pools');

    // Refresh portrait, landscape, and TV pools
    const [portraitPool, landscapePool, tvPool] = await Promise.all([
      fetchArtworkPool(12, 'portrait', filters),
      fetchArtworkPool(12, 'landscape', filters),
      fetchArtworkPool(12, 'tv', filters)
    ]);

    const filterKey = filters.styles ? `:${filters.styles.join('-')}` : '';
    cacheManager.set(`artwork:pool:portrait${filterKey}`, portraitPool, ARTWORK_CACHE_TTL);
    cacheManager.set(`artwork:pool:landscape${filterKey}`, landscapePool, ARTWORK_CACHE_TTL);
    cacheManager.set(`artwork:pool:tv${filterKey}`, tvPool, ARTWORK_CACHE_TTL);

    logger.info('Artwork pools refreshed successfully');
    return {
      success: true,
      portraitPoolSize: portraitPool.length,
      landscapePoolSize: landscapePool.length,
      tvPoolSize: tvPool.length
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
