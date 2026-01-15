const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

/**
 * GET /api/drivers
 * Retrieves all driver records
 */
router.get('/drivers', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM epssched.vsl_drmaster');
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/vehicles
 * Retrieves all vehicle records
 */
router.get('/vehicles', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM epssched.vsl_tblvehiclemaster');
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health
 * Database connectivity health check
 */
router.get('/health', async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS status');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
