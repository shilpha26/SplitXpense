/**
 * Manual keepalive ping from the admin UI. Verifies Supabase session JWT and ADMIN_EMAIL.
 */
const { createClient } = require('@supabase/supabase-js');
const { pingAppHealth } = require('../lib/ping-app-health');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return res.status(503).json({ ok: false, error: 'ADMIN_EMAIL is not configured on the server' });
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ ok: false, error: 'SUPABASE_URL or SUPABASE_ANON_KEY missing' });
  }

  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ ok: false, error: 'Missing Bearer token' });
  }
  const token = match[1];

  const supabaseAnon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
  const user = userData && userData.user;
  if (userErr || !user || !user.email) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
  }

  if (user.email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const result = await pingAppHealth();
  if (!result.ok) {
    return res.status(500).json(result);
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
};
