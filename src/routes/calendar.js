const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const lifestackClient = require('../services/lifestackClient');
const logger = require('../utils/logger');

/**
 * Parse next event from today's events
 * Returns the next upcoming event based on current time
 */
function getNextEvent(events) {
  if (!events || events.length === 0) {
    return null;
  }

  const now = moment();

  // Filter and sort events
  const upcomingEvents = events
    .filter(event => {
      // Parse event start time
      const eventStart = moment(event.start || event.startTime);

      // Include events that haven't ended yet
      if (event.end || event.endTime) {
        const eventEnd = moment(event.end || event.endTime);
        return eventEnd.isAfter(now);
      }

      // If no end time, just check if start is after now
      return eventStart.isAfter(now);
    })
    .sort((a, b) => {
      const aStart = moment(a.start || a.startTime);
      const bStart = moment(b.start || b.startTime);
      return aStart.diff(bStart);
    });

  return upcomingEvents.length > 0 ? upcomingEvents[0] : null;
}

/**
 * GET /api/calendar/today
 * Returns today's events from Lifestack
 */
router.get('/today', async (req, res, next) => {
  try {
    logger.debug('GET /api/calendar/today');

    const events = await lifestackClient.getTodayEvents();

    res.json({
      success: true,
      data: {
        events,
        count: events.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/calendar/today: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/calendar/next
 * Returns the next upcoming event from today's events
 */
router.get('/next', async (req, res, next) => {
  try {
    logger.debug('GET /api/calendar/next');

    const events = await lifestackClient.getTodayEvents();
    const nextEvent = getNextEvent(events);

    if (nextEvent) {
      res.json({
        success: true,
        data: {
          event: nextEvent,
          lastUpdated: new Date().toISOString()
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          event: null,
          message: 'No upcoming events',
          lastUpdated: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    logger.error(`Error in GET /api/calendar/next: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/calendar (alias for /today)
 * Returns today's events from Lifestack
 */
router.get('/', async (req, res, next) => {
  try {
    logger.debug('GET /api/calendar');

    const events = await lifestackClient.getTodayEvents();

    res.json({
      success: true,
      data: {
        events,
        count: events.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/calendar: ${error.message}`);
    next(error);
  }
});

module.exports = router;
