require('dotenv').config();
const { getVehicles } = require('../config/db');

async function run() {
  const reg = process.argv[2];
  if (!reg) {
    console.error('Usage: node scripts/peek-vehicle.js <registration>');
    process.exit(1);
  }

  const rows = await getVehicles();
  const found = rows.find(r => (r.Registration || '').trim().toUpperCase() === reg.trim().toUpperCase());

  if (!found) {
    console.log(`Vehicle ${reg} not found in Datatims`);
    process.exit(1);
  }

  console.log(`=== RAW DATATIMS ROW: ${reg} ===`);
  for (const [key, value] of Object.entries(found)) {
    console.log(`${key}: ${value ?? '(null)'}`);
  }
}

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
