const sql = require('mssql');
const { Client } = require('ssh2');

/**
 * Connection Manager
 * If SSH_HOST is provided, connect via SSH tunnel.
 * Otherwise, connect directly to SQL Server.
 */
let sshClient = null;
let pool = null;
let isConnecting = false;

const sshConfig = {
  host: process.env.SSH_HOST,
  port: parseInt(process.env.SSH_PORT) || 22,
  username: process.env.SSH_USER,
  password: process.env.SSH_PASS
};

const dbConfig = {
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
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

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

/**
 * Establish SQL connection (direct or via SSH tunnel)
 */
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
      await pool.close().catch(() => {});
      pool = null;
    }
    if (sshClient) {
      sshClient.end();
      sshClient = null;
    }

    if (sshConfig.host) {
      console.log(`[SSH] Connecting to ${sshConfig.host}:${sshConfig.port}...`);
      
      await new Promise((resolve, reject) => {
        sshClient = new Client();
        
        sshClient.on('ready', () => {
          console.log('[SSH] ✓ Tunnel established');
          resolve();
        });
        
        sshClient.on('error', (err) => {
          console.error('[SSH] Connection error:', err.message);
          reject(err);
        });
        
        sshClient.on('end', () => {
          console.log('[SSH] Connection closed');
          pool = null;
        });
        
        sshClient.connect(sshConfig);
      });

      console.log(`[DB] Connecting to ${dbConfig.server}:${dbConfig.port} through tunnel...`);
      
      pool = await new Promise((resolve, reject) => {
        sshClient.forwardOut(
          '127.0.0.1',
          0,
          dbConfig.server,
          dbConfig.port,
          (err, stream) => {
            if (err) {
              console.error('[DB] Tunnel forward error:', err.message);
              return reject(err);
            }

            const config = { ...dbConfig, stream };
            sql.connect(config)
              .then(p => {
                console.log('[DB] ✓ Connected through SSH tunnel');
                
                p.on('error', err => {
                  console.error('[DB] Pool error:', err.message);
                  pool = null;
                });
                
                resolve(p);
              })
              .catch(reject);
          }
        );
      });
    } else {
      console.log(`[DB] Connecting directly to ${dbConfig.server}:${dbConfig.port}...`);
      pool = await sql.connect(dbConfig);
      console.log('[DB] ✓ Connected directly');
      pool.on('error', err => {
        console.error('[DB] Pool error:', err.message);
        pool = null;
      });
    }

    return pool;
  } catch (err) {
    console.error('[CONNECTION] Failed:', err.message);
    if (sshClient) sshClient.end();
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
    console.log('[CONNECTION] Establishing SSH tunnel...');
    await createConnection();
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
  return { connected: true, tunnel: 'active', server: dbConfig.server };
}

module.exports = { getPool, getDrivers, getDriverMaster, getVehicles, checkHealth };
