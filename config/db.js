const sql = require('mssql');

/**
 * Database Connection Manager (via local TCP proxy)
 * Connects to localhost proxy which routes through IP1 → IP2 → DB Server
 */
const config = {
  server: '127.0.0.1',
  port: parseInt(process.env.PROXY_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 60000,
  requestTimeout: 60000
};

let pool = null;
let isConnecting = false;

/**
 * Initialize connection pool
 */
async function createPool() {
  if (isConnecting) {
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return pool;
  }

  isConnecting = true;
  try {
    console.log(`[DB] Connecting via proxy on localhost:${config.port}...`);
    pool = await sql.connect(config);
    
    pool.on('error', err => {
      console.error('[DB] Pool error:', err.message);
      pool = null;
    });

    console.log('[DB] ✓ Connection established through IP chain');
    return pool;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    pool = null;
    throw err;
  } finally {
    isConnecting = false;
  }
}

/**
 * Get pool with automatic reconnection
 */
async function getPool() {
  if (!pool || !pool.connected) {
    console.log('[DB] Reconnecting...');
    await createPool();
  }
  return pool;
}

/**
 * Centralized query function
 */
async function executeQuery(query) {
  const pool = await getPool();
  const result = await pool.request().query(query);
  return result.recordset;
}

/**
 * MCP Resource: Drivers
 */
async function getDrivers() {
  return executeQuery('SELECT * FROM epssched.vsl_drmaster');
}

/**
 * MCP Resource: Driver Master
 */
async function getDriverMaster() {
  return executeQuery('SELECT * FROM epssched.vsl_tbldrivermaster');
}

/**
 * MCP Resource: Vehicles
 */
async function getVehicles() {
  return executeQuery('SELECT * FROM epssched.vsl_tblvehiclemaster');
}

/**
 * Health check
 */
async function checkHealth() {
  await executeQuery('SELECT 1 AS status');
  return { connected: true, proxy: 'active', chain: `${process.env.IP1} → ${process.env.IP2} → ${process.env.DB_HOST}` };
}

module.exports = { getPool, getDrivers, getDriverMaster, getVehicles, checkHealth };
