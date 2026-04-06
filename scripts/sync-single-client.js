require('dotenv').config();
const { getPool } = require('../config/db');
const { getSupabaseClient } = require('../config/supabase');

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeBool(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toUpperCase();
  if (['Y', 'YES', 'TRUE', '1'].includes(normalized)) return true;
  if (['N', 'NO', 'FALSE', '0'].includes(normalized)) return false;
  return null;
}

function joinParts(parts) {
  const filtered = parts.map(normalizeText).filter(Boolean);
  return filtered.length ? filtered.join(', ') : null;
}

function joinPartsNoComma(parts) {
  const filtered = parts.map(normalizeText).filter(Boolean);
  return filtered.length ? filtered.join(' ') : null;
}

function cleanPhone(value) {
  const text = normalizeText(value);
  return text ? text.replace(/^(G\+|OPN\+)/i, '+') : null;
}

function mapClient(row) {
  const deliveryAddress = joinParts([row.DrDeliver1, row.DrDeliver2, row.DrDeliver3]);
  const postalAddress = joinParts([row.DrAddressline1, row.DrAddressline2, row.DrAddressline3]);
  const compactDeliveryAddress = joinPartsNoComma([row.DrDeliver1, row.DrDeliver2, row.DrDeliver3]);
  const compactPostalAddress = joinPartsNoComma([row.DrAddressline1, row.DrAddressline2, row.DrAddressline3]);
  const primaryAddress = deliveryAddress || postalAddress;
  const compactPrimaryAddress = compactDeliveryAddress || compactPostalAddress || '';

  return {
    client_id: normalizeText(row.DrNumber),
    type: 'client',
    name: normalizeText(row.DrName),
    address: primaryAddress || '',
    street: '',
    city: '',
    state: '',
    postal_code: compactPrimaryAddress,
    contact_person: normalizeText(row.DrContactName),
    contact_phone: cleanPhone(row.DrCellNo || row.DrTelephoneOps),
    contact_email: normalizeText(row.DrEmail || row.DrOpsEmail),
    email: '',
    phone: cleanPhone(row.DrTelephone) || '',
    fax_number: normalizeText(row.DrFax || row.DrFaxOPS) || '',
    industry: '',
    vat_number: normalizeText(row.DrVatNumber) || '',
    status: normalizeBool(row.DrDormantFlag) ? 'Dormant' : 'Active',
    credit_limit: normalizeNumber(row.DrCreditLimit) || 0,
    vat_registered: normalizeBool(row.DrVatFlag) || false,
    dormant_flag: normalizeBool(row.DrDormantFlag) || false,
    registration_number: normalizeText(row.Drregno) || '',
    registration_name: normalizeText(row.DrNameRegistration) || '',
    updated_at: new Date().toISOString()
  };
}

async function fetchClientFromDatatims(clientId) {
  const pool = await getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM epssched.vsl_drmaster WHERE DrNumber = ? LIMIT 1',
    [clientId]
  );
  return rows[0] || null;
}

async function run() {
  const clientId = process.argv[2];
  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN || 'false');

  if (!clientId) {
    console.error('Usage: node scripts/sync-single-client.js <client_id>');
    process.exit(1);
  }

  console.log(`=== Single Client Sync${dryRun ? ' (Dry Run)' : ''} ===\n`);
  console.log(`Client ID: ${clientId}`);

  const row = await fetchClientFromDatatims(clientId);
  if (!row) {
    throw new Error(`Client ${clientId} was not found in Datatims`);
  }

  const mapped = mapClient(row);
  console.log('Mapped payload:');
  console.log(JSON.stringify(mapped, null, 2));

  if (dryRun) {
    console.log('\nDry run complete, no Supabase changes written');
    return;
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('eps_client_list')
    .upsert([mapped], { onConflict: 'client_id' });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log('\nSupabase upsert complete');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
