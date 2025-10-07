const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');
const logger = require('../utils/logger');

/**
 * GET /api/weather/current
 * Returns current weather data
 */
router.get('/current', async (req, res, next) => {
  try {
    logger.debug('GET /api/weather/current');

    const weather = await weatherService.getCurrentWeather();

    // Format response according to docs
    const response = {
      temp: weather.temp,
      condition: weather.condition,
      feelsLike: weather.feelsLike,
      humidity: weather.humidity,
      high: weather.high,
      low: weather.low,
      icon: weather.icon,
      description: weather.description,
      windSpeed: weather.windSpeed,
      lastUpdated: weather.timestamp
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error(`Error in GET /api/weather/current: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/weather/forecast
 * Returns forecast data (5-day forecast)
 */
router.get('/forecast', async (req, res, next) => {
  try {
    logger.debug('GET /api/weather/forecast');

    const forecast = await weatherService.getForecast();

    res.json({
      success: true,
      data: {
        forecast: forecast.forecast,
        lastUpdated: forecast.timestamp
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/weather/forecast: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/weather (alias for /current)
 * Returns current weather data
 */
router.get('/', async (req, res, next) => {
  try {
    logger.debug('GET /api/weather');

    const weather = await weatherService.getCurrentWeather();

    // Format response according to docs
    const response = {
      temp: weather.temp,
      condition: weather.condition,
      feelsLike: weather.feelsLike,
      humidity: weather.humidity,
      high: weather.high,
      low: weather.low,
      icon: weather.icon,
      description: weather.description,
      windSpeed: weather.windSpeed,
      lastUpdated: weather.timestamp
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error(`Error in GET /api/weather: ${error.message}`);
    next(error);
  }
});

module.exports = router;
