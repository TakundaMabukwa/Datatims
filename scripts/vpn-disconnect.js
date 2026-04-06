require('dotenv').config();
const { disconnectVpn } = require('../config/vpn');

disconnectVpn()
  .then(() => {
    console.log('VPN disconnected');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
