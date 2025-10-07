const axios = require('axios');
const logger = require('../utils/logger');
const cacheManager = require('../utils/cacheManager');
const cacheConfig = require('../../config/cache');

// OpenWeatherMap API endpoint
const OPENWEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';

// Cache TTL in seconds (from centralized config)
const CACHE_TTL = cacheConfig.weather.ttl;

// Fallback weather data in case of API errors
const FALLBACK_WEATHER = {
  temp: null,
  condition: 'Unavailable',
  feelsLike: null,
  humidity: null,
  high: null,
  low: null,
  icon: '01d',
  description: 'Weather data temporarily unavailable',
  error: true
};

/**
 * Fetch current weather data from OpenWeatherMap API
 */
async function fetchCurrentWeather() {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const lat = process.env.WEATHER_LAT;
    const lon = process.env.WEATHER_LON;

    if (!apiKey) {
      throw new Error('OPENWEATHER_API_KEY not configured');
    }

    if (!lat || !lon) {
      throw new Error('WEATHER_LAT and WEATHER_LON not configured');
    }

    const url = `${OPENWEATHER_API_BASE}/weather`;
    const response = await axios.get(url, {
      params: {
        lat,
        lon,
        appid: apiKey,
        units: 'imperial' // Use Fahrenheit
      },
      timeout: 5000
    });

    return response.data;
  } catch (error) {
    logger.error(`Error fetching current weather: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch forecast data from OpenWeatherMap API (5-day/3-hour forecast)
 */
async function fetchForecast() {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const lat = process.env.WEATHER_LAT;
    const lon = process.env.WEATHER_LON;

    if (!apiKey) {
      throw new Error('OPENWEATHER_API_KEY not configured');
    }

    if (!lat || !lon) {
      throw new Error('WEATHER_LAT and WEATHER_LON not configured');
    }

    const url = `${OPENWEATHER_API_BASE}/forecast`;
    const response = await axios.get(url, {
      params: {
        lat,
        lon,
        appid: apiKey,
        units: 'imperial' // Use Fahrenheit
      },
      timeout: 5000
    });

    return response.data;
  } catch (error) {
    logger.error(`Error fetching forecast: ${error.message}`);
    throw error;
  }
}

/**
 * Format current weather data
 */
function formatCurrentWeather(data) {
  try {
    return {
      temp: Math.round(data.main.temp),
      condition: data.weather[0].main,
      description: data.weather[0].description,
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      high: Math.round(data.main.temp_max),
      low: Math.round(data.main.temp_min),
      icon: data.weather[0].icon,
      pressure: data.main.pressure,
      windSpeed: Math.round(data.wind.speed),
      windDirection: data.wind.deg,
      cloudiness: data.clouds.all,
      visibility: data.visibility,
      sunrise: data.sys.sunrise,
      sunset: data.sys.sunset,
      timezone: data.timezone,
      cityName: data.name,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error formatting weather data: ${error.message}`);
    throw error;
  }
}

/**
 * Format forecast data - get daily highs/lows
 */
function formatForecast(data) {
  try {
    // Group forecast data by day
    const dailyForecasts = {};

    data.list.forEach(item => {
      const date = new Date(item.dt * 1000).toLocaleDateString('en-US');

      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          date,
          temps: [],
          conditions: [],
          icons: []
        };
      }

      dailyForecasts[date].temps.push(item.main.temp);
      dailyForecasts[date].conditions.push(item.weather[0].main);
      dailyForecasts[date].icons.push(item.weather[0].icon);
    });

    // Format daily summaries
    const forecast = Object.values(dailyForecasts).map(day => {
      const high = Math.round(Math.max(...day.temps));
      const low = Math.round(Math.min(...day.temps));

      // Most common condition
      const conditionCounts = {};
      day.conditions.forEach(cond => {
        conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
      });
      const condition = Object.keys(conditionCounts).reduce((a, b) =>
        conditionCounts[a] > conditionCounts[b] ? a : b
      );

      // Use the most common icon
      const icon = day.icons[Math.floor(day.icons.length / 2)];

      return {
        date: day.date,
        high,
        low,
        condition,
        icon
      };
    });

    return forecast.slice(0, 5); // Return next 5 days
  } catch (error) {
    logger.error(`Error formatting forecast data: ${error.message}`);
    throw error;
  }
}

/**
 * Get current weather with caching
 */
async function getCurrentWeather() {
  const cacheKey = 'weather:current';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const weatherData = await fetchCurrentWeather();
        const formatted = formatCurrentWeather(weatherData);
        return formatted;
      } catch (error) {
        logger.error(`Error getting current weather: ${error.message}`);

        // Return fallback data instead of throwing
        logger.warn('Returning fallback weather data');
        return {
          ...FALLBACK_WEATHER,
          timestamp: new Date().toISOString()
        };
      }
    },
    CACHE_TTL
  );
}

/**
 * Get forecast with caching
 */
async function getForecast() {
  const cacheKey = 'weather:forecast';

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      try {
        const forecastData = await fetchForecast();
        const formatted = formatForecast(forecastData);
        return {
          forecast: formatted,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error getting forecast: ${error.message}`);

        // Return empty forecast instead of throwing
        logger.warn('Returning empty forecast data');
        return {
          forecast: [],
          error: true,
          timestamp: new Date().toISOString()
        };
      }
    },
    CACHE_TTL
  );
}

/**
 * Get all weather data (current + forecast)
 */
async function getAll() {
  try {
    const [current, forecast] = await Promise.all([
      getCurrentWeather(),
      getForecast()
    ]);

    return {
      current,
      forecast: forecast.forecast,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Error getting all weather data: ${error.message}`);

    // Return partial data with fallbacks
    return {
      current: {
        ...FALLBACK_WEATHER,
        timestamp: new Date().toISOString()
      },
      forecast: [],
      error: true,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  getCurrentWeather,
  getForecast,
  getAll
};
