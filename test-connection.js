require('dotenv').config();
const sql = require('mssql');

console.log('=== SSH Tunnel Connection Tester ===\n');

const dbConfig = {
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

async function testConnection() {
  console.log(`[1/2] Testing SQL connection to ${dbConfig.server}:${dbConfig.port}...`);
  const pool = await sql.connect(dbConfig);
  console.log('✓ SQL connection successful\n');
  console.log('[2/2] Running test query...');
  const result = await pool.request().query('SELECT 1 AS test');
  console.log('✓ Test query successful:', result.recordset);
  console.log('\n=== All tests passed! ===');
}

testConnection()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ Connection failed:', err.message);
    process.exit(1);
  });
