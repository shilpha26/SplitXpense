/**
 * Shared upsert for app_health (used by /api/health cron and /api/admin-ping-health).
 */
const { createClient } = require('@supabase/supabase-js');

async function pingAppHealth() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from('app_health')
    .select('ping_count')
    .eq('id', 1)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message };
  }

  const nextCount = existing && existing.ping_count != null ? Number(existing.ping_count) + 1 : 1;

  const { error: upErr } = await supabase.from('app_health').upsert(
    {
      id: 1,
      last_ping_at: now,
      updated_at: now,
      ping_count: nextCount
    },
    { onConflict: 'id' }
  );

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const { error: logErr } = await supabase.from('health_ping_log').insert({ pinged_at: now });
  if (logErr) {
    console.warn('health_ping_log insert (run supabase-health-keepalive.sql if missing):', logErr.message);
  }

  return { ok: true, last_ping_at: now, ping_count: nextCount };
}

module.exports = { pingAppHealth };
