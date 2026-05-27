const { getDrivers, getDriverMaster, getVehicles } = require('./db');
const { getSupabaseClient } = require('./supabase');
const { connectVpn, getVpnConfig } = require('./vpn');

const BATCH_SIZE = parseInt(process.env.SUPABASE_BATCH_SIZE || '500', 10);

let syncInProgress = false;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

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
  if (iso === '1899-12-30' || iso === '1899-11-30') {
    return null;
  }
  return iso;
}

function joinParts(parts) {
  const filtered = parts.map(normalizeText).filter(Boolean);
  return filtered.length ? filtered.join(', ') : null;
}

function joinPartsNoComma(parts) {
  const filtered = parts.map(normalizeText).filter(Boolean);
  return filtered.length ? filtered.join(' ') : null;
}

function parseDriverName(fullName, explicitSurname) {
  const cleanFullName = normalizeText(fullName) || '';
  const cleanSurname = normalizeText(explicitSurname);

  if (cleanSurname) {
    const upperSurname = cleanSurname.toUpperCase();
    const firstName = cleanFullName.replace(new RegExp(`${upperSurname}$`, 'i'), '').trim();
    return {
      first_name: normalizeText(firstName) || cleanFullName,
      surname: cleanSurname
    };
  }

  const parts = cleanFullName.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return {
      first_name: cleanFullName || null,
      surname: null
    };
  }

  return {
    first_name: parts.slice(0, -1).join(' '),
    surname: parts[parts.length - 1]
  };
}

function cleanPhone(value) {
  const text = normalizeText(value);
  return text ? text.replace(/^(G\+|OPN\+)/i, '+') : null;
}

function toJsonComparable(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(toJsonComparable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = toJsonComparable(value[key]);
      return acc;
    }, {});
  }
  return value === undefined ? null : value;
}

function valuesEqual(a, b) {
  return JSON.stringify(toJsonComparable(a)) === JSON.stringify(toJsonComparable(b));
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
    engine_number: normalizeText(row.EngineNumber),
    vin_number: normalizeText(row.VinNumber),
    make: normalizeText(row.Make),
    model: normalizeText(row.Model),
    manufactured_year: normalizeText(row.VehicleYear),
    vehicle_type: normalizeText(row.VehicleType),
    license_expiry_date: normalizeDate(row.LicenceDate),
    vehicle_number: normalizeText(row.VehicleNumber),
    vehicle_year: normalizeText(row.VehicleYear),
    speedo_current: normalizeNumber(row.SpeedoCurrent),
    transp_no: normalizeText(row.TranspNo),
    transp_descrip: normalizeText(row.TranspDescrip),
    vehicle_call_number: normalizeText(row.VehicleCallNumber),
    driver_code: normalizeText(row.DriverCode),
    vehicle_type_descrip: normalizeText(row.VehicleTypeDescrip),
    driver_name: normalizeText(row.DriverName),
    private_cell: cleanPhone(row.PrivateCell),
    slmn_code: normalizeText(row.SlmnCode),
    ledger_code: normalizeText(row.LedgerCode),
    ledger_description: normalizeText(row.LedgerDescription),
    slmn_name: normalizeText(row.SlmnName),
    veh_location: normalizeText(row.VehLocation),
    branch_code: normalizeText(row.BranchCode),
    branch_name: normalizeText(row.BranchName),
    licence_date: normalizeDate(row.LicenceDate),
    cof_date: normalizeDate(row.COFDate),
    botswana: normalizeBool(row.Botswana),
    namibia: normalizeBool(row.Namibia),
    hazchem: normalizeBool(row.Hazchem),
    veh_dormant_flag: normalizeBool(row.VehDormantFlag),
    vehicle_category: normalizeText(row.VehicleCategory),
    veh_exception: normalizeText(row.VehException),
    trailer_no: normalizeText(row.TrailerNo),
    trailer_name: normalizeText(row.TrailerName),
    trailer_no2: normalizeText(row.TrailerNo2),
    trailer_name2: normalizeText(row.TrailerName2),
    trailer2_type: normalizeText(row.Trailer2Type),
    trailer_type: normalizeText(row.TrailerType),
    driver_code_two: normalizeText(row.DriverCodeTwo),
    driver_name_two: normalizeText(row.DriverNameTwo),
    vehicle_called: normalizeBool(row.VehicleCalled),
    veh_allocated_flag: normalizeBool(row.VehAllocatedFlag),
    veh_division_code: normalizeText(row.VehDivisionCode),
    veh_division_name: normalizeText(row.VehDivisionName),
    veh_speedo_date: normalizeDate(row.VehSpeedoDate),
    veh_load_no: normalizeText(row.VehLoadNo),
    dr_vno_km: normalizeNumber(row.DrVnoKm),
    offload_no_email_flag: normalizeBool(row.OffloadNoEmailFlag),
    asset_number: normalizeText(row.AssetNumber),
    min_service_interval: normalizeNumber(row.MinServiceInterval),
    min_service_due: normalizeNumber(row.MinServiceDue),
    veh_min_distance: normalizeNumber(row.VehMinDistance),
    genset_code: normalizeText(row.GensetCode),
    genset_name: normalizeText(row.GensetName),
    genset_type: normalizeText(row.GensetType),
    gen_location: normalizeText(row.GenLocation),
    maj_service_interval: normalizeNumber(row.MajServiceInterval),
    maj_service_due: normalizeNumber(row.MajServiceDue),
    veh_maj_distance: normalizeNumber(row.VehMajDistance),
    service_due_flag: normalizeBool(row.ServiceDueFlag),
    service_due_in_kms: normalizeNumber(row.ServiceDueInKms),
    km_before_service: normalizeNumber(row.KmBeforeService),
    cell_phones_prd: normalizeText(row.CellPhonesPrd),
    tracking_prd: normalizeText(row.TrackingPrd),
    equipment_prd: normalizeText(row.EquipmentPrd),
    fines_prd: normalizeText(row.FinesPrd),
    insurance_prd: normalizeText(row.InsurancePrd),
    licences_prd: normalizeText(row.LicencesPrd),
    maint_contr_prd: normalizeText(row.MaintContrPrd),
    permits_prd: normalizeText(row.PermitsPrd),
    repairs_prd: normalizeText(row.RepairsPrd),
    toll_fees_prd: normalizeText(row.TollFeesPrd),
    tyres_prd: normalizeText(row.TyresPrd),
    vehicle_payments_prd: normalizeText(row.VehiclePaymentsPrd),
    wages_prd: normalizeText(row.WagesPrd),
    speedo_start: normalizeNumber(row.SpeedoStart),
    hour_current: normalizeNumber(row.HourCurrent),
    hour_before_service: normalizeNumber(row.HourBeforeService),
    hour_service_interval: normalizeNumber(row.HourServiceInterval),
    hour_service_due_at: normalizeNumber(row.HourServiceDueAt),
    hour_service_due_in: normalizeNumber(row.HourServiceDueIn),
    hour_service_due_flag: normalizeBool(row.HourServiceDueFlag),
    veh_prev_load: normalizeText(row.vehprevload),
    cbp_date: normalizeDate(row.CBPdate),
    zim_cvg_date: normalizeDate(row.ZimCVGdate),
    zim_3rd_party_date: normalizeDate(row.Zim3rdPartyDate),
    zim_carbon_tax_date: normalizeDate(row.ZimCarbonTaxDate),
    zam_3rd_party_date: normalizeDate(row.Zam3rdPartyDate),
    zam_carbon_tax_date: normalizeDate(row.ZamCarbonTaxDate),
    botswana_rsl_date: normalizeDate(row.BotswanaRSLDate),
    botswana_rtp_date: normalizeDate(row.BotswanaRTPDate),
    police_clearance_date: normalizeDate(row.PoliceClearanceDate),
    malawi_3rd_party_date: normalizeDate(row.Malawi3rdPartyDate),
    zambia: normalizeBool(row.Zambia),
    zimbabwe: normalizeBool(row.Zimbabwe),
    malawi: normalizeBool(row.Malawi),
    veh_trip_sheet_number: normalizeText(row.VehTripSheetNumber),
    tare: normalizeNumber(row.Tare),
    gvm: normalizeNumber(row.GVM),
    pdp_date: normalizeDate(row.PDPDate),
    cof_mh_date: normalizeDate(row.COFMHDate),
    trailer2_type_desc: normalizeText(row.Trailer2TypeDesc),
    trailer_type_desc: normalizeText(row.TrailerTypeDesc),
    veh_control_type: normalizeText(row.VehControlType),
    veh_control_no: normalizeNumber(row.VehControlNo),
    veh_from_screen: normalizeText(row.VehFromScreen),
    cof_rt_date: normalizeDate(row.COFRTDate),
    trip_sheet_number_last: normalizeText(row.TripSheetNumberLast),
    botswana_expiry_date: normalizeDate(row.BotswanaExpiryDate),
    namibia_expiry_date: normalizeDate(row.NamibiaExpiryDate),
    swaziland_expiry_date: normalizeDate(row.SwazilandExpiryDate),
    mozambique_expiry_date: normalizeDate(row.MozambiqueExpiryDate),
    swaziland: normalizeBool(row.Swaziland),
    mozambique: normalizeBool(row.Mozambique),
    veh_tare: normalizeNumber(row.VehTare),
    veh_comp01_max_qty: normalizeNumber(row.VehComp01MaxQty),
    veh_comp02_max_qty: normalizeNumber(row.VehComp02MaxQty),
    veh_comp03_max_qty: normalizeNumber(row.VehComp03MaxQty),
    veh_comp04_max_qty: normalizeNumber(row.VehComp04MaxQty),
    veh_comp05_max_qty: normalizeNumber(row.VehComp05MaxQty),
    veh_comp06_max_qty: normalizeNumber(row.VehComp06MaxQty),
    veh_comp07_max_qty: normalizeNumber(row.VehComp07MaxQty),
    drc: normalizeBool(row.DRC),
    lesotho: normalizeBool(row.Lesotho),
    zambia_exp_date: normalizeDate(row.ZambiaExpDate),
    drc_exp_date: normalizeDate(row.DRCExpDate),
    zimbabwe_exp_date: normalizeDate(row.ZimbabweExpDate),
    lesotho_exp_date: normalizeDate(row.LesothoExpDate),
    diesel_target_consumption: normalizeNumber(row.DieselTargetConsumption),
    diesel_recommended_litres: normalizeNumber(row.DieselRecommendedLitres),
    veh_escort_flag: normalizeBool(row.VehEscortFlag),
    veh_mine_permit1_date: normalizeDate(row.VehMinePermit1Date),
    veh_mine_permit2_date: normalizeDate(row.VehMinePermit2Date),
    angola: normalizeBool(row.Angola),
    angola_exp_date: normalizeDate(row.AngolaExpDate),
    department_code: normalizeText(row.departmentcode),
    department_name: normalizeText(row.departmentname),
    project_code: normalizeText(row.projectcode),
    speedo_start_load: normalizeNumber(row.SpeedoStartLoad),
    agreed_km: normalizeNumber(row.AgreedKm),
    updated_at: new Date().toISOString()
  };
}

async function fetchExistingRows(supabase, table, keyColumn, keys) {
  const results = [];
  const uniqueKeys = [...new Set(keys.filter(Boolean))];

  for (const keyChunk of chunk(uniqueKeys, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in(keyColumn, keyChunk);

    if (error) {
      throw new Error(`Supabase select failed for ${table}: ${error.message}`);
    }

    results.push(...(data || []));
  }

  return results;
}

async function upsertBatch(supabase, table, rows, conflictColumn, dryRun) {
  if (!rows.length || dryRun) return;

  const { error } = await supabase
    .from(table)
    .upsert(rows, {
      onConflict: conflictColumn,
      defaultToNull: false
    });

  if (error) {
    if (/no unique or exclusion constraint matching the ON CONFLICT specification/i.test(error.message || '')) {
      throw new Error(
        `Supabase upsert failed for ${table}: ${error.message}. ` +
        `Create a unique index for ${table}.${conflictColumn} first (see scripts/supabase-indexes.sql).`
      );
    }
    throw new Error(`Supabase upsert failed for ${table}: ${error.message}`);
  }
}

async function insertBatch(supabase, table, rows, dryRun) {
  if (!rows.length || dryRun) return;

  const { error } = await supabase
    .from(table)
    .insert(rows, {
      defaultToNull: false
    });

  if (error) {
    throw new Error(`Supabase insert failed for ${table}: ${error.message}`);
  }
}

function maybeAddVpnHint(err) {
  const message = String(err?.message || '');
  const isConnectivityFailure = /ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(message);
  if (!isConnectivityFailure) return err;

  const vpn = getVpnConfig();
  const hasVpnCredentials = Boolean(vpn.host && vpn.username && vpn.password);

  if (!vpn.required && hasVpnCredentials) {
    const hinted = new Error(
      `${message}. Source DB is unreachable and VPN is disabled. ` +
      `Set VPN_REQUIRED=true (or vpn_required=true), then retry.`
    );
    hinted.code = err?.code;
    return hinted;
  }

  return err;
}

async function updateExistingBatch(supabase, table, rows, keyColumn, dryRun) {
  if (!rows.length || dryRun) return;

  for (const row of rows) {
    const keyValue = row[keyColumn];
    const { error } = await supabase
      .from(table)
      .update(row)
      .eq(keyColumn, keyValue);

    if (error) {
      throw new Error(`Supabase update failed for ${table}(${keyValue}): ${error.message}`);
    }
  }
}

async function updateByMatchBatch(supabase, table, rows, keyColumn, dryRun) {
  if (!rows.length || dryRun) return;

  for (const item of rows) {
    const matchValue = item?.matchValue;
    const row = item?.row;
    const { error } = await supabase
      .from(table)
      .update(row)
      .eq(keyColumn, matchValue);

    if (error) {
      throw new Error(`Supabase update failed for ${table}(${matchValue}): ${error.message}`);
    }
  }
}

async function deleteBatch(supabase, table, keyColumn, keys, dryRun) {
  if (!keys.length || dryRun) return;

  for (const keyChunk of chunk(keys, BATCH_SIZE)) {
    const { error } = await supabase
      .from(table)
      .delete()
      .in(keyColumn, keyChunk);

    if (error) {
      throw new Error(`Supabase delete failed for ${table}: ${error.message}`);
    }
  }
}

async function syncClientsTable({ supabase, sourceRows, dryRun }) {
  const mappedRows = sourceRows
    .map(mapClient)
    .filter(row => normalizeText(row.client_id));

  const existingRows = await fetchExistingRows(
    supabase,
    'eps_client_list',
    'client_id',
    mappedRows.map(row => row.client_id)
  );

  const existingMap = new Map(existingRows.map(row => [normalizeText(row.client_id), row]));
  const toInsert = [];
  const toUpdate = [];
  const insertedKeys = [];
  const updatedKeys = [];
  let inserted = 0;
  let updated = 0;

  for (const row of mappedRows) {
    const key = normalizeText(row.client_id);
    const existing = existingMap.get(key);

    if (!existing) {
      inserted += 1;
      toInsert.push(row);
      insertedKeys.push(key);
      continue;
    }

    const changed = Object.keys(row)
      .filter(column => column !== 'updated_at')
      .some(column => !valuesEqual(row[column], existing[column]));

    if (changed) {
      updated += 1;
      toUpdate.push(row);
      updatedKeys.push(key);
    }
  }

  for (const rowChunk of chunk(toUpdate, BATCH_SIZE)) {
    await updateExistingBatch(supabase, 'eps_client_list', rowChunk, 'client_id', dryRun);
  }

  for (const rowChunk of chunk(toInsert, BATCH_SIZE)) {
    await insertBatch(supabase, 'eps_client_list', rowChunk, dryRun);
  }

  const clientSourceKeySet = new Set(mappedRows.map(row => normalizeText(row.client_id)));

  const { data: allSupabaseClients, error: clientFetchError } = await supabase
    .from('eps_client_list')
    .select('client_id');

  if (clientFetchError) {
    throw new Error(`Supabase select failed for eps_client_list: ${clientFetchError.message}`);
  }

  const clientsToDelete = [];
  for (const row of (allSupabaseClients || [])) {
    const key = normalizeText(row.client_id);
    if (key && !clientSourceKeySet.has(key)) {
      clientsToDelete.push(row.client_id);
    }
  }

  for (const keyChunk of chunk(clientsToDelete, BATCH_SIZE)) {
    await deleteBatch(supabase, 'eps_client_list', 'client_id', keyChunk, dryRun);
  }

  return {
    label: 'clients',
    sourceCount: sourceRows.length,
    comparableCount: mappedRows.length,
    existingCount: existingRows.length,
    inserted,
    updated,
    deleted: clientsToDelete.length,
    unchanged: mappedRows.length - inserted - updated,
    insertedKeys,
    updatedKeys,
    skippedInsertKeys: []
  };
}

async function syncDriversTable({ supabase, sourceRows, dryRun }) {
  const mappedRows = sourceRows
    .map(mapDriver)
    .filter(row => normalizeDriverCode(row.driver_code));

  const candidateKeys = mappedRows.flatMap(row => {
    const canonical = normalizeDriverCode(row.driver_code);
    const raw = normalizeText(row.driver_code);
    const withoutPrefix = canonical ? canonical.replace(/^EPS/, '') : null;
    return [canonical, raw, withoutPrefix].filter(Boolean);
  });

  const existingRows = await fetchExistingRows(supabase, 'drivers', 'driver_code', candidateKeys);
  const existingMap = new Map();

  for (const row of existingRows) {
    const raw = normalizeText(row.driver_code);
    const canonical = normalizeDriverCode(raw);
    if (raw) existingMap.set(raw, row);
    if (canonical) {
      existingMap.set(canonical, row);
      existingMap.set(canonical.replace(/^EPS/, ''), row);
    }
  }

  const toInsert = [];
  const toUpdate = [];
  const insertedKeys = [];
  const updatedKeys = [];
  let inserted = 0;
  let updated = 0;

  for (const row of mappedRows) {
    const canonicalKey = normalizeDriverCode(row.driver_code);
    const existing = existingMap.get(canonicalKey) || existingMap.get(canonicalKey.replace(/^EPS/, ''));

    if (!existing) {
      inserted += 1;
      toInsert.push(row);
      insertedKeys.push(canonicalKey);
      continue;
    }

    const comparableExisting = { ...existing, driver_code: canonicalKey };
    const changed = Object.keys(row)
      .filter(column => column !== 'updated_at')
      .some(column => !valuesEqual(row[column], comparableExisting[column]));

    if (changed || existing.driver_code !== canonicalKey) {
      updated += 1;
      toUpdate.push({
        matchValue: existing.driver_code,
        row
      });
      updatedKeys.push(canonicalKey);
    }
  }

  for (const rowChunk of chunk(toUpdate, BATCH_SIZE)) {
    await updateByMatchBatch(supabase, 'drivers', rowChunk, 'driver_code', dryRun);
  }

  for (const rowChunk of chunk(toInsert, BATCH_SIZE)) {
    await insertBatch(supabase, 'drivers', rowChunk, dryRun);
  }

  const sourceKeySet = new Set(mappedRows.map(row => normalizeDriverCode(row.driver_code)));

  const { data: allSupabaseDrivers, error: fetchError } = await supabase
    .from('drivers')
    .select('driver_code');

  if (fetchError) {
    throw new Error(`Supabase select failed for drivers: ${fetchError.message}`);
  }

  let toDelete = [];
  for (const row of (allSupabaseDrivers || [])) {
    const canonical = normalizeDriverCode(row.driver_code);
    if (canonical && !sourceKeySet.has(canonical)) {
      toDelete.push(row.driver_code);
    }
  }

  if (toDelete.length) {
    const { data: referencedVehicles, error: vehError } = await supabase
      .from('vehiclesc')
      .select('driver_code')
      .in('driver_code', toDelete);

    if (vehError) {
      throw new Error(`Supabase select failed for vehiclesc: ${vehError.message}`);
    }

    const referencedDriverCodes = new Set(
      (referencedVehicles || []).map(r => normalizeText(r.driver_code)).filter(Boolean)
    );

    const skippedDueToRefs = toDelete.filter(code => referencedDriverCodes.has(normalizeText(code)));
    toDelete = toDelete.filter(code => !referencedDriverCodes.has(normalizeText(code)));

    if (skippedDueToRefs.length) {
      console.log(`[SYNC:drivers] skipped ${skippedDueToRefs.length} driver(s) still referenced by vehicles: ${skippedDueToRefs.slice(0, 10).join(', ')}${skippedDueToRefs.length > 10 ? '...' : ''}`);
    }
  }

  for (const keyChunk of chunk(toDelete, BATCH_SIZE)) {
    await deleteBatch(supabase, 'drivers', 'driver_code', keyChunk, dryRun);
  }

  return {
    label: 'drivers',
    sourceCount: sourceRows.length,
    comparableCount: mappedRows.length,
    existingCount: existingRows.length,
    inserted,
    updated,
    deleted: toDelete.length,
    unchanged: mappedRows.length - inserted - updated,
    insertedKeys,
    updatedKeys,
    deletedKeys: toDelete
  };
}

async function syncTable({ supabase, table, sourceRows, mapRow, conflictColumn, label, dryRun }) {
  const mappedRows = sourceRows
    .map(mapRow)
    .filter(row => normalizeText(row[conflictColumn]));

  const existingRows = await fetchExistingRows(
    supabase,
    table,
    conflictColumn,
    mappedRows.map(row => row[conflictColumn])
  );

  const existingMap = new Map(existingRows.map(row => [normalizeText(row[conflictColumn]), row]));
  const toInsert = [];
  const toUpdate = [];
  const insertedKeys = [];
  const updatedKeys = [];
  let inserted = 0;
  let updated = 0;

  for (const row of mappedRows) {
    const key = normalizeText(row[conflictColumn]);
    const existing = existingMap.get(key);

    if (!existing) {
      inserted += 1;
      toInsert.push(row);
      insertedKeys.push(key);
      continue;
    }

    const changed = Object.keys(row)
      .filter(column => column !== 'updated_at')
      .some(column => !valuesEqual(row[column], existing[column]));

    if (changed) {
      updated += 1;
      toUpdate.push(row);
      updatedKeys.push(key);
    }
  }

  for (const rowChunk of chunk(toUpdate, BATCH_SIZE)) {
    await updateExistingBatch(supabase, table, rowChunk, conflictColumn, dryRun);
  }

  for (const rowChunk of chunk(toInsert, BATCH_SIZE)) {
    await insertBatch(supabase, table, rowChunk, dryRun);
  }

  const tableSourceKeySet = new Set(mappedRows.map(row => normalizeText(row[conflictColumn])));

  const { data: allSupabaseRows, error: fetchError } = await supabase
    .from(table)
    .select(conflictColumn);

  if (fetchError) {
    throw new Error(`Supabase select failed for ${table}: ${fetchError.message}`);
  }

  const toDelete = [];
  for (const row of (allSupabaseRows || [])) {
    const key = normalizeText(row[conflictColumn]);
    if (key && !tableSourceKeySet.has(key)) {
      toDelete.push(row[conflictColumn]);
    }
  }

  for (const keyChunk of chunk(toDelete, BATCH_SIZE)) {
    await deleteBatch(supabase, table, conflictColumn, keyChunk, dryRun);
  }

  return {
    label,
    sourceCount: sourceRows.length,
    comparableCount: mappedRows.length,
    existingCount: existingRows.length,
    inserted,
    updated,
    deleted: toDelete.length,
    unchanged: mappedRows.length - inserted - updated,
    insertedKeys,
    updatedKeys,
    deletedKeys: toDelete
  };
}

async function runSupabaseSync({ dryRun = false } = {}) {
  if (syncInProgress) {
    const err = new Error('Supabase sync is already running');
    err.code = 'SYNC_IN_PROGRESS';
    throw err;
  }

  syncInProgress = true;
  try {
    await connectVpn();

    const supabase = getSupabaseClient();
    const [clientRows, driverRows, vehicleRows] = await Promise.all([
      getDrivers(),
      getDriverMaster(),
      getVehicles()
    ]);

    const results = [];
    results.push(await syncClientsTable({ supabase, sourceRows: clientRows, dryRun }));
    results.push(await syncDriversTable({ supabase, sourceRows: driverRows, dryRun }));
    results.push(await syncTable({
      supabase,
      table: 'vehiclesc',
      sourceRows: vehicleRows,
      mapRow: mapVehicle,
      conflictColumn: 'registration_number',
      label: 'vehicles',
      dryRun
    }));

    return {
      dryRun,
      timestamp: new Date().toISOString(),
      results
    };
  } catch (err) {
    throw maybeAddVpnHint(err);
  } finally {
    syncInProgress = false;
  }
}

module.exports = {
  runSupabaseSync
};
