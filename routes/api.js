const express = require('express');
const { getDrivers, getDriverMaster, getVehicles, checkHealth } = require('../config/db');

const router = express.Router();
const startTime = Date.now();

/**
 * GET /api/drivers
 * MCP Resource: Driver records from vsl_drmaster
 */
router.get('/drivers', async (req, res, next) => {
  try {
    const data = await getDrivers();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/driver-master
 * MCP Resource: Driver master records from vsl_tbldrivermaster
 */
router.get('/driver-master', async (req, res, next) => {
  try {
    const data = await getDriverMaster();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/vehicles
 * MCP Resource: Vehicle records from vsl_tblvehiclemaster
 */
router.get('/vehicles', async (req, res, next) => {
  try {
    const data = await getVehicles();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health
 * Verifies network chain is open with simple SELECT 1
 */
router.get('/health', async (req, res, next) => {
  try {
    await checkHealth();
    res.json({ status: 'ok', database: 'connected', chain: 'open' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/status
 * Extended health check with uptime and timestamp
 */
router.get('/status', async (req, res, next) => {
  try {
    const dbHealth = await checkHealth();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    
    res.json({
      status: 'operational',
      database: dbHealth,
      uptime: `${uptime}s`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: { connected: false, error: err.message },
      uptime: `${Math.floor((Date.now() - startTime) / 1000)}s`,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
