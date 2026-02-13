require('dotenv').config();
const net = require('net');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.NET_TIMEOUT_MS || '5000', 10);
const COMMON_PORTS = [
  20, 21, 22, 23, 25, 53, 67, 68, 69, 80, 110, 111, 123, 135, 137, 138, 139,
  143, 161, 162, 389, 443, 445, 465, 500, 514, 515, 587, 636, 873, 993, 995,
  1025, 1433, 1434, 1521, 2049, 2375, 2376, 2483, 2484, 27017, 27018, 27019,
  3000, 3306, 3389, 5432, 5672, 5900, 5985, 5986, 6379, 6443, 8000, 8008,
  8080, 8081, 8443, 8888, 9000, 9090, 9200, 9300, 10000, 10443, 11211
];

const RAW_NET_PORTS = (process.env.NET_PORTS || '').trim();
const PORTS = RAW_NET_PORTS
  .split(',')
  .map(p => parseInt(p.trim(), 10))
  .filter(p => Number.isInteger(p) && p > 0);

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
  const basePort = parseInt(process.env.DB_PORT || '0', 10);
  const useCommonPorts = RAW_NET_PORTS.toLowerCase() === 'common';
  const portsToCheck = useCommonPorts
    ? COMMON_PORTS
    : (PORTS.length ? PORTS : (basePort ? [basePort] : COMMON_PORTS));

  const targets = [
    { label: 'DB_HOST', host: process.env.DB_HOST },
    { label: 'IP1', host: process.env.IP1 },
    { label: 'IP2', host: process.env.IP2 }
  ];

  console.log('=== Network Reachability Check ===\n');
  console.log(`Timeout: ${DEFAULT_TIMEOUT_MS}ms\n`);

  if (!portsToCheck.length) {
    console.log('No ports specified. Set NET_PORTS=1433,3357 or DB_PORT.');
    return;
  }

  for (const target of targets) {
    for (const port of portsToCheck) {
      const result = await checkHostPort(target.host, port);
      const name = `${target.label} (${target.host || 'unset'}:${port})`;
      if (result.ok) {
        console.log(`✓ ${name} reachable`);
      } else {
        console.log(`✗ ${name} not reachable: ${result.error}`);
      }
    }
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
