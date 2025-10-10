const express = require('express');
const router = express.Router();
const transitService = require('../services/transitService');
const logger = require('../utils/logger');

/**
 * Format transit response according to docs specification
 * buses: { east: [], west: [] }
 * red: { north: [], south: [] }
 * brown: { north: [], south: [] }
 */
function formatTransitResponse(buses, trains) {
  return {
    buses: {
      east: buses?.routes?.['77']?.eastbound || [],
      west: buses?.routes?.['77']?.westbound || []
    },
    red: {
      north: trains?.lines?.red?.arrivals || [],
      south: trains?.lines?.red?.arrivals || []
    },
    brown: {
      north: trains?.lines?.brown?.arrivals || [],
      south: trains?.lines?.brown?.arrivals || []
    },
    lastUpdated: new Date().toISOString()
  };
}

/**
 * GET /api/transit/all
 * Returns all transit data (buses and trains)
 */
router.get('/all', async (req, res, next) => {
  try {
    logger.debug('GET /api/transit/all');

    const data = await transitService.getAll();
    const formatted = formatTransitResponse(data.buses, data.trains);

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    logger.error(`Error in GET /api/transit/all: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/transit/buses
 * Returns bus route 77 data only
 */
router.get('/buses', async (req, res, next) => {
  try {
    logger.debug('GET /api/transit/buses');

    const buses = await transitService.getBuses();

    res.json({
      success: true,
      data: {
        buses: {
          east: buses?.routes?.['77']?.eastbound || [],
          west: buses?.routes?.['77']?.westbound || []
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/transit/buses: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/transit/trains
 * Returns Red Line and Brown Line data
 */
router.get('/trains', async (req, res, next) => {
  try {
    logger.debug('GET /api/transit/trains');

    const trains = await transitService.getTrains();

    res.json({
      success: true,
      data: {
        red: {
          north: trains?.lines?.red?.arrivals || [],
          south: []
        },
        brown: {
          north: trains?.lines?.brown?.arrivals || [],
          south: []
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/transit/trains: ${error.message}`);
    next(error);
  }
});

module.exports = router;
