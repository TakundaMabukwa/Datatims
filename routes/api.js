const express = require('express');
const { getDrivers, getDriverMaster, getVehicles, checkHealth } = require('../config/db');

const router = express.Router();
const startTime = Date.now();

/**
 * GET /api/drivers
 * MCP Resource: Driver records from vsl_drmaster
 */
router.get('/drivers', async (req, res, next) => {
  res.status(503).json({ error: 'Database not connected', reason: 'Waiting for IP whitelist' });
});

/**
 * GET /api/driver-master
 * MCP Resource: Driver master records from vsl_tbldrivermaster
 */
router.get('/driver-master', async (req, res, next) => {
  res.status(503).json({ error: 'Database not connected', reason: 'Waiting for IP whitelist' });
});

/**
 * GET /api/vehicles
 * MCP Resource: Vehicle records from vsl_tblvehiclemaster
 */
router.get('/vehicles', async (req, res, next) => {
  res.status(503).json({ error: 'Database not connected', reason: 'Waiting for IP whitelist' });
});

/**
 * GET /api/health
 * Basic health check (no DB connection)
 */
router.get('/health', async (req, res, next) => {
  res.json({ status: 'ok', database: 'not connected (waiting for whitelist)' });
});

/**
 * GET /api/status
 * Extended status check
 */
router.get('/status', async (req, res, next) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  res.json({
    status: 'operational',
    database: { connected: false, reason: 'Waiting for IP whitelist' },
    uptime: `${uptime}s`,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
