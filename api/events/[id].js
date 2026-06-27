const { sql } = require('@vercel/postgres');

// SECURITY NOTE (Step 5/6 known simplifications):
// 1. `email` in request body/query is trusted without cryptographic proof — no session
//    tokens in this pass. The server checks ownership/access records but cannot verify
//    the caller truly authenticated as that email.
// 2. `adminEmail` field is trusted without a session token — the server only checks
//    that the email exists in the admins table, not that the caller proved identity
//    for this specific request. Both are accepted simplifications for the initial
//    version; proper session/token auth is a planned future hardening step.

async function checkAdmin(adminEmail) {
  if (!adminEmail) return false;
  const { rows } = await sql`
    SELECT 1 FROM admins WHERE email = ${String(adminEmail).trim().toLowerCase()} LIMIT 1
  `;
  return rows.length > 0;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id } = req.query;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) { res.status(400).json({ error: 'Invalid event id.' }); return; }

  if (req.method === 'GET') {
    const { email, adminEmail } = req.query;
    if (!email && !adminEmail) { res.status(400).json({ error: 'email query parameter is required.' }); return; }
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    try {
      const admin = await checkAdmin(adminEmail);
      if (!admin) {
        const { rows: access } = await sql`
          SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${normalizedEmail}
          UNION ALL
          SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${normalizedEmail}
          LIMIT 1
        `;
        if (!access.length) { res.status(403).json({ error: 'Access denied.' }); return; }
      }
      const { rows } = await sql`
        SELECT id, name, owner_email, created_at, data, edit_log
        FROM events WHERE id = ${eventId}
      `;
      if (!rows.length) { res.status(404).json({ error: 'Event not found.' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[GET /api/events/:id]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  if (req.method === 'PUT') {
    const { email, data, adminEmail } = req.body || {};
    if (!email && !adminEmail) { res.status(400).json({ error: 'email is required.' }); return; }
    if (!data) { res.status(400).json({ error: 'data is required.' }); return; }
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    try {
      const admin = await checkAdmin(adminEmail);
      if (!admin) {
        const { rows: access } = await sql`
          SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${normalizedEmail}
          UNION ALL
          SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${normalizedEmail}
          LIMIT 1
        `;
        if (!access.length) { res.status(403).json({ error: 'Access denied.' }); return; }
      }
      const actor = admin ? String(adminEmail).trim().toLowerCase() : normalizedEmail;
      const now = new Date().toISOString();
      const newEntry = JSON.stringify([{ email: actor, timestamp: now }]);
      const { rows } = await sql`
        UPDATE events SET
          data     = ${JSON.stringify(data)},
          edit_log = edit_log || ${newEntry}::jsonb
        WHERE id = ${eventId}
        RETURNING id, name, owner_email, created_at, data, edit_log
      `;
      if (!rows.length) { res.status(404).json({ error: 'Event not found.' }); return; }
      res.json(rows[0]);
    } catch (err) {
      console.error('[PUT /api/events/:id]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { email, adminEmail } = req.body || {};
    if (!email && !adminEmail) { res.status(400).json({ error: 'email is required.' }); return; }
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    try {
      const admin = await checkAdmin(adminEmail);
      if (!admin) {
        const { rows: ownerCheck } = await sql`
          SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${normalizedEmail}
        `;
        if (!ownerCheck.length) { res.status(403).json({ error: 'Only the event owner can delete this event.' }); return; }
      }
      const { rows: deleted } = await sql`
        DELETE FROM events WHERE id = ${eventId} RETURNING name
      `;
      if (!deleted.length) { res.status(404).json({ error: 'Event not found.' }); return; }
      res.json({ deleted: true, name: deleted[0].name });
    } catch (err) {
      console.error('[DELETE /api/events/:id]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
