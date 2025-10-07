const { getMode, isValidMode } = require('../../config/modes');
const logger = require('./logger');

/**
 * ModeManager - Manages dashboard mode/profile state
 * Stores current profile in memory and tracks changes
 */
class ModeManager {
  constructor() {
    this.currentMode = 'personal'; // Default mode
    this.lastChanged = new Date().toISOString();
    this.changeHistory = [];
    logger.info(`ModeManager initialized with mode: ${this.currentMode}`);
  }

  /**
   * Get current mode
   */
  getCurrentMode() {
    return this.currentMode;
  }

  /**
   * Get current mode configuration
   */
  getCurrentModeConfig() {
    return getMode(this.currentMode);
  }

  /**
   * Set current mode
   * @param {string} mode - The mode to set
   * @returns {object} Result with success status and data
   */
  setMode(mode) {
    if (!isValidMode(mode)) {
      logger.warn(`Attempted to set invalid mode: ${mode}`);
      return {
        success: false,
        error: `Invalid mode: ${mode}`,
        currentMode: this.currentMode
      };
    }

    const previousMode = this.currentMode;
    this.currentMode = mode;
    this.lastChanged = new Date().toISOString();

    // Track change in history (keep last 10 changes)
    this.changeHistory.push({
      from: previousMode,
      to: mode,
      timestamp: this.lastChanged
    });

    if (this.changeHistory.length > 10) {
      this.changeHistory.shift();
    }

    logger.info(`Mode changed from ${previousMode} to ${this.currentMode}`);

    return {
      success: true,
      mode: this.currentMode,
      previousMode,
      lastChanged: this.lastChanged
    };
  }

  /**
   * Get last changed timestamp
   */
  getLastChanged() {
    return this.lastChanged;
  }

  /**
   * Get mode change history
   */
  getChangeHistory() {
    return this.changeHistory;
  }

  /**
   * Get current profile info (mode + metadata)
   */
  getProfile() {
    const config = this.getCurrentModeConfig();
    return {
      mode: this.currentMode,
      name: config.name,
      description: config.description,
      includes: config.includes,
      lastChanged: this.lastChanged
    };
  }

  /**
   * Filter dashboard data based on current mode
   * @param {object} dashboardData - Complete dashboard data
   * @returns {object} Filtered dashboard data
   */
  filterDashboardData(dashboardData) {
    const config = this.getCurrentModeConfig();
    const filtered = {
      mode: this.currentMode,
      timestamp: dashboardData.timestamp || new Date().toISOString()
    };

    // Filter based on mode includes
    if (config.includes.weather && dashboardData.weather) {
      filtered.weather = dashboardData.weather;
    }

    if (config.includes.transit && dashboardData.transit) {
      filtered.transit = dashboardData.transit;
    }

    if (config.includes.calendar && dashboardData.events) {
      filtered.events = dashboardData.events;
    }

    if (config.includes.nextEvent && dashboardData.nextEvent !== undefined) {
      filtered.nextEvent = dashboardData.nextEvent;
    }

    if (config.includes.tasks && dashboardData.tasks) {
      filtered.tasks = dashboardData.tasks;
    }

    // Include errors if present
    if (dashboardData.errors) {
      filtered.errors = dashboardData.errors;
    }

    return filtered;
  }

  /**
   * Reset to default mode
   */
  reset() {
    const previousMode = this.currentMode;
    this.currentMode = 'personal';
    this.lastChanged = new Date().toISOString();

    logger.info(`Mode reset from ${previousMode} to ${this.currentMode}`);

    return {
      success: true,
      mode: this.currentMode,
      previousMode,
      lastChanged: this.lastChanged
    };
  }
}

// Export singleton instance
const modeManager = new ModeManager();

module.exports = modeManager;
