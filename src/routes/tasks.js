const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const lifestackClient = require('../services/lifestackClient');
const logger = require('../utils/logger');

/**
 * Filter urgent tasks based on due date
 * Urgent = due within 24 hours or overdue
 */
function filterUrgentTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return [];
  }

  const now = moment();
  const urgentThreshold = moment().add(24, 'hours');

  const urgentTasks = tasks.filter(task => {
    // Skip completed tasks
    if (task.completed || task.status === 'completed') {
      return false;
    }

    // Check if task has a due date
    if (!task.due && !task.dueDate) {
      return false;
    }

    const dueDate = moment(task.due || task.dueDate);

    // Task is urgent if:
    // 1. It's overdue (due date is in the past)
    // 2. It's due within the next 24 hours
    return dueDate.isBefore(urgentThreshold);
  });

  // Sort by due date (earliest first)
  return urgentTasks.sort((a, b) => {
    const aDue = moment(a.due || a.dueDate);
    const bDue = moment(b.due || b.dueDate);
    return aDue.diff(bDue);
  });
}

/**
 * GET /api/tasks/all
 * Returns all tasks from Lifestack
 */
router.get('/all', async (req, res, next) => {
  try {
    logger.debug('GET /api/tasks/all');

    const tasks = await lifestackClient.getTasks();

    res.json({
      success: true,
      data: {
        tasks,
        count: tasks.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/tasks/all: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/tasks/urgent
 * Returns urgent tasks (due within 24 hours or overdue)
 */
router.get('/urgent', async (req, res, next) => {
  try {
    logger.debug('GET /api/tasks/urgent');

    const tasks = await lifestackClient.getTasks();
    const urgentTasks = filterUrgentTasks(tasks);

    res.json({
      success: true,
      data: {
        tasks: urgentTasks,
        count: urgentTasks.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/tasks/urgent: ${error.message}`);
    next(error);
  }
});

/**
 * GET /api/tasks (alias for /all)
 * Returns all tasks from Lifestack
 */
router.get('/', async (req, res, next) => {
  try {
    logger.debug('GET /api/tasks');

    const tasks = await lifestackClient.getTasks();

    res.json({
      success: true,
      data: {
        tasks,
        count: tasks.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error in GET /api/tasks: ${error.message}`);
    next(error);
  }
});

module.exports = router;
