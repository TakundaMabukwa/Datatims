const express = require('express');
const syncService = require('../config/sync');

const router = express.Router();
const startTime = Date.now();

/**
 * GET /api/drivers
 * Returns cached driver data from JSON file
 */
router.get('/drivers', async (req, res, next) => {
  try {
    const data = await syncService.getData('drivers.json');
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Data not available', details: err.message });
  }
});

/**
 * GET /api/driver-master
 * Returns cached driver master data from JSON file
 */
router.get('/driver-master', async (req, res, next) => {
  try {
    const data = await syncService.getData('driver-master.json');
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Data not available', details: err.message });
  }
});

/**
 * GET /api/vehicles
 * Returns cached vehicle data from JSON file
 */
router.get('/vehicles', async (req, res, next) => {
  try {
    const data = await syncService.getData('vehicles.json');
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Data not available', details: err.message });
  }
});

/**
 * GET /api/health
 * Basic health check
 */
router.get('/health', async (req, res, next) => {
  res.json({ status: 'ok', database: 'cached data' });
});

/**
 * GET /api/status
 * Extended status with sync information
 */
router.get('/status', async (req, res, next) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const lastSync = syncService.getLastSync();
  
  res.json({
    status: 'operational',
    database: { 
      mode: 'daily sync',
      lastSync: lastSync ? lastSync.toISOString() : 'never',
      nextSync: lastSync ? new Date(lastSync.getTime() + 24 * 60 * 60 * 1000).toISOString() : 'pending'
    },
    uptime: `${uptime}s`,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/sync
 * Manually trigger data sync from database
 */
router.post('/sync', async (req, res, next) => {
  try {
    console.log('[API] Manual sync triggered');
    await syncService.sync();
    res.json({ 
      success: true, 
      message: 'Data sync completed',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: 'Sync failed', 
      details: err.message 
    });
  }
});

module.exports = router;
