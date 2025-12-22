const axios = require('axios');
const logger = require('../utils/logger');
const cacheManager = require('../utils/cacheManager');
const artConfig = require('../../config/art');

const ART_API_BASE = 'https://api.artic.edu/api/v1';
const ART_IIIF_BASE = 'https://www.artic.edu/iiif/2';
const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const CLEVELAND_API_BASE = 'https://openaccess-api.clevelandart.org/api';

const ARTWORK_CACHE_TTL = artConfig.poolTtlSeconds || 3600;
const POOL_SIZE = artConfig.poolSize || 12;
const RETRY_DELAY = artConfig.retryDelayMs || 500;
const ROTATION_INTERVALS = artConfig.rotationIntervals || {
  portrait: 300,
  landscape: 420,
  tv: 360
};

const FALLBACK_ARTWORK = null;

const DEFAULT_HEADERS = {
  'User-Agent': 'Dashboard-App/1.0 (contact@example.com)',
  Accept: 'application/json'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function deriveOrientation(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) {
    return null;
  }
  if (h > w) return 'portrait';
  if (w > h) return 'landscape';
  return null;
}

function pickWeightedSource(sourceEntries) {
  const totalWeight = sourceEntries.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = Math.random() * totalWeight;
  let cursor = 0;
  for (const entry of sourceEntries) {
    cursor += entry.weight;
    if (roll <= cursor) return entry.key;
  }
  return sourceEntries[0]?.key;
}

function normalizeArtic(artwork, style) {
  const imageUrl = `${ART_IIIF_BASE}/${artwork.image_id}/full/843,/0/default.jpg`;
  const orientation = artwork.thumbnail
    ? deriveOrientation(artwork.thumbnail.width, artwork.thumbnail.height)
    : null;

  return {
    imageUrl,
    title: artwork.title || 'Untitled',
    artist: artwork.artist_display || 'Unknown Artist',
    date: artwork.date_display || 'Unknown Date',
    id: artwork.id?.toString(),
    style: style || 'Unknown Style',
    orientation,
    source: 'artic'
  };
}

async function fetchFromArtic(orientation, filters = {}) {
  const sourceConfig = artConfig.sources.artic || {};
  const styles = filters.styles || sourceConfig.styles || [
    'Cubism',
    'Expressionism',
    'Surrealism',
    'Abstract',
    'Minimalism',
    'Constructivism',
    'Symbolism',
    'Suprematism',
    'Bauhaus'
  ];
  const randomStyle = randomItem(styles);

  const response = await axios.get(`${ART_API_BASE}/artworks/search`, {
    params: {
      q: `${randomStyle} painting`,
      fields: 'id,title,artist_display,date_display,image_id,thumbnail',
      limit: 100
    },
    headers: DEFAULT_HEADERS,
    timeout: 10000
  });

  const candidates = (response.data?.data || []).filter(item => item.image_id);
  if (!candidates.length) {
    throw new Error('Artic: no artworks with images returned');
  }

  const filtered = orientation
    ? candidates.filter(item => {
        if (!item.thumbnail) return false;
        const ori = deriveOrientation(item.thumbnail.width, item.thumbnail.height);
        return ori === orientation;
      })
    : candidates;

  const pick = randomItem(filtered.length ? filtered : candidates);
  if (!pick) throw new Error('Artic: failed to pick artwork');

  return normalizeArtic(pick, randomStyle);
}

function normalizeMet(object) {
  const width = object.measurements?.[0]?.elementMeasurements?.Width;
  const height = object.measurements?.[0]?.elementMeasurements?.Height;
  return {
    imageUrl: object.primaryImageSmall || object.primaryImage,
    title: object.title || 'Untitled',
    artist: object.artistDisplayName || 'Unknown Artist',
    date: object.objectDate || object.objectBeginDate || 'Unknown Date',
    id: object.objectID?.toString(),
    style: object.classification || object.department || 'Unknown Style',
    orientation: deriveOrientation(width, height),
    source: 'met'
  };
}

async function fetchFromMet(orientation, filters = {}) {
  const sourceConfig = artConfig.sources.met || {};
  const departments = sourceConfig.departments || [];
  const searchTerm = filters.styles ? randomItem(filters.styles) : 'painting';
  const searchParams = {
    q: searchTerm,
    hasImages: sourceConfig.hasImages !== false
  };
  if (departments.length) {
    searchParams.departmentId = randomItem(departments);
  }

  const search = await axios.get(`${MET_API_BASE}/search`, {
    params: searchParams,
    headers: DEFAULT_HEADERS,
    timeout: 10000
  });

  const ids = search.data?.objectIDs || [];
  if (!ids.length) {
    throw new Error('Met: no objects returned for query');
  }

  const attempts = Math.min(10, ids.length);
  for (let i = 0; i < attempts; i++) {
    const objectId = ids[Math.floor(Math.random() * ids.length)];
    const objectRes = await axios.get(`${MET_API_BASE}/objects/${objectId}`, {
      headers: DEFAULT_HEADERS,
      timeout: 10000
    });
    const object = objectRes.data;
    if (!object || !(object.primaryImage || object.primaryImageSmall)) continue;

    const normalized = normalizeMet(object);
    if (orientation && normalized.orientation && normalized.orientation !== orientation) {
      continue;
    }

    return normalized;
  }

  throw new Error('Met: unable to find image matching orientation');
}

function normalizeCleveland(item) {
  const image =
    item.images?.web?.url ||
    item.images?.print?.url ||
    item.images?.digital?.url ||
    item.images?.tiny?.url;
  const width = item.images?.web?.width || item.images?.print?.width;
  const height = item.images?.web?.height || item.images?.print?.height;

  return {
    imageUrl: image,
    title: item.title || 'Untitled',
    artist:
      (item.creators || [])
        .map(c => c.description || c.role || c.name)
        .filter(Boolean)
        .join(', ') || item.creator || 'Unknown Artist',
    date: item.creation_date || item.creation_date_earliest || 'Unknown Date',
    id: item.id?.toString(),
    style: item.department || item.type || 'Unknown Style',
    orientation: deriveOrientation(width, height),
    source: 'cleveland'
  };
}

async function fetchFromCleveland(orientation, filters = {}) {
  const sourceConfig = artConfig.sources.cleveland || {};
  const searchTerm = filters.styles ? randomItem(filters.styles) : null;
  const params = {
    has_image: 1,
    limit: 50
  };
  if (sourceConfig.type) params.type = sourceConfig.type;
  if (searchTerm) params.q = searchTerm;

  const response = await axios.get(`${CLEVELAND_API_BASE}/artworks`, {
    params,
    headers: DEFAULT_HEADERS,
    timeout: 10000
  });

  const candidates = response.data?.data?.filter(item => item.images) || [];
  if (!candidates.length) {
    throw new Error('Cleveland: no artworks with images returned');
  }

  const filtered = orientation
    ? candidates.filter(item => {
        const width = item.images?.web?.width || item.images?.print?.width;
        const height = item.images?.web?.height || item.images?.print?.height;
        const ori = deriveOrientation(width, height);
        return !ori || ori === orientation;
      })
    : candidates;

  const pick = randomItem(filtered.length ? filtered : candidates);
  if (!pick) throw new Error('Cleveland: failed to pick artwork');

  const normalized = normalizeCleveland(pick);
  if (!normalized.imageUrl) {
    throw new Error('Cleveland: selected artwork missing image url');
  }

  return normalized;
}

async function fetchFromSource(sourceKey, orientation, filters) {
  switch (sourceKey) {
    case 'artic':
      return fetchFromArtic(orientation, filters);
    case 'met':
      return fetchFromMet(orientation, filters);
    case 'cleveland':
      return fetchFromCleveland(orientation, filters);
    default:
      throw new Error(`Unknown art source: ${sourceKey}`);
  }
}

function enabledSources() {
  return Object.entries(artConfig.sources || {})
    .filter(([, cfg]) => cfg.enabled)
    .map(([key, cfg]) => ({ key, weight: cfg.weight || 1 }));
}

async function fetchArtworkPool(poolSize = POOL_SIZE, orientation = null, filters = {}) {
  const sources = enabledSources();
  if (!sources.length) {
    throw new Error('No art sources enabled');
  }

  const artworks = [];
  const seen = new Set();
  const maxAttempts = poolSize * 4;

  for (let attempt = 0; attempt < maxAttempts && artworks.length < poolSize; attempt++) {
    const sourceKey = pickWeightedSource(sources);
    try {
      const artwork = await fetchFromSource(sourceKey, orientation, filters);
      const dedupeKey = `${artwork.source}:${artwork.id}`;
      if (!artwork || !artwork.imageUrl || seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      artworks.push(artwork);
      logger.debug(
        `Added ${orientation || 'any'} artwork from ${sourceKey}: ${artwork.title} (${artworks.length}/${poolSize})`
      );
      if (artworks.length < poolSize) {
        await sleep(RETRY_DELAY);
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch ${orientation || 'any'} artwork from ${sourceKey} (attempt ${
          attempt + 1
        }): ${error.message}`
      );
      await sleep(RETRY_DELAY);
    }
  }

  if (!artworks.length) {
    throw new Error(`Failed to fetch any ${orientation || ''} artworks for pool`);
  }

  logger.info(`Created ${orientation || 'any'} artwork pool with ${artworks.length} artworks`);
  return artworks;
}

async function getArtworkByOrientation(orientation, filters = {}) {
  try {
    const rotationInterval = ROTATION_INTERVALS[orientation] || ROTATION_INTERVALS.landscape;
    const now = Date.now();
    const rotationSlot = Math.floor(now / (rotationInterval * 1000));
    const filterKey = filters.styles ? `:${filters.styles.join('-')}` : '';
    const cacheKey = `artwork:rotation:${orientation}${filterKey}:${rotationSlot}`;

    return await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const poolKey = `artwork:pool:${orientation}${filterKey}`;
        let artworkPool = cacheManager.get(poolKey);

        if (!artworkPool || !artworkPool.length) {
          logger.info(`Fetching new ${orientation} artwork pool with filters: ${JSON.stringify(filters)}`);
          artworkPool = await fetchArtworkPool(POOL_SIZE, orientation, filters);
          cacheManager.set(poolKey, artworkPool, ARTWORK_CACHE_TTL);
        }

        const poolIndex = rotationSlot % artworkPool.length;
        const artwork = artworkPool[poolIndex];
        logger.info(`Serving ${orientation} artwork from pool slot ${poolIndex} (rotation slot: ${rotationSlot})`);
        return artwork;
      },
      rotationInterval
    );
  } catch (error) {
    logger.error(`Error getting ${orientation} artwork: ${error.message}`);
    const filterKey = filters.styles ? `:${filters.styles.join('-')}` : '';
    const poolKey = `artwork:pool:${orientation}${filterKey}`;
    const cachedPool = cacheManager.get(poolKey);

    if (cachedPool && cachedPool.length > 0) {
      logger.warn(`Returning cached ${orientation} artwork from pool due to error`);
      return cachedPool[0];
    }

    logger.warn(`Returning fallback ${orientation} artwork data`);
    return FALLBACK_ARTWORK;
  }
}

async function getCurrentArtwork(filters = {}) {
  try {
    const [artworkCenter, artworkRight, artworkTV] = await Promise.all([
      getArtworkByOrientation('portrait', filters),
      getArtworkByOrientation('landscape', filters),
      getArtworkByOrientation('tv', filters)
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

async function refreshArtworkPool(filters = {}) {
  try {
    logger.info('Refreshing artwork pools');
    const [portraitPool, landscapePool, tvPool] = await Promise.all([
      fetchArtworkPool(POOL_SIZE, 'portrait', filters),
      fetchArtworkPool(POOL_SIZE, 'landscape', filters),
      fetchArtworkPool(POOL_SIZE, 'tv', filters)
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
