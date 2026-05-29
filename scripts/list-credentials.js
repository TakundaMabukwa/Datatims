require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function ensureMinPassword(pw) {
  if (pw.length >= 6) return pw;
  const rest = pw.replace(/^EPS/i, '');
  return `EPS00${rest}`;
}

async function run() {
  const { data, error } = await supabase
    .from('drivers')
    .select('driver_code, email_address, first_name, surname')
    .not('email_address', 'is', null)
    .order('driver_code');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('driver_code,email,password');
  for (const d of data) {
    console.log(`${d.driver_code},${d.email_address},${ensureMinPassword(d.driver_code)}`);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
