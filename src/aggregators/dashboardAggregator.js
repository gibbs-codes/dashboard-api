const moment = require('moment-timezone');
const transitService = require('../services/transitService');
const weatherService = require('../services/weatherService');
const lifestackClient = require('../services/lifestackClient');
const artService = require('../services/artService');
const { getMode } = require('../../config/modes');
const logger = require('../utils/logger');

/**
 * Get next event from events list
 */
function getNextEvent(events) {
  if (!events || events.length === 0) {
    return null;
  }

  const now = moment();

  const upcomingEvents = events
    .filter(event => {
      const eventStart = moment(event.start || event.startTime);
      if (event.end || event.endTime) {
        const eventEnd = moment(event.end || event.endTime);
        return eventEnd.isAfter(now);
      }
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
 * Filter urgent tasks (due within 24 hours or overdue)
 */
function filterUrgentTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return [];
  }

  const now = moment();
  const urgentThreshold = moment().add(24, 'hours');

  const urgentTasks = tasks.filter(task => {
    if (task.completed || task.status === 'completed') {
      return false;
    }

    if (!task.due && !task.dueDate) {
      return false;
    }

    const dueDate = moment(task.due || task.dueDate);
    return dueDate.isBefore(urgentThreshold);
  });

  return urgentTasks.sort((a, b) => {
    const aDue = moment(a.due || a.dueDate);
    const bDue = moment(b.due || b.dueDate);
    return aDue.diff(bDue);
  });
}

/**
 * Fetch weather data with error handling
 */
async function fetchWeatherData() {
  try {
    const weather = await weatherService.getCurrentWeather();
    return {
      success: true,
      data: weather
    };
  } catch (error) {
    logger.error(`Dashboard aggregator - weather fetch failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Fetch transit data with error handling
 */
async function fetchTransitData() {
  try {
    const transit = await transitService.getAll();
    return {
      success: true,
      data: transit
    };
  } catch (error) {
    logger.error(`Dashboard aggregator - transit fetch failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Fetch calendar data with error handling
 */
async function fetchCalendarData() {
  try {
    const events = await lifestackClient.getTodayEvents();
    return {
      success: true,
      data: events
    };
  } catch (error) {
    logger.error(`Dashboard aggregator - calendar fetch failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

/**
 * Fetch tasks data with error handling
 */
async function fetchTasksData() {
  try {
    const tasks = await lifestackClient.getTasks();
    return {
      success: true,
      data: tasks
    };
  } catch (error) {
    logger.error(`Dashboard aggregator - tasks fetch failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}

/**
 * Fetch artwork data with error handling
 */
async function fetchArtworkData(artStyles = null) {
  try {
    const filters = artStyles ? { styles: artStyles } : {};
    const artwork = await artService.getCurrentArtwork(filters);
    return {
      success: true,
      data: artwork
    };
  } catch (error) {
    logger.error(`Dashboard aggregator - artwork fetch failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Format transit data for dashboard
 */
function formatTransitData(transitResult) {
  if (!transitResult.success || !transitResult.data) {
    logger.warn('Transit result unsuccessful or no data');
    return null;
  }

  const { buses, trains } = transitResult.data;

  logger.debug(`Transit data - buses: ${JSON.stringify(buses)}`);
  logger.debug(`Transit data - trains: ${JSON.stringify(trains)}`);

  const formatted = {
    buses: {
      east: buses?.routes?.['77']?.eastbound || [],
      west: buses?.routes?.['77']?.westbound || []
    },
    red: {
      north: trains?.lines?.red?.north || [],
      south: trains?.lines?.red?.south || []
    },
    brown: {
      north: trains?.lines?.brown?.north || [],
      south: trains?.lines?.brown?.south || []
    }
  };

  logger.debug(`Formatted transit data: ${JSON.stringify(formatted)}`);
  return formatted;
}

/**
 * Format weather data for dashboard
 */
function formatWeatherData(weatherResult) {
  if (!weatherResult.success || !weatherResult.data) {
    return null;
  }

  const weather = weatherResult.data;

  return {
    temp: weather.temp,
    condition: weather.condition,
    feelsLike: weather.feelsLike,
    humidity: weather.humidity,
    high: weather.high,
    low: weather.low,
    icon: weather.icon,
    description: weather.description
  };
}

/**
 * Aggregate dashboard data based on mode
 * @param {string} modeName - The dashboard mode (personal, guest, transit, morning, work)
 * @returns {object} Aggregated dashboard data
 */
async function aggregateDashboard(modeName = 'personal') {
  const mode = getMode(modeName);
  logger.info(`Aggregating dashboard data for mode: ${mode.name}`);

  // Build array of fetch promises based on mode
  const fetchPromises = [];
  const fetchKeys = [];

  if (mode.includes.weather) {
    fetchPromises.push(fetchWeatherData());
    fetchKeys.push('weather');
  }

  if (mode.includes.transit) {
    fetchPromises.push(fetchTransitData());
    fetchKeys.push('transit');
  }

  if (mode.includes.calendar) {
    fetchPromises.push(fetchCalendarData());
    fetchKeys.push('calendar');
  }

  if (mode.includes.tasks) {
    fetchPromises.push(fetchTasksData());
    fetchKeys.push('tasks');
  }

  // Always fetch artwork for all modes (pass art styles if configured)
  fetchPromises.push(fetchArtworkData(mode.artStyles || null));
  fetchKeys.push('artwork');

  // Fetch all data in parallel
  const results = await Promise.all(fetchPromises);

  // Map results back to keys
  const fetchResults = {};
  fetchKeys.forEach((key, index) => {
    fetchResults[key] = results[index];
  });

  // Build dashboard response
  const dashboard = {
    mode: modeName,
    timestamp: new Date().toISOString()
  };

  // Add weather data if included
  if (mode.includes.weather) {
    dashboard.weather = formatWeatherData(fetchResults.weather);
  }

  // Add transit data if included
  if (mode.includes.transit) {
    dashboard.transit = formatTransitData(fetchResults.transit);
  }

  // Add calendar data if included
  if (mode.includes.calendar) {
    dashboard.events = fetchResults.calendar?.data || [];
  }

  // Add next event if included
  if (mode.includes.nextEvent) {
    const events = fetchResults.calendar?.data || [];
    dashboard.nextEvent = getNextEvent(events);
  }

  // Add tasks data if included
  if (mode.includes.tasks) {
    const tasks = fetchResults.tasks?.data || [];

    if (mode.includes.urgentTasksOnly) {
      dashboard.tasks = filterUrgentTasks(tasks);
    } else {
      dashboard.tasks = tasks;
    }
  }

  // Add artwork data (always included) - returns artworkCenter, artworkRight, and artworkTV
  if (fetchResults.artwork?.success && fetchResults.artwork.data) {
    dashboard.artworkCenter = fetchResults.artwork.data.artworkCenter || null;
    dashboard.artworkRight = fetchResults.artwork.data.artworkRight || null;
    dashboard.artworkTV = fetchResults.artwork.data.artworkTV || null;
  } else {
    dashboard.artworkCenter = null;
    dashboard.artworkRight = null;
    dashboard.artworkTV = null;
  }

  // Add error information for failed fetches
  const errors = {};
  Object.keys(fetchResults).forEach(key => {
    if (!fetchResults[key].success) {
      errors[key] = fetchResults[key].error;
    }
  });

  if (Object.keys(errors).length > 0) {
    dashboard.errors = errors;
    logger.warn(`Dashboard aggregation completed with errors: ${JSON.stringify(errors)}`);
  } else {
    logger.info('Dashboard aggregation completed successfully');
  }

  return dashboard;
}

/**
 * Get available modes
 */
function getAvailableModes() {
  const { getAllModes } = require('../../config/modes');
  return getAllModes();
}

module.exports = {
  aggregateDashboard,
  getAvailableModes
};
