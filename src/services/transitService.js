// transitService.js (compat fix: add direction + arrivals)
const axios = require('axios');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const cacheManager = require('../utils/cacheManager');
const ctaStops = require('../../config/ctaStops');
const cacheConfig = require('../../config/cache');

const CTA_BUS_API_BASE = 'http://www.ctabustracker.com/bustime/api/v2';
const CTA_TRAIN_API_BASE = 'http://lapi.transitchicago.com/api/1.0';
const CACHE_TTL = cacheConfig.transit.ttl;

// Limit how many predictions per direction to keep (set to null to disable)
const TRAIN_LIMIT_PER_DIRECTION = 8;

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
      { line: 'Red', destination: 'Howard', minutesAway: 6, arrivalTime: '12:06', isApproaching: false, isDelayed: false, runNumber: '102' }
    ],
    timestamp: new Date().toISOString()
  },
  brown: {
    line: 'Brown',
    stopName: 'Belmont',
    arrivals: [
      { line: 'Brn', destination: 'Loop', minutesAway: 4, arrivalTime: '12:04', isApproaching: false, isDelayed: false, runNumber: '201' },
      { line: 'Brn', destination: 'Kimball', minutesAway: 12, arrivalTime: '12:12', isApproaching: false, isDelayed: false, runNumber: '202' }
    ],
    timestamp: new Date().toISOString()
  }
};

// ---------------------- CTA Calls ----------------------
async function fetchBusPredictions(stopId, routeId) {
  try {
    const apiKey = process.env.CTA_BUS_API_KEY;
    if (!apiKey) throw new Error('CTA_BUS_API_KEY not configured');

    const url = `${CTA_BUS_API_BASE}/getpredictions`;
    const params = { key: apiKey, stpid: stopId, rt: routeId, format: 'json' };

    const safeParams = { ...params, key: `${apiKey.substring(0, 4)}...` };
    logger.debug(`Fetching bus predictions: ${url}?${new URLSearchParams(safeParams).toString()}`);

    const response = await axios.get(url, { params, timeout: 10000 });
    logger.debug(`Bus API response status: ${response.status}`);
    logger.debug(`Bus API response data: ${JSON.stringify(response.data)}`);

    if (response.data['bustime-response']?.error) {
      const errors = response.data['bustime-response'].error;
      const errorMsg = errors[0]?.msg || 'Unknown error';
      if (errorMsg.toLowerCase().includes('no service scheduled')) {
        logger.debug(`No bus service currently scheduled for stop ${stopId}, route ${routeId}`);
        return [];
      }
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

async function fetchTrainArrivals(stopId) {
  try {
    const apiKey = process.env.CTA_TRAIN_API_KEY;
    if (!apiKey) throw new Error('CTA_TRAIN_API_KEY not configured');

    const url = `${CTA_TRAIN_API_BASE}/ttarrivals.aspx`;
    const params = { key: apiKey, mapid: stopId, outputType: 'JSON' };

    const safeParams = { ...params, key: `${apiKey.substring(0, 4)}...` };
    logger.debug(`Fetching train arrivals: ${url}?${new URLSearchParams(safeParams).toString()}`);

    const response = await axios.get(url, { params, timeout: 10000 });
    logger.debug(`Train API response status: ${response.status}`);
    logger.debug(`Train API response data: ${JSON.stringify(response.data)}`);

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

// ---------------------- Formatters ----------------------
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
 * Normalize CTA arrivals -> our shape, with optional line filter.
 */
function formatTrainArrivals(arrivals, { lineCode = null } = {}) {
  const now = moment();
  const filtered = lineCode ? arrivals.filter(a => a.rt === lineCode) : arrivals;

  const mapped = filtered
    .map(arrival => {
      const arrivalTime = moment(arrival.arrT);
      const minutesAway = Math.max(0, arrivalTime.diff(now, 'minutes'));
      return {
        line: arrival.rt,             // 'Red' | 'Brn' | 'P'
        destination: arrival.destNm,  // 'Howard' | '95th/Dan Ryan' | 'Kimball' | 'Loop' | ...
        minutesAway,
        arrivalTime: arrivalTime.format('HH:mm'),
        isApproaching: arrival.isApp === '1',
        isDelayed: arrival.isDly === '1',
        runNumber: arrival.rn
      };
    })
    .sort((a, b) => a.minutesAway - b.minutesAway);

  return mapped;
}

/**
 * Belmont-specific split by destination.
 * Red:    North -> Howard, South -> 95th/Dan Ryan
 * Brown:  North -> Kimball, South -> Loop
 */
function splitByDirectionForBelmont(lineCode, items, limitPerDirection = TRAIN_LIMIT_PER_DIRECTION) {
  const northDests = lineCode === 'Red' ? ['Howard']
                   : lineCode === 'Brn' ? ['Kimball']
                   : [];
  const southDests = lineCode === 'Red' ? ['95th/Dan Ryan']
                   : lineCode === 'Brn' ? ['Loop']
                   : [];

  let north = items.filter(x => northDests.includes(x.destination));
  let south = items.filter(x => southDests.includes(x.destination));

  if (Number.isInteger(limitPerDirection)) {
    north = north.slice(0, limitPerDirection);
    south = south.slice(0, limitPerDirection);
  }

  // 🔧 Compatibility: add a `direction` field to each item so downstream filters can use it
  north = north.map(x => ({ ...x, direction: 'Northbound' }));
  south = south.map(x => ({ ...x, direction: 'Southbound' }));

  return { north, south };
}

// ---------------------- Bus: Route 77 ----------------------
async function getRoute77Buses() {
  const cacheKey = 'transit:buses:route77';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const { route77 } = ctaStops.bus;

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

// ---------------------- Trains: Red / Brown ----------------------
function addArrivalsCompat(north, south) {
  // Provide a flat array some legacy formatters expect
  return [...north, ...south].sort((a, b) => a.minutesAway - b.minutesAway);
}

async function getRedLine() {
  const cacheKey = 'transit:trains:redline';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const { redLine } = ctaStops.train;
        const stop = redLine.stops[0];

        const arrivals = await fetchTrainArrivals(stop.stopId);
        const normalized = formatTrainArrivals(arrivals, { lineCode: 'Red' });
        const { north, south } = splitByDirectionForBelmont('Red', normalized);

        // 🔧 Compatibility: include a flat `arrivals` array too
        const arrivalsCompat = addArrivalsCompat(north, south);

        return {
          line: 'Red',
          stopName: stop.stopName,
          north,
          south,
          arrivals: arrivalsCompat, // <— legacy/compat
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error getting Red Line: ${error.message}`);
        logger.warn('Returning mock Red Line data due to API error');
        const normalized = (MOCK_TRAIN_DATA.red.arrivals || []);
        const { north, south } = splitByDirectionForBelmont('Red', normalized);
        const arrivalsCompat = addArrivalsCompat(north, south);
        return {
          line: 'Red',
          stopName: MOCK_TRAIN_DATA.red.stopName || 'Belmont',
          north,
          south,
          arrivals: arrivalsCompat,
          timestamp: new Date().toISOString()
        };
      }
    },
    CACHE_TTL
  );
}

async function getBrownLine() {
  const cacheKey = 'transit:trains:brownline';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const { brownLine } = ctaStops.train;
        const stop = brownLine.stops[0];

        const arrivals = await fetchTrainArrivals(stop.stopId);
        const normalized = formatTrainArrivals(arrivals, { lineCode: 'Brn' });
        const { north, south } = splitByDirectionForBelmont('Brn', normalized);

        const arrivalsCompat = addArrivalsCompat(north, south);

        return {
          line: 'Brown',
          stopName: stop.stopName,
          north,
          south,
          arrivals: arrivalsCompat, // <— legacy/compat
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error getting Brown Line: ${error.message}`);
        logger.warn('Returning mock Brown Line data due to API error');
        const normalized = (MOCK_TRAIN_DATA.brown.arrivals || []);
        const { north, south } = splitByDirectionForBelmont('Brn', normalized);
        const arrivalsCompat = addArrivalsCompat(north, south);
        return {
          line: 'Brown',
          stopName: MOCK_TRAIN_DATA.brown.stopName || 'Belmont',
          north,
          south,
          arrivals: arrivalsCompat,
          timestamp: new Date().toISOString()
        };
      }
    },
    CACHE_TTL
  );
}

// ---------------------- Aggregations ----------------------
async function getBuses() {
  try {
    const route77 = await getRoute77Buses();
    return {
      routes: { '77': route77 },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all buses: ${error.message}`);
    logger.warn('Returning mock bus data due to error');
    return {
      routes: { '77': MOCK_BUS_DATA },
      timestamp: new Date().toISOString()
    };
  }
}

async function getTrains() {
  try {
    const [redLine, brownLine] = await Promise.all([getRedLine(), getBrownLine()]);
    return {
      lines: { red: redLine, brown: brownLine },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all trains: ${error.message}`);
    logger.warn('Returning mock train data due to error');
    const redNormalized = splitByDirectionForBelmont('Red', (MOCK_TRAIN_DATA.red.arrivals || []));
    const brownNormalized = splitByDirectionForBelmont('Brn', (MOCK_TRAIN_DATA.brown.arrivals || []));
    return {
      lines: {
        red: {
          line: 'Red',
          stopName: MOCK_TRAIN_DATA.red.stopName || 'Belmont',
          ...redNormalized,
          arrivals: addArrivalsCompat(redNormalized.north, redNormalized.south),
          timestamp: new Date().toISOString()
        },
        brown: {
          line: 'Brown',
          stopName: MOCK_TRAIN_DATA.brown.stopName || 'Belmont',
          ...brownNormalized,
          arrivals: addArrivalsCompat(brownNormalized.north, brownNormalized.south),
          timestamp: new Date().toISOString()
        }
      },
      timestamp: new Date().toISOString()
    };
  }
}

async function getAll() {
  try {
    const [buses, trains] = await Promise.all([getBuses(), getTrains()]);
    return {
      buses,
      trains,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all transit data: ${error.message}`);
    logger.warn('Returning all mock transit data due to error');
    const redNormalized = splitByDirectionForBelmont('Red', (MOCK_TRAIN_DATA.red.arrivals || []));
    const brownNormalized = splitByDirectionForBelmont('Brn', (MOCK_TRAIN_DATA.brown.arrivals || []));
    return {
      buses: {
        routes: { '77': MOCK_BUS_DATA },
        timestamp: new Date().toISOString()
      },
      trains: {
        lines: {
          red: {
            line: 'Red',
            stopName: 'Belmont',
            ...redNormalized,
            arrivals: addArrivalsCompat(redNormalized.north, redNormalized.south),
            timestamp: new Date().toISOString()
          },
          brown: {
            line: 'Brown',
            stopName: 'Belmont',
            ...brownNormalized,
            arrivals: addArrivalsCompat(brownNormalized.north, brownNormalized.south),
            timestamp: new Date().toISOString()
          }
        },
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