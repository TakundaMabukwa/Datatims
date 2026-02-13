require('dotenv').config();
const mysql = require('mysql2/promise');
const { getMysqlSslFromEnv } = require('../config/db-options');

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '0', 10),
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

const views = [
  'epssched.vsl_drmaster',
  'epssched.vsl_tbldrivermaster',
  'epssched.vsl_tblvehiclemaster',
  'epslogsched.vsl_drmaster',
  'epslogsched.vsl_tbldrivermaster',
  'epslogsched.vsl_tblvehiclemaster'
];

async function run() {
  console.log('=== View Access Check ===');
  console.log(`Target: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`Database: ${dbConfig.database || '(default)'}\n`);

  const connection = await mysql.createConnection(dbConfig);
  for (const viewName of views) {
    try {
      const [rows] = await connection.query(`SELECT * FROM ${viewName} LIMIT 1`);
      console.log(`OK: ${viewName} (rows returned: ${rows.length})`);
    } catch (err) {
      console.log(`FAIL: ${viewName} -> ${err.message}`);
    }
  }
  await connection.end();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  });
