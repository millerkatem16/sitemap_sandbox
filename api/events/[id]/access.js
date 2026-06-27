const { sql } = require('@vercel/postgres');

// SECURITY NOTE (Step 5/6 known simplifications):
// 1. `grantedByEmail` / `revokedByEmail` are trusted without cryptographic proof of
//    identity — no session tokens in this pass.
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id } = req.query;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) { res.status(400).json({ error: 'Invalid event id.' }); return; }

  if (req.method === 'POST') {
    const { email, grantedByEmail, adminEmail } = req.body || {};
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'email is required.' }); return; }
    if (!grantedByEmail && !adminEmail) { res.status(400).json({ error: 'grantedByEmail is required.' }); return; }
    const targetEmail = String(email).trim().toLowerCase();
    const grantor = grantedByEmail ? String(grantedByEmail).trim().toLowerCase() : null;
    try {
      const { rows: existCheck } = await sql`SELECT 1 FROM events WHERE id = ${eventId} LIMIT 1`;
      if (!existCheck.length) { res.status(404).json({ error: 'Event not found.' }); return; }
      const admin = await checkAdmin(adminEmail);
      if (!admin) {
        // Anyone with existing access (owner or event_access row) can grant further access
        const { rows: grantorAccess } = await sql`
          SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${grantor}
          UNION ALL
          SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${grantor}
          LIMIT 1
        `;
        if (!grantorAccess.length) { res.status(403).json({ error: 'grantedByEmail does not have access to this event.' }); return; }
      }

      // Ensure the target user exists; insert a placeholder if not
      const { rows: userRows } = await sql`SELECT 1 FROM users WHERE email = ${targetEmail} LIMIT 1`;
      if (!userRows.length) {
        await sql`INSERT INTO users (email, pin_hash) VALUES (${targetEmail}, NULL)`;
      }

      const actor = admin ? String(adminEmail).trim().toLowerCase() : grantor;
      await sql`
        INSERT INTO event_access (event_id, user_email, granted_by)
        VALUES (${eventId}, ${targetEmail}, ${actor})
        ON CONFLICT (event_id, user_email) DO NOTHING
      `;
      res.json({ success: true, email: targetEmail, eventId });
    } catch (err) {
      console.error('[POST /api/events/:id/access]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { email, revokedByEmail, adminEmail } = req.body || {};
    if (!email || !String(email).trim()) { res.status(400).json({ error: 'email is required.' }); return; }
    if (!revokedByEmail && !adminEmail) { res.status(400).json({ error: 'revokedByEmail is required.' }); return; }
    const targetEmail = String(email).trim().toLowerCase();
    const revoker = revokedByEmail ? String(revokedByEmail).trim().toLowerCase() : null;
    try {
      // Guard: cannot revoke the owner's access (owner is not in event_access, but give a clear error)
      const { rows: eventRows } = await sql`SELECT owner_email FROM events WHERE id = ${eventId}`;
      if (!eventRows.length) { res.status(404).json({ error: 'Event not found.' }); return; }
      if (eventRows[0].owner_email === targetEmail) {
        res.status(400).json({ error: 'Cannot revoke access for the event owner.' }); return;
      }

      const admin = await checkAdmin(adminEmail);
      if (!admin) {
        const { rows: revokerAccess } = await sql`
          SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${revoker}
          UNION ALL
          SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${revoker}
          LIMIT 1
        `;
        if (!revokerAccess.length) { res.status(403).json({ error: 'revokedByEmail does not have access to this event.' }); return; }
      }

      await sql`
        DELETE FROM event_access WHERE event_id = ${eventId} AND user_email = ${targetEmail}
      `;
      res.json({ success: true, email: targetEmail, eventId });
    } catch (err) {
      console.error('[DELETE /api/events/:id/access]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
