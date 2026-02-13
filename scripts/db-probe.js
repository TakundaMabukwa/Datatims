require('dotenv').config();
const mysql = require('mysql2/promise');
const { parseBoolean } = require('../config/db-options');

const CONNECT_TIMEOUT_MS = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10);

const baseConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  connectTimeout: CONNECT_TIMEOUT_MS
};

const databaseCandidates = process.env.DB_PROBE_DATABASES
  ? process.env.DB_PROBE_DATABASES.split(',').map(v => v.trim()).filter(Boolean)
  : [process.env.DB_NAME || undefined];

const sslCandidates = process.env.DB_PROBE_SSL
  ? process.env.DB_PROBE_SSL.split(',').map(v => parseBoolean(v.trim(), false))
  : [false, true];

function getConfig(database, sslEnabled) {
  const cfg = { ...baseConfig };
  if (database) cfg.database = database;
  if (sslEnabled) cfg.ssl = {};
  return cfg;
}

async function testCandidate(database, sslEnabled) {
  const label = `database=${database || '(default)'}, ssl=${sslEnabled}`;
  let connection;
  try {
    connection = await mysql.createConnection(getConfig(database, sslEnabled));
    const [rows] = await connection.query('SELECT 1 AS test');
    console.log(`OK  : ${label} ->`, rows);
    await connection.end();
    return { ok: true, database, sslEnabled };
  } catch (err) {
    console.log(`FAIL: ${label} -> ${err.message}`);
    if (connection) {
      await connection.end().catch(() => {});
    }
    return { ok: false };
  }
}

async function run() {
  console.log('=== MySQL Probe ===');
  console.log(`Target: ${baseConfig.host}:${baseConfig.port}`);
  console.log(`Timeout: ${CONNECT_TIMEOUT_MS}ms\n`);

  for (const database of databaseCandidates) {
    for (const sslEnabled of sslCandidates) {
      const result = await testCandidate(database, sslEnabled);
      if (result.ok) {
        console.log('\nUse this in .env:');
        console.log(`DB_NAME=${result.database || ''}`);
        console.log(`DB_SSL=${result.sslEnabled}`);
        return;
      }
    }
  }

  console.log('\nNo candidate worked.');
  process.exit(1);
}

run().catch((err) => {
  console.error(`Probe failed: ${err.message}`);
  process.exit(1);
});
