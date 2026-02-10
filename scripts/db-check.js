require('dotenv').config();
const sql = require('mssql');

const CONNECT_TIMEOUT_MS = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '15000', 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.DB_REQUEST_TIMEOUT_MS || '15000', 10);

const dbConfig = {
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '0', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  connectionTimeout: CONNECT_TIMEOUT_MS,
  requestTimeout: REQUEST_TIMEOUT_MS
};

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

async function run() {
  console.log('=== SQL Connection Check ===\n');
  console.log(`Target: ${dbConfig.server}:${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database || '(default)'}`);
  console.log(`Connect timeout: ${CONNECT_TIMEOUT_MS}ms`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms\n`);

  const pool = await sql.connect(dbConfig);
  console.log('✓ SQL connection successful');

  const result = await pool.request().query('SELECT 1 AS test');
  console.log('✓ Test query result:', result.recordset);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ SQL connection failed:', err.message);
    process.exit(1);
  });
