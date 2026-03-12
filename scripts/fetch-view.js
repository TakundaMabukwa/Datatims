require('dotenv').config();
const mysql = require('mysql2/promise');
const { getMysqlSslFromEnv } = require('../config/db-options');

const CONNECT_TIMEOUT_MS = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '15000', 10);

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '0', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  connectTimeout: CONNECT_TIMEOUT_MS
};

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

const ssl = getMysqlSslFromEnv();
if (ssl !== undefined) {
  dbConfig.ssl = ssl;
}

const VIEW = process.env.DB_VIEW || process.argv[2] || 'epssched.vsl_drmaster';
const LIMIT = parseInt(process.env.DB_LIMIT || process.argv[3] || '10', 10);

async function run() {
  console.log('=== MySQL View Fetch ===\n');
  console.log(`Target: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database || '(default)'}`);
  console.log(`View: ${VIEW}`);
  console.log(`Limit: ${LIMIT}`);
  console.log(`Connect timeout: ${CONNECT_TIMEOUT_MS}ms\n`);

  const connection = await mysql.createConnection(dbConfig);
  const [rows] = await connection.query(`SELECT * FROM ${VIEW} LIMIT ${LIMIT}`);
  console.log(JSON.stringify(rows, null, 2));
  await connection.end();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SQL fetch failed:', err.message);
    process.exit(1);
  });
