require('dotenv').config();
const sql = require('mssql');

const CONNECT_TIMEOUT_MS = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '15000', 10);

const dbConfig = {
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '0', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  connectionTimeout: CONNECT_TIMEOUT_MS
};

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

async function run() {
  console.log('=== SQL Connect Only ===\n');
  console.log(`Target: ${dbConfig.server}:${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database || '(default)'}`);
  console.log(`Connect timeout: ${CONNECT_TIMEOUT_MS}ms\n`);

  const pool = await sql.connect(dbConfig);
  console.log('✓ SQL connection established');
  await pool.close();
  console.log('✓ Connection closed');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ SQL connection failed:', err.message);
    process.exit(1);
  });
