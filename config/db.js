const mysql = require('mysql2/promise');
const { getMysqlSslFromEnv } = require('./db-options');

let pool = null;
let isConnecting = false;

function getDbConfig() {
  const config = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_MAX || '10', 10),
    queueLimit: 0,
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '60000', 10)
  };

  if (process.env.DB_NAME) {
    config.database = process.env.DB_NAME;
  }

  const ssl = getMysqlSslFromEnv();
  if (ssl !== undefined) {
    config.ssl = ssl;
  }

  return config;
}

async function createConnection() {
  if (isConnecting) {
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return pool;
  }

  isConnecting = true;
  try {
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }

    const dbConfig = getDbConfig();
    console.log(`[DB] Connecting to ${dbConfig.host}:${dbConfig.port}...`);
    pool = mysql.createPool(dbConfig);
    await pool.query('SELECT 1 AS status');
    console.log('[DB] Connected');

    return pool;
  } catch (err) {
    console.error('[CONNECTION] Failed:', err.message);
    pool = null;
    throw err;
  } finally {
    isConnecting = false;
  }
}

async function getPool() {
  if (!pool) {
    console.log('[CONNECTION] Establishing database connection...');
    await createConnection();
  }
  return pool;
}

async function executeQuery(query) {
  const dbPool = await getPool();
  const [rows] = await dbPool.query(query);
  return rows;
}

async function getDrivers() {
  return executeQuery('SELECT * FROM epssched.vsl_drmaster');
}

async function getDriverMaster() {
  return executeQuery('SELECT * FROM epssched.vsl_tbldrivermaster');
}

async function getVehicles() {
  return executeQuery('SELECT * FROM epssched.vsl_tblvehiclemaster');
}

async function getLogDrivers() {
  return executeQuery('SELECT * FROM epslogsched.vsl_drmaster');
}

async function getLogDriverMaster() {
  return executeQuery('SELECT * FROM epslogsched.vsl_tbldrivermaster');
}

async function getLogVehicles() {
  return executeQuery('SELECT * FROM epslogsched.vsl_tblvehiclemaster');
}

async function checkHealth() {
  await executeQuery('SELECT 1 AS status');
  return { connected: true, engine: 'mysql', server: process.env.DB_HOST };
}

module.exports = {
  getPool,
  getDrivers,
  getDriverMaster,
  getVehicles,
  getLogDrivers,
  getLogDriverMaster,
  getLogVehicles,
  checkHealth
};
