require('dotenv').config();
const { connectVpn, getVpnStatus } = require('../config/vpn');

async function run() {
  console.log('=== VPN Connect ===\n');

  const before = await getVpnStatus();
  if (before.enabled) {
    console.log(`Initial status: ${before.connected ? 'connected' : 'disconnected'}`);
  } else {
    console.log(`Initial status: skipped (${before.reason})`);
  }

  const result = await connectVpn();

  if (result.skipped) {
    console.log(`Skipped: ${result.reason}`);
    return;
  }

  console.log(result.reused ? 'VPN already connected' : 'VPN connected successfully');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
