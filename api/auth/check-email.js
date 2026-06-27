const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'POST') {
    const { email } = req.body || {};
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'Email is required.' }); return; }
    try {
      const { rows } = await sql`
        SELECT 1 FROM users WHERE email = ${String(email).trim().toLowerCase()} LIMIT 1
      `;
      res.json({ exists: rows.length > 0 });
    } catch (err) {
      console.error('[POST /api/auth/check-email]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
