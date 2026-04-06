require('dotenv').config();
const { getDrivers, getDriverMaster, getVehicles } = require('../config/db');
const { getSupabaseClient } = require('../config/supabase');

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeDriverCode(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.toUpperCase().startsWith('EPS') ? text.toUpperCase() : `EPS${text.toUpperCase()}`;
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
  if (['Y', 'YES', 'TRUE', '1', 'C'].includes(normalized)) return true;
  if (['N', 'NO', 'FALSE', '0'].includes(normalized)) return false;
  return null;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString().slice(0, 10);
  if (iso === '1899-12-30' || iso === '1899-11-30') return null;
  return iso;
}

function joinParts(parts) {
  const filtered = parts.map(normalizeText).filter(Boolean);
  return filtered.length ? filtered.join(', ') : null;
}

function cleanPhone(value) {
  const text = normalizeText(value);
  return text ? text.replace(/^(G\+|OPN\+)/i, '+') : null;
}

function parseDriverName(fullName, explicitSurname) {
  const cleanFullName = normalizeText(fullName) || '';
  const cleanSurname = normalizeText(explicitSurname);

  if (cleanSurname) {
    const firstName = cleanFullName.replace(new RegExp(`${cleanSurname}$`, 'i'), '').trim();
    return {
      first_name: normalizeText(firstName) || cleanFullName,
      surname: cleanSurname
    };
  }

  const parts = cleanFullName.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { first_name: cleanFullName || null, surname: null };
  }

  return {
    first_name: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1]
  };
}

function mapClient(row) {
  return {
    client_id: normalizeText(row.DrNumber),
    type: 'client',
    name: normalizeText(row.DrName),
    address: joinParts([row.DrAddressline1, row.DrAddressline2, row.DrAddressline3]),
    street: normalizeText(row.DrDeliver1),
    city: normalizeText(row.DrDeliver2),
    state: normalizeText(row.DrRegion),
    postal_code: normalizeText(row.DrDeliver3 || row.DrAddressline3) || '',
    contact_person: normalizeText(row.DrContactName),
    contact_phone: cleanPhone(row.DrCellNo || row.DrTelephoneOps || row.DrTelephone),
    contact_email: normalizeText(row.DrEmail || row.DrOpsEmail),
    email: normalizeText(row.DrEmail || row.DrEmailStatement) || '',
    phone: cleanPhone(row.DrTelephone) || '',
    fax_number: normalizeText(row.DrFax || row.DrFaxOPS) || '',
    industry: normalizeText(row.DrAnalysis) || '',
    vat_number: normalizeText(row.DrVatNumber) || '',
    status: normalizeBool(row.DrDormantFlag) ? 'Dormant' : 'Active',
    credit_limit: normalizeNumber(row.DrCreditLimit) || 0,
    vat_registered: normalizeBool(row.DrVatFlag) || false,
    dormant_flag: normalizeBool(row.DrDormantFlag) || false,
    registration_number: normalizeText(row.Drregno) || '',
    registration_name: normalizeText(row.DrNameRegistration) || ''
  };
}

function mapDriver(row) {
  const parsedName = parseDriverName(row.DriverName, row.DriverSurname);
  const dormant = normalizeBool(row.DriverDormantFlag);

  return {
    driver_code: normalizeDriverCode(row.DriverNumber),
    first_name: parsedName.first_name,
    surname: parsedName.surname,
    id_or_passport_number: normalizeText(row.IdNumber),
    id_or_passport_document: normalizeText(row.IdNumber) ? 'ID' : null,
    email_address: normalizeText(row.DrvEmail),
    cell_number: cleanPhone(row.CellNumber),
    license_expiry_date: normalizeDate(row.LicenseDate),
    professional_driving_permit: row.PDPDate ? true : false,
    pdp_expiry_date: normalizeDate(row.PDPDate),
    appointment_date: normalizeDate(row.Appointmentdate),
    apointment_date: normalizeDate(row.Appointmentdate),
    passport_expiry: normalizeDate(row.PassportDate),
    passport_status: normalizeText(row.PassportNo),
    hazCamDate: normalizeDate(row.HazChemDate),
    medic_exam_date: normalizeDate(row.MedicalExaminationDate),
    pop: normalizeText(row.DrvProofOfPayment),
    available: dormant === null ? true : !dormant,
    status: dormant ? 'Dormant' : 'Active'
  };
}

function mapVehicle(row) {
  return {
    registration_number: normalizeText(row.Registration),
    make: normalizeText(row.Make),
    model: normalizeText(row.Model),
    vehicle_number: normalizeText(row.VehicleNumber),
    vehicle_year: normalizeText(row.VehicleYear),
    speedo_current: normalizeNumber(row.SpeedoCurrent),
    driver_code: normalizeText(row.DriverCode),
    driver_name: normalizeText(row.DriverName),
    branch_code: normalizeText(row.BranchCode),
    branch_name: normalizeText(row.BranchName),
    licence_date: normalizeDate(row.LicenceDate),
    cof_date: normalizeDate(row.COFDate),
    hazchem: normalizeBool(row.Hazchem),
    veh_dormant_flag: normalizeBool(row.VehDormantFlag),
    vehicle_category: normalizeText(row.VehicleCategory),
    department_code: normalizeText(row.departmentcode),
    department_name: normalizeText(row.departmentname),
    project_code: normalizeText(row.projectcode)
  };
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

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

async function getSourceRows(type) {
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
