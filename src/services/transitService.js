const axios = require('axios');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const cacheManager = require('../utils/cacheManager');
const ctaStops = require('../../config/ctaStops');
const cacheConfig = require('../../config/cache');

// CTA API endpoints
const CTA_BUS_API_BASE = 'http://www.ctabustracker.com/bustime/api/v2';
const CTA_TRAIN_API_BASE = 'http://lapi.transitchicago.com/api/1.0';

// Cache TTL in seconds (from centralized config)
const CACHE_TTL = cacheConfig.transit.ttl;

// Mock data for when API is unavailable
const MOCK_BUS_DATA = {
  route: '77',
  eastbound: [
    { route: '77', direction: 'Eastbound', destination: 'Belmont Harbor', minutesAway: 5, predictedTime: '12:05', vehicleId: '1234' },
    { route: '77', direction: 'Eastbound', destination: 'Belmont Harbor', minutesAway: 15, predictedTime: '12:15', vehicleId: '1235' }
  ],
  westbound: [
    { route: '77', direction: 'Westbound', destination: 'Austin', minutesAway: 8, predictedTime: '12:08', vehicleId: '1236' },
    { route: '77', direction: 'Westbound', destination: 'Austin', minutesAway: 18, predictedTime: '12:18', vehicleId: '1237' }
  ],
  timestamp: new Date().toISOString()
};

const MOCK_TRAIN_DATA = {
  red: {
    line: 'Red',
    stopName: 'Belmont',
    arrivals: [
      { line: 'Red', destination: '95th/Dan Ryan', minutesAway: 3, arrivalTime: '12:03', isApproaching: false, isDelayed: false, runNumber: '101' },
      { line: 'Red', destination: '95th/Dan Ryan', minutesAway: 10, arrivalTime: '12:10', isApproaching: false, isDelayed: false, runNumber: '102' }
    ],
    timestamp: new Date().toISOString()
  },
  brown: {
    line: 'Brown',
    stopName: 'Belmont',
    arrivals: [
      { line: 'Brn', destination: 'Kimball', minutesAway: 4, arrivalTime: '12:04', isApproaching: false, isDelayed: false, runNumber: '201' },
      { line: 'Brn', destination: 'Kimball', minutesAway: 12, arrivalTime: '12:12', isApproaching: false, isDelayed: false, runNumber: '202' }
    ],
    timestamp: new Date().toISOString()
  }
};

/**
 * Fetch bus predictions from CTA Bus Tracker API
 */
async function fetchBusPredictions(stopId, routeId) {
  try {
    const apiKey = process.env.CTA_BUS_API_KEY;
    if (!apiKey) {
      throw new Error('CTA_BUS_API_KEY not configured');
    }

    const url = `${CTA_BUS_API_BASE}/getpredictions`;
    const params = {
      key: apiKey,
      stpid: stopId,
      rt: routeId,
      format: 'json'
    };

    // Log request details (with redacted key)
    const safeParams = { ...params, key: `${apiKey.substring(0, 4)}...` };
    logger.debug(`Fetching bus predictions: ${url}?${new URLSearchParams(safeParams).toString()}`);

    const response = await axios.get(url, {
      params,
      timeout: 10000
    });

    logger.debug(`Bus API response status: ${response.status}`);
    logger.debug(`Bus API response data: ${JSON.stringify(response.data)}`);

    // Check for API errors
    if (response.data['bustime-response']?.error) {
      const errors = response.data['bustime-response'].error;
      const errorMsg = errors[0]?.msg || 'Unknown error';

      // "No service scheduled" is expected at night/off-peak - not an error
      if (errorMsg.toLowerCase().includes('no service scheduled')) {
        logger.debug(`No bus service currently scheduled for stop ${stopId}, route ${routeId} (expected at night/off-peak)`);
        return [];
      }

      // Log other errors as warnings
      logger.warn(`CTA Bus API error for stop ${stopId}, route ${routeId}: ${errorMsg}`);
      logger.warn(`Full error details: ${JSON.stringify(errors)}`);
      return [];
    }

    const predictions = response.data['bustime-response']?.prd || [];
    logger.debug(`Received ${predictions.length} bus predictions for stop ${stopId}`);
    return predictions;
  } catch (error) {
    if (error.response) {
      logger.error(`CTA Bus API HTTP error: ${error.response.status} - ${error.response.statusText}`);
      logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`CTA Bus API no response received for stop ${stopId}`);
    } else {
      logger.error(`Error fetching bus predictions for stop ${stopId}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fetch train arrivals from CTA Train Tracker API
 */
async function fetchTrainArrivals(stopId) {
  try {
    const apiKey = process.env.CTA_TRAIN_API_KEY;
    if (!apiKey) {
      throw new Error('CTA_TRAIN_API_KEY not configured');
    }

    const url = `${CTA_TRAIN_API_BASE}/ttarrivals.aspx`;
    const params = {
      key: apiKey,
      mapid: stopId,
      outputType: 'JSON'
    };

    // Log request details (with redacted key)
    const safeParams = { ...params, key: `${apiKey.substring(0, 4)}...` };
    logger.debug(`Fetching train arrivals: ${url}?${new URLSearchParams(safeParams).toString()}`);

    const response = await axios.get(url, {
      params,
      timeout: 10000
    });

    logger.debug(`Train API response status: ${response.status}`);
    logger.debug(`Train API response data: ${JSON.stringify(response.data)}`);

    // Check for API errors
    // Note: errCd "0" means SUCCESS in CTA API
    if (response.data.ctatt?.errCd && response.data.ctatt.errCd !== "0") {
      const errorCode = response.data.ctatt?.errCd;
      const errorMsg = response.data.ctatt?.errNm || 'Unknown error';
      logger.warn(`CTA Train API error for stop ${stopId}: [${errorCode}] ${errorMsg}`);
      return [];
    }

    const arrivals = response.data.ctatt?.eta || [];
    logger.debug(`Received ${arrivals.length} train arrivals for stop ${stopId}`);
    return arrivals;
  } catch (error) {
    if (error.response) {
      logger.error(`CTA Train API HTTP error: ${error.response.status} - ${error.response.statusText}`);
      logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      logger.error(`CTA Train API no response received for stop ${stopId}`);
    } else {
      logger.error(`Error fetching train arrivals for stop ${stopId}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Format bus predictions into minute predictions array
 */
function formatBusPredictions(predictions, direction) {
  const now = moment();
  const minutePredictions = predictions
    .map(pred => {
      const predTime = moment(pred.prdtm, 'YYYYMMDD HH:mm');
      const minutesAway = Math.max(0, predTime.diff(now, 'minutes'));
      return {
        route: pred.rt,
        direction: pred.rtdir,
        destination: pred.des,
        minutesAway,
        predictedTime: predTime.format('HH:mm'),
        vehicleId: pred.vid
      };
    })
    .filter(pred => pred.direction === direction)
    .sort((a, b) => a.minutesAway - b.minutesAway);

  return minutePredictions;
}

/**
 * Format train arrivals into minute predictions array
 */
function formatTrainArrivals(arrivals) {
  const now = moment();
  const minutePredictions = arrivals
    .map(arrival => {
      const arrivalTime = moment(arrival.arrT);
      const minutesAway = Math.max(0, arrivalTime.diff(now, 'minutes'));
      return {
        line: arrival.rt,
        destination: arrival.destNm,
        minutesAway,
        arrivalTime: arrivalTime.format('HH:mm'),
        isApproaching: arrival.isApp === '1',
        isDelayed: arrival.isDly === '1',
        runNumber: arrival.rn
      };
    })
    .sort((a, b) => a.minutesAway - b.minutesAway);

  return minutePredictions;
}

/**
 * Get Route 77 bus predictions (both directions)
 */
async function getRoute77Buses() {
  const cacheKey = 'transit:buses:route77';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const { route77 } = ctaStops.bus;

        // Fetch both directions in parallel
        const [eastboundPreds, westboundPreds] = await Promise.all([
          fetchBusPredictions(route77.eastbound.stopId, route77.routeId),
          fetchBusPredictions(route77.westbound.stopId, route77.routeId)
        ]);

        const eastbound = formatBusPredictions(eastboundPreds, route77.eastbound.direction);
        const westbound = formatBusPredictions(westboundPreds, route77.westbound.direction);

        return {
          route: '77',
          eastbound,
          westbound,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error getting Route 77 buses: ${error.message}`);
        logger.warn('Returning mock bus data due to API error');
        return MOCK_BUS_DATA;
      }
    },
    CACHE_TTL
  );
}

/**
 * Get Red Line train arrivals
 */
async function getRedLine() {
  const cacheKey = 'transit:trains:redline';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const { redLine } = ctaStops.train;
        const stop = redLine.stops[0];

        const arrivals = await fetchTrainArrivals(stop.stopId);
        const predictions = formatTrainArrivals(arrivals);

        return {
          line: 'Red',
          stopName: stop.stopName,
          arrivals: predictions,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error getting Red Line: ${error.message}`);
        logger.warn('Returning mock Red Line data due to API error');
        return MOCK_TRAIN_DATA.red;
      }
    },
    CACHE_TTL
  );
}

/**
 * Get Brown Line train arrivals
 */
async function getBrownLine() {
  const cacheKey = 'transit:trains:brownline';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const { brownLine } = ctaStops.train;
        const stop = brownLine.stops[0];

        const arrivals = await fetchTrainArrivals(stop.stopId);
        const predictions = formatTrainArrivals(arrivals);

        return {
          line: 'Brown',
          stopName: stop.stopName,
          arrivals: predictions,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error getting Brown Line: ${error.message}`);
        logger.warn('Returning mock Brown Line data due to API error');
        return MOCK_TRAIN_DATA.brown;
      }
    },
    CACHE_TTL
  );
}

/**
 * Get all bus predictions
 */
async function getBuses() {
  try {
    const route77 = await getRoute77Buses();
    return {
      routes: {
        '77': route77
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all buses: ${error.message}`);
    logger.warn('Returning mock bus data due to error');
    return {
      routes: {
        '77': MOCK_BUS_DATA
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get all train predictions
 */
async function getTrains() {
  try {
    const [redLine, brownLine] = await Promise.all([
      getRedLine(),
      getBrownLine()
    ]);

    return {
      lines: {
        red: redLine,
        brown: brownLine
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all trains: ${error.message}`);
    logger.warn('Returning mock train data due to error');
    return {
      lines: MOCK_TRAIN_DATA,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get all transit data (buses and trains)
 */
async function getAll() {
  try {
    const [buses, trains] = await Promise.all([
      getBuses(),
      getTrains()
    ]);

    return {
      buses,
      trains,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all transit data: ${error.message}`);
    logger.warn('Returning all mock transit data due to error');
    return {
      buses: {
        routes: {
          '77': MOCK_BUS_DATA
        },
        timestamp: new Date().toISOString()
      },
      trains: {
        lines: MOCK_TRAIN_DATA,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  getAll,
  getBuses,
  getTrains,
  getRedLine,
  getBrownLine
};
