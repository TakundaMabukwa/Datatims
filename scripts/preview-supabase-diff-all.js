const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'preview-supabase-diff.js');

function runPreview(type, first, second) {
  console.log(`\n######## ${type.toUpperCase()} ########`);
  const result = spawnSync(process.execPath, [scriptPath, type, first, second], {
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function run() {
  const [
    clientA,
    clientB,
    driverA,
    driverB,
    vehicleA,
    vehicleB
  ] = process.argv.slice(2);

  if (!vehicleB) {
    console.error(
      'Usage: node scripts/preview-supabase-diff-all.js <client1> <client2> <driver1> <driver2> <vehicle1> <vehicle2>'
    );
    process.exit(1);
  }

  runPreview('clients', clientA, clientB);
  runPreview('drivers', driverA, driverB);
  runPreview('vehicles', vehicleA, vehicleB);
}

run();
