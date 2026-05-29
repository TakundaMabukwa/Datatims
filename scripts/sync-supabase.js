require('dotenv').config();
const { runSupabaseSync } = require('../config/supabase-sync');

const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN || 'false');

function printSample(label, action, keys) {
  if (!keys || !keys.length) return;
  const sample = keys.slice(0, 20).join(', ');
  console.log(`[SYNC:${label}] ${action} keys sample (${Math.min(keys.length, 20)}/${keys.length}): ${sample}`);
}

async function run() {
  console.log(`=== Datatims -> Supabase Sync${DRY_RUN ? ' (Dry Run)' : ''} ===\n`);
  const summary = await runSupabaseSync({ dryRun: DRY_RUN });

  for (const result of summary.results) {
    const authInfo = result.authCreated !== undefined ? ` authCreated=${result.authCreated} authSkipped=${result.authSkipped}` : '';
    console.log(
      `[SYNC:${result.label}] source=${result.sourceCount} comparable=${result.comparableCount} existing=${result.existingCount} inserted=${result.inserted} updated=${result.updated} deleted=${result.deleted ?? 0} unchanged=${result.unchanged}${authInfo}`
    );
    printSample(result.label, 'insert', result.insertedKeys);
    printSample(result.label, 'update', result.updatedKeys);
    printSample(result.label, 'delete', result.deletedKeys);
    printSample(result.label, 'skipped missing in Supabase', result.skippedInsertKeys);
  }

  console.log(`\nSupabase sync ${DRY_RUN ? 'dry run ' : ''}complete`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Supabase sync failed:', err.message);
    process.exit(1);
  });
