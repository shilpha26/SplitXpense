/**

 * Vercel Cron + manual ping: writes to Supabase to keep the DB active.

 * Secured with CRON_SECRET (Authorization: Bearer <CRON_SECRET>).

 * @see vercel.json crons (19:30 UTC daily = 01:00 IST next calendar day)

 */

const { pingAppHealth } = require('../lib/ping-app-health');



module.exports = async function handler(req, res) {

  if (req.method !== 'GET' && req.method !== 'POST') {

    res.setHeader('Allow', 'GET, POST');

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  }



  const secret = process.env.CRON_SECRET;

  const auth = req.headers.authorization || '';

  if (!secret) {

    return res.status(500).json({ ok: false, error: 'CRON_SECRET is not configured' });

  }

  if (auth !== 'Bearer ' + secret) {

    return res.status(401).json({ ok: false, error: 'Unauthorized' });

  }



  const result = await pingAppHealth();

  if (!result.ok) {

    return res.status(500).json(result);

  }



  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).json({

    ok: true,

    last_ping_at: result.last_ping_at,

    ping_count: result.ping_count

  });

};


