require('dotenv').config();
const { getDrivers, getDriverMaster, getVehicles } = require('../config/db');
const { getSupabaseClient } = require('../config/supabase');
const {
  normalizeText, normalizeDriverCode, normalizeDate, normalizeBool, normalizeNumber,
  joinParts, joinPartsNoComma, cleanPhone, parseDriverName, valuesEqual,
  mapClient, mapDriver, mapVehicle
} = require('../config/supabase-sync');

function buildDiff(currentRow, nextRow) {
  const diff = [];
  for (const key of Object.keys(nextRow)) {
    if (!valuesEqual(currentRow?.[key] ?? null, nextRow[key] ?? null)) {
      diff.push({
        field: key,
        current: currentRow?.[key] ?? null,
        next: nextRow[key] ?? null
      });
    }
  }
  return diff;
}

async function fetchTarget(table, keyColumn, keyValue) {
  const supabase = getSupabaseClient();
  const lookupValues = table === 'drivers'
    ? [keyValue, keyValue.replace(/^EPS/, '')]
    : [keyValue];

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .in(keyColumn, lookupValues);

  if (error) {
    throw new Error(`Supabase lookup failed for ${table}: ${error.message}`);
  }

  return (data || [])[0] || null;
}

function getSourceRows(type) {
  if (type === 'clients') return getDrivers();
  if (type === 'drivers') return getDriverMaster();
  if (type === 'vehicles') return getVehicles();
  throw new Error(`Unsupported type: ${type}`);
}

function getConfig(type) {
  if (type === 'clients') {
    return {
      table: 'eps_client_list',
      keyColumn: 'client_id',
      sourceKey: row => normalizeText(row.DrNumber),
      mapRow: mapClient
    };
  }

  if (type === 'drivers') {
    return {
      table: 'drivers',
      keyColumn: 'driver_code',
      sourceKey: row => normalizeDriverCode(row.DriverNumber),
      mapRow: mapDriver
    };
  }

  if (type === 'vehicles') {
    return {
      table: 'vehiclesc',
      keyColumn: 'registration_number',
      sourceKey: row => normalizeText(row.Registration),
      mapRow: mapVehicle
    };
  }

  throw new Error(`Unsupported type: ${type}`);
}

async function run() {
  const type = process.argv[2];
  const checkerA = process.argv[3];
  const checkerB = process.argv[4];

  if (!type || !checkerA || !checkerB) {
    console.error('Usage: node scripts/preview-supabase-diff.js <clients|drivers|vehicles> <key1> <key2>');
    process.exit(1);
  }

  const config = getConfig(type);
  const sourceRows = await getSourceRows(type);
  const keysToCheck = [checkerA, checkerB].map(value =>
    type === 'drivers' ? normalizeDriverCode(value) : normalizeText(value)
  );

  for (const key of keysToCheck) {
    const sourceRow = sourceRows.find(row => config.sourceKey(row) === key);
    const targetRow = await fetchTarget(config.table, config.keyColumn, key);

    console.log(`\n=== ${type.toUpperCase()} ${key} ===`);

    if (!sourceRow) {
      console.log('Datatims row not found');
      continue;
    }

    const mappedRow = config.mapRow(sourceRow);
    const diff = buildDiff(targetRow, mappedRow);

    console.log(`Supabase row exists: ${targetRow ? 'yes' : 'no'}`);
    console.log(`Changed fields: ${diff.length}`);
    console.log(JSON.stringify(diff, null, 2));
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
