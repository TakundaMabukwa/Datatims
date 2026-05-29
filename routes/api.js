const express = require('express');
const syncService = require('../config/sync');
const { runSupabaseSync } = require('../config/supabase-sync');

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
 * GET /api/log-drivers
 * Returns cached log driver data from JSON file
 */
router.get('/log-drivers', async (req, res, next) => {
  try {
    const data = await syncService.getData('log-drivers.json');
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Data not available', details: err.message });
  }
});

/**
 * GET /api/log-driver-master
 * Returns cached log driver master data from JSON file
 */
router.get('/log-driver-master', async (req, res, next) => {
  try {
    const data = await syncService.getData('log-driver-master.json');
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: 'Data not available', details: err.message });
  }
});

/**
 * GET /api/log-vehicles
 * Returns cached log vehicle data from JSON file
 */
router.get('/log-vehicles', async (req, res, next) => {
  try {
    const data = await syncService.getData('log-vehicles.json');
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

/**
 * POST /api/sync-supabase
 * Connects VPN if needed, compares Datatims to Supabase, and updates records.
 */
router.post('/sync-supabase', async (req, res, next) => {
  try {
    const dryRun = /^(1|true|yes)$/i.test(String(req.body?.dryRun || 'false'));
    console.log(`[API] Supabase sync triggered${dryRun ? ' (dry run)' : ''}`);

    const summary = await runSupabaseSync({ dryRun });

    res.json({
      success: true,
      message: dryRun ? 'Supabase dry run completed' : 'Supabase sync completed',
      ...summary
    });
  } catch (err) {
    const status = err.code === 'SYNC_IN_PROGRESS' ? 409 : 500;
    res.status(status).json({
      success: false,
      error: 'Supabase sync failed',
      details: err.message
    });
  }
});

/**
 * GET /api/driver-credentials
 * Download driver emails and passwords as CSV
 */
router.get('/driver-credentials', async (req, res, next) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    function ensureMinPassword(pw) {
      if (pw.length >= 6) return pw;
      const rest = pw.replace(/^EPS/i, '');
      return `EPS00${rest}`;
    }

    const { data, error } = await supabase
      .from('drivers')
      .select('driver_code, email_address, first_name, surname')
      .not('email_address', 'is', null)
      .order('driver_code');

    if (error) throw new Error(error.message);

    let csv = 'driver_code,email,password\n';
    for (const d of data) {
      const pass = ensureMinPassword(d.driver_code);
      csv += `${d.driver_code},${d.email_address},${pass}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="driver-credentials.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
