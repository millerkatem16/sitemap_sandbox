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
    if (!/^\d{4}$/.test(String(pin || ''))) { res.status(400).json({ error: 'PIN must be exactly 4 digits.' }); return; }
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      const { rows: existing } = await sql`SELECT 1 FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
      if (existing.length > 0) { res.status(400).json({ error: 'Email already registered.' }); return; }
      const pin_hash = await bcrypt.hash(String(pin), 10);
      await sql`INSERT INTO users (email, pin_hash) VALUES (${normalizedEmail}, ${pin_hash})`;
      res.status(201).json({ success: true, email: normalizedEmail });
    } catch (err) {
      console.error('[POST /api/auth/signup]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
