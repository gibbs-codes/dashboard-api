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
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        stpid: stopId,
        rt: routeId,
        format: 'json'
      },
      timeout: 5000
    });

    // Check for API errors
    if (response.data['bustime-response']?.error) {
      const errorMsg = response.data['bustime-response'].error[0]?.msg || 'Unknown error';
      logger.warn(`CTA Bus API error for stop ${stopId}: ${errorMsg}`);
      return [];
    }

    const predictions = response.data['bustime-response']?.prd || [];
    return predictions;
  } catch (error) {
    logger.error(`Error fetching bus predictions for stop ${stopId}: ${error.message}`);
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
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        mapid: stopId,
        outputType: 'JSON'
      },
      timeout: 5000
    });

    // Check for API errors
    if (response.data.ctatt?.errCd) {
      const errorMsg = response.data.ctatt?.errNm || 'Unknown error';
      logger.warn(`CTA Train API error for stop ${stopId}: ${errorMsg}`);
      return [];
    }

    const arrivals = response.data.ctatt?.eta || [];
    return arrivals;
  } catch (error) {
    logger.error(`Error fetching train arrivals for stop ${stopId}: ${error.message}`);
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
        throw error;
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
        throw error;
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
        throw error;
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
    throw error;
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
    throw error;
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
    throw error;
  }
}

module.exports = {
  getAll,
  getBuses,
  getTrains,
  getRedLine,
  getBrownLine
};
