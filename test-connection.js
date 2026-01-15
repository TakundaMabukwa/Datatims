require('dotenv').config();
const { Client } = require('ssh2');
const sql = require('mssql');

console.log('=== SSH Tunnel Connection Tester ===\n');

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
    trustServerCertificate: true
  }
};

if (process.env.DB_NAME) {
  dbConfig.database = process.env.DB_NAME;
}

async function testConnection() {
  const sshClient = new Client();

  console.log(`[1/3] Testing SSH connection to ${sshConfig.host}:${sshConfig.port}...`);

  return new Promise((resolve, reject) => {
    sshClient.on('ready', () => {
      console.log('✓ SSH connection successful\n');
      console.log(`[2/3] Creating tunnel to ${dbConfig.server}:${dbConfig.port}...`);

      sshClient.forwardOut(
        '127.0.0.1',
        0,
        dbConfig.server,
        dbConfig.port,
        (err, stream) => {
          if (err) {
            console.error('✗ Tunnel creation failed:', err.message);
            sshClient.end();
            return reject(err);
          }

          console.log('✓ Tunnel established\n');
          console.log('[3/3] Testing SQL connection through tunnel...');

          const config = { ...dbConfig, stream };
          sql.connect(config)
            .then(pool => {
              console.log('✓ SQL connection successful\n');
              console.log('[TEST] Running test query...');
              
              return pool.request().query('SELECT 1 AS test');
            })
            .then(result => {
              console.log('✓ Test query successful:', result.recordset);
              console.log('\n=== All tests passed! ===');
              sshClient.end();
              resolve();
            })
            .catch(err => {
              console.error('✗ SQL connection failed:', err.message);
              sshClient.end();
              reject(err);
            });
        }
      );
    });

    sshClient.on('error', (err) => {
      console.error('✗ SSH connection failed:', err.message);
      reject(err);
    });

    sshClient.connect(sshConfig);
  });
}

testConnection()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
