const axios = require('axios');
const logger = require('../utils/logger');

const GIPHY_API_BASE = 'https://api.giphy.com/v1/gifs';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

/**
 * Search for cinemagraph GIFs on GIPHY
 * @param {number} limit - Number of results to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Array of cinemagraph objects
 */
async function searchCinemagraphs(limit = 50, offset = 0) {
  if (!GIPHY_API_KEY || GIPHY_API_KEY === 'your_giphy_api_key_here') {
    logger.warn('GIPHY API key not configured, skipping cinemagraph fetch');
    return [];
  }

  try {
    const response = await axios.get(`${GIPHY_API_BASE}/search`, {
      params: {
        api_key: GIPHY_API_KEY,
        q: 'cinemagraph',
        limit,
        offset,
        rating: 'g', // Family-friendly content only
        lang: 'en'
      },
      timeout: 10000
    });

    const gifs = response.data?.data || [];
    logger.debug(`GIPHY API returned ${gifs.length} cinemagraphs`);

    return gifs;
  } catch (error) {
    logger.error(`GIPHY API error: ${error.message}`);
    throw error;
  }
}

/**
 * Get a random cinemagraph with specific orientation
 * @param {string} orientation - 'portrait', 'landscape', or null for any
 * @returns {Promise<Object>} Normalized cinemagraph object
 */
async function getRandomCinemagraph(orientation = null) {
  // Fetch a batch of cinemagraphs with random offset
  const randomOffset = Math.floor(Math.random() * 500); // GIPHY has thousands of cinemagraphs
  const gifs = await searchCinemagraphs(50, randomOffset);

  if (!gifs.length) {
    throw new Error('No cinemagraphs returned from GIPHY');
  }

  // Filter by orientation if specified
  let filteredGifs = gifs;
  if (orientation) {
    filteredGifs = gifs.filter(gif => {
      const width = parseInt(gif.images?.original?.width);
      const height = parseInt(gif.images?.original?.height);

      if (!width || !height) return false;

      if (orientation === 'portrait' && height > width) return true;
      if (orientation === 'landscape' && width > height) return true;
      if (orientation === 'tv' && width > height) return true; // TV uses landscape

      return false;
    });
  }

  // If no matches, use all gifs
  if (!filteredGifs.length) {
    logger.debug(`No ${orientation} cinemagraphs found, using any orientation`);
    filteredGifs = gifs;
  }

  // Pick a random one
  const randomGif = filteredGifs[Math.floor(Math.random() * filteredGifs.length)];

  return normalizeCinemagraph(randomGif, orientation);
}

/**
 * Normalize GIPHY data to match our artwork structure
 * @param {Object} gif - GIPHY gif object
 * @param {string} requestedOrientation - The orientation that was requested
 * @returns {Object} Normalized artwork object
 */
function normalizeCinemagraph(gif, requestedOrientation) {
  const width = parseInt(gif.images?.original?.width);
  const height = parseInt(gif.images?.original?.height);

  // Determine actual orientation
  let actualOrientation = null;
  if (width && height) {
    if (height > width) {
      actualOrientation = 'portrait';
    } else if (width > height) {
      actualOrientation = 'landscape';
    }
  }

  // Use requested orientation if actual couldn't be determined
  const orientation = actualOrientation || requestedOrientation;

  return {
    // Provide multiple format options for maximum compatibility
    imageUrl: gif.images?.original?.url, // GIF fallback
    videoUrl: gif.images?.original?.mp4, // MP4 for modern browsers
    webpUrl: gif.images?.original?.webp, // WebP alternative
    gifUrl: gif.images?.original?.url,   // Original GIF
    stillUrl: gif.images?.original_still?.url,
    title: gif.title || 'Cinemagraph',
    artist: gif.username || 'GIPHY User',
    date: gif.import_datetime ? new Date(gif.import_datetime).getFullYear().toString() : 'Recent',
    id: gif.id,
    style: 'Cinemagraph',
    orientation,
    source: 'giphy',
    type: 'cinemagraph',
    isVideo: true // Flag to tell frontend to use video tag
  };
}

/**
 * Check if GIPHY API is configured
 * @returns {boolean}
 */
function isConfigured() {
  return !!(GIPHY_API_KEY && GIPHY_API_KEY !== 'your_giphy_api_key_here');
}

module.exports = {
  searchCinemagraphs,
  getRandomCinemagraph,
  isConfigured
};
