const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'POST') {
    const { email, password } = req.body || {};
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'Email is required.' }); return; }
    if (!password) { res.status(400).json({ error: 'Password is required.' }); return; }
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      const { rows } = await sql`SELECT password_hash FROM admins WHERE email = ${normalizedEmail}`;
      if (!rows.length) { res.status(401).json({ error: 'Invalid credentials.' }); return; }
      const valid = await bcrypt.compare(String(password), rows[0].password_hash);
      if (!valid) { res.status(401).json({ error: 'Invalid credentials.' }); return; }
      res.json({ success: true, email: normalizedEmail, isAdmin: true });
    } catch (err) {
      console.error('[POST /api/admin/login]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
