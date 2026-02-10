require('dotenv').config();
const net = require('net');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.NET_TIMEOUT_MS || '5000', 10);

function checkHostPort(host, port, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve({ host, port, ok: false, error: 'missing host or port' });
      return;
    }

    const socket = new net.Socket();
    let finished = false;

    const done = (ok, error) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ host, port, ok, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false, `timeout after ${timeoutMs}ms`));
    socket.once('error', (err) => done(false, err.message));

    socket.connect(port, host);
  });
}

async function run() {
  const targets = [
    { label: 'DB_HOST', host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '0', 10) },
    { label: 'IP1', host: process.env.IP1, port: parseInt(process.env.DB_PORT || '0', 10) },
    { label: 'IP2', host: process.env.IP2, port: parseInt(process.env.DB_PORT || '0', 10) }
  ];

  console.log('=== Network Reachability Check ===\n');
  console.log(`Timeout: ${DEFAULT_TIMEOUT_MS}ms\n`);

  for (const target of targets) {
    const result = await checkHostPort(target.host, target.port);
    const name = `${target.label} (${target.host || 'unset'}:${target.port || 'unset'})`;
    if (result.ok) {
      console.log(`✓ ${name} reachable`);
    } else {
      console.log(`✗ ${name} not reachable: ${result.error}`);
    }
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
