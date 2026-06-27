const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'POST') {
    const { email, pin } = req.body || {};
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'Email is required.' }); return; }
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      const { rows } = await sql`SELECT pin_hash FROM users WHERE email = ${normalizedEmail}`;
      if (!rows.length) { res.status(401).json({ error: 'Email not found.' }); return; }

      if (rows[0].pin_hash === null) {
        // Placeholder user invited before signup — this login attempt sets their PIN
        if (!/^\d{4}$/.test(String(pin || ''))) { res.status(400).json({ error: 'PIN must be exactly 4 digits.' }); return; }
        const pin_hash = await bcrypt.hash(String(pin), 10);
        await sql`UPDATE users SET pin_hash = ${pin_hash} WHERE email = ${normalizedEmail}`;
        res.json({ success: true, email: normalizedEmail, firstTimeSetup: true });
        return;
      }

      const valid = await bcrypt.compare(String(pin || ''), rows[0].pin_hash);
      if (!valid) { res.status(401).json({ error: 'Incorrect PIN.' }); return; }
      res.json({ success: true, email: normalizedEmail });
    } catch (err) {
      console.error('[POST /api/auth/login]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
