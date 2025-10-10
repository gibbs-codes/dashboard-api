/**
 * Dashboard Mode Definitions
 *
 * Defines what data should be included in each dashboard mode
 *
 * Each mode specifies which data sources to include:
 * - weather: Current weather and forecast
 * - transit: CTA bus and train arrivals
 * - calendar: Today's events from Lifestack
 * - tasks: Tasks from Lifestack
 * - nextEvent: Next upcoming event
 * - urgentTasksOnly: Filter tasks to only urgent ones (due within 24hrs)
 *
 * To add a new mode:
 * 1. Add a new entry to the MODES object below
 * 2. Specify name, description, and includes object
 * 3. The mode key will be used in API requests (e.g., ?mode=mymode)
 */

const MODES = {
  // Personal mode - Full dashboard with all personal data
  personal: {
    name: 'Personal',
    description: 'Full dashboard with calendar, tasks, weather, and transit',
    includes: {
      weather: true,
      transit: true,
      calendar: true,
      tasks: true,
      nextEvent: true
    }
  },

  // Guest mode - Public data only (weather and transit)
  guest: {
    name: 'Guest',
    description: 'Public information only - weather and transit',
    includes: {
      weather: true,
      transit: true,
      calendar: false,
      tasks: false,
      nextEvent: false
    }
  },

  // Transit mode - Transit information only
  transit: {
    name: 'Transit',
    description: 'Transit information only',
    includes: {
      weather: false,
      transit: true,
      calendar: false,
      tasks: false,
      nextEvent: false
    }
  },

  // Morning mode - Weather, next event, and urgent tasks
  morning: {
    name: 'Morning',
    description: 'Morning briefing - weather, next event, and urgent tasks',
    includes: {
      weather: true,
      transit: true,
      calendar: false,
      tasks: true,
      nextEvent: true,
      urgentTasksOnly: true
    }
  },

  // Work mode - Tasks and calendar only
  work: {
    name: 'Work',
    description: 'Work focus - calendar and tasks',
    includes: {
      weather: false,
      transit: false,
      calendar: true,
      tasks: true,
      nextEvent: true
    }
  },

  // Gallery mode - Art display with weather and transit
  gallery: {
    name: 'Gallery',
    description: 'Art display from Art Institute of Chicago with weather and transit info',
    includes: {
      weather: true,
      transit: true,
      calendar: false,
      tasks: false,
      nextEvent: false
    },
    artStyles: ['Cubism', 'Expressionism', 'Surrealism', 'Abstract', 'Minimalism', 'Constructivism', 'Symbolism', 'Suprematism', 'Bauhaus']
  }
};

/**
 * Get mode configuration by name
 */
function getMode(modeName) {
  const mode = MODES[modeName?.toLowerCase()];
  if (!mode) {
    // Default to personal mode if mode not found
    return MODES.personal;
  }
  return mode;
}

/**
 * Get list of all available modes
 */
function getAllModes() {
  return Object.keys(MODES).map(key => ({
    key,
    ...MODES[key]
  }));
}

/**
 * Check if a mode exists
 */
function isValidMode(modeName) {
  return MODES.hasOwnProperty(modeName?.toLowerCase());
}

module.exports = {
  MODES,
  getMode,
  getAllModes,
  isValidMode
};
