require('dotenv').config();
const mysql = require('mysql2/promise');
const { getMysqlSslFromEnv } = require('./config/db-options');

console.log('=== MySQL Connection Tester ===\n');

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '15000', 10)
};

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

const ssl = getMysqlSslFromEnv();
if (ssl !== undefined) {
  dbConfig.ssl = ssl;
}

async function testConnection() {
  console.log(`[1/2] Testing MySQL connection to ${dbConfig.host}:${dbConfig.port}...`);
  const connection = await mysql.createConnection(dbConfig);
  console.log('Connection successful\n');
  console.log('[2/2] Running test query...');
  const [rows] = await connection.query('SELECT 1 AS test');
  console.log('Test query successful:', rows);
  console.log('\n=== All tests passed! ===');
  await connection.end();
}

testConnection()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Connection failed:', err.message);
    process.exit(1);
  });
