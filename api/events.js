const { sql } = require('@vercel/postgres');

// SECURITY NOTE: The `email` supplied in the query/body is trusted without
// cryptographic proof of identity — the frontend re-sends it after a successful
// /api/auth/login call, but the server does not re-verify it per-request in this
// pass (no session tokens). This is an accepted simplification for the initial
// version; proper session/token auth is a planned future hardening step.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    const { email, adminEmail } = req.query;
    if (adminEmail) {
      const normalizedAdmin = String(adminEmail).trim().toLowerCase();
      try {
        const { rows: adminCheck } = await sql`SELECT 1 FROM admins WHERE email = ${normalizedAdmin} LIMIT 1`;
        if (!adminCheck.length) { res.status(403).json({ error: 'Not an admin account.' }); return; }
        const { rows } = await sql`SELECT id, name, owner_email, created_at FROM events ORDER BY created_at DESC`;
        res.json(rows);
      } catch (err) {
        console.error('[GET /api/events admin]', err);
        res.status(500).json({ error: err.message, code: err.code || null });
      }
      return;
    }
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'email query parameter is required.' }); return; }
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      const { rows } = await sql`
        SELECT
          e.id,
          e.name,
          e.owner_email,
          e.created_at,
          (e.owner_email = ${normalizedEmail}) AS is_owner
        FROM events e
        WHERE e.owner_email = ${normalizedEmail}
           OR EXISTS (
             SELECT 1 FROM event_access ea
             WHERE ea.event_id = e.id AND ea.user_email = ${normalizedEmail}
           )
        ORDER BY e.created_at DESC
      `;
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/events]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  if (req.method === 'POST') {
    const { email, name, data } = req.body || {};
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'email is required.' }); return; }
    if (!name || !String(name).trim()) { res.status(400).json({ error: 'name is required.' }); return; }
    if (!data) { res.status(400).json({ error: 'data is required.' }); return; }
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      // Ensure owner exists in users (no-op for real users; creates placeholder for admin emails)
      const { rows: userRows } = await sql`SELECT 1 FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
      if (!userRows.length) {
        await sql`INSERT INTO users (email, pin_hash) VALUES (${normalizedEmail}, NULL)`;
      }
      const now = new Date().toISOString();
      const initialLog = JSON.stringify([{ email: normalizedEmail, timestamp: now }]);
      const { rows } = await sql`
        INSERT INTO events (name, owner_email, data, edit_log)
        VALUES (
          ${String(name).trim()},
          ${normalizedEmail},
          ${JSON.stringify(data)},
          ${initialLog}::jsonb
        )
        RETURNING id, name, owner_email, created_at
      `;
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/events]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
