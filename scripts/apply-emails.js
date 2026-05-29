require('dotenv').config();
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function normalizeDriverCode(value) {
  const text = (value || '').toString().trim();
  if (!text) return null;
  return text.toUpperCase().startsWith('EPS') ? text.toUpperCase() : `EPS${text.toUpperCase()}`;
}

function ensureMinPassword(pw) {
  return pw.length >= 6 ? pw : pw + '0'.repeat(6 - pw.length);
}

async function setPassword(userId, password) {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) console.error(`  Failed to reset password: ${error.message}`);
  return !error;
}

async function run() {
  const wb = XLSX.readFile('scripts/master file.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} entries in Excel\n`);

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let updated = 0;

  for (const row of rows) {
    const rawCode = (row.DriverCode || '').toString().trim();
    const email = (row['Email Adress'] || '').toString().trim().toLowerCase();
    const driverCode = normalizeDriverCode(rawCode);

    if (!driverCode || !email) {
      console.log(`SKIP  missing data: code=${rawCode} email=${email}`);
      skipped++;
      continue;
    }

    const { data: drivers, error: drvErr } = await supabase
      .from('drivers')
      .select('id, driver_code, user_id')
      .eq('driver_code', driverCode);

    if (drvErr) {
      console.log(`ERROR querying driver ${driverCode}: ${drvErr.message}`);
      skipped++;
      continue;
    }

    if (!drivers || drivers.length === 0) {
      console.log(`SKIP  driver ${driverCode} not found in Supabase`);
      skipped++;
      continue;
    }

    const driver = drivers[0];

    const { error: updateErr } = await supabase
      .from('drivers')
      .update({ email_address: email })
      .eq('driver_code', driverCode);

    if (updateErr) {
      console.log(`ERROR updating email for ${driverCode}: ${updateErr.message}`);
      skipped++;
      continue;
    }

    updated++;

    if (driver.user_id) {
      await setPassword(driver.user_id, ensureMinPassword(driverCode));
      await supabase.from('users').update({ email }).eq('id', driver.user_id);
      console.log(`LINK  ${driverCode} → ${email} (existing user_id: ${driver.user_id})`);
      linked++;
      continue;
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      const { error: linkErr } = await supabase
        .from('drivers')
        .update({ user_id: existingUser.id })
        .eq('driver_code', driverCode);

      if (linkErr) {
        console.log(`ERROR linking ${driverCode} to existing user: ${linkErr.message}`);
        skipped++;
      } else {
        await setPassword(existingUser.id, ensureMinPassword(driverCode));
        await supabase.from('users').update({ email }).eq('id', existingUser.id);
        console.log(`LINK  ${driverCode} → ${email} (existing public.users row)`);
        linked++;
      }
      continue;
    }

    const { data: authData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: ensureMinPassword(driverCode),
      email_confirm: true,
      user_metadata: { role: 'driver' }
    });

    if (createErr) {
      const isDuplicate = /already registered|already exists|duplicate/i.test(createErr.message);
      if (isDuplicate) {
        const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = users.find(u => u.email?.toLowerCase() === email);
        if (found) {
          await supabase.from('drivers').update({ user_id: found.id }).eq('driver_code', driverCode);
          await supabase.from('users').insert({ id: found.id, email, role: 'driver', is_active: true });
          await setPassword(found.id, ensureMinPassword(driverCode));
          console.log(`LINK  ${driverCode} → ${email} (existing auth, created public.users)`);
          linked++;
        } else {
          console.log(`SKIP  ${driverCode}: auth user exists but not found (${email})`);
          skipped++;
        }
      } else {
        console.log(`ERROR creating auth for ${email}: ${createErr.message}`);
        skipped++;
      }
      continue;
    }

    const userId = authData.user.id;
    await supabase.from('users').insert({
      id: userId, email, role: 'driver',
      is_active: true
    });
    await supabase.from('drivers').update({ user_id: userId }).eq('driver_code', driverCode);
    console.log(`CREAT ${driverCode} → ${email} (new auth + public.users)`);
    created++;
  }

  console.log(`\nDone. ${updated} emails updated, ${created} created, ${linked} linked, ${skipped} skipped`);
}

run().catch(err => { console.error(err); process.exit(1); });
