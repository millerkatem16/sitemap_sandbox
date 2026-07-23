import { neon } from '@neondatabase/serverless';

// SECURITY NOTE (Step 5/6 known simplifications):
// 1. `grantedByEmail` / `revokedByEmail` are trusted without cryptographic proof of
//    identity — no session tokens in this pass.
// 2. `adminEmail` field is trusted without a session token — the server only checks
//    that the email exists in the admins table, not that the caller proved identity
//    for this specific request. Both are accepted simplifications for the initial
//    version; proper session/token auth is a planned future hardening step.

async function checkAdmin(sql, adminEmail) {
  if (!adminEmail) return false;
  const rows = await sql`
    SELECT 1 FROM admins WHERE email = ${String(adminEmail).trim().toLowerCase()} LIMIT 1
  `;
  return rows.length > 0;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const sql = neon(env.POSTGRES_URL);
  const { id } = params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return new Response(JSON.stringify({ error: 'Invalid event id.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { email, grantedByEmail, adminEmail } = body || {};
  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  if (!grantedByEmail && !adminEmail) {
    return new Response(JSON.stringify({ error: 'grantedByEmail is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const targetEmail = String(email).trim().toLowerCase();
  const grantor = grantedByEmail ? String(grantedByEmail).trim().toLowerCase() : null;
  try {
    const existCheck = await sql`SELECT 1 FROM events WHERE id = ${eventId} LIMIT 1`;
    if (!existCheck.length) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const admin = await checkAdmin(sql, adminEmail);
    if (!admin) {
      // Anyone with existing access (owner or event_access row) can grant further access
      const grantorAccess = await sql`
        SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${grantor}
        UNION ALL
        SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${grantor}
        LIMIT 1
      `;
      if (!grantorAccess.length) {
        return new Response(JSON.stringify({ error: 'grantedByEmail does not have access to this event.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // Ensure the target user exists; insert a placeholder if not
    const userRows = await sql`SELECT 1 FROM users WHERE email = ${targetEmail} LIMIT 1`;
    if (!userRows.length) {
      await sql`INSERT INTO users (email, pin_hash) VALUES (${targetEmail}, NULL)`;
    }

    const actor = admin ? String(adminEmail).trim().toLowerCase() : grantor;
    await sql`
      INSERT INTO event_access (event_id, user_email, granted_by)
      VALUES (${eventId}, ${targetEmail}, ${actor})
      ON CONFLICT (event_id, user_email) DO NOTHING
    `;
    return new Response(JSON.stringify({ success: true, email: targetEmail, eventId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/events/:id/access]', err);
    return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const sql = neon(env.POSTGRES_URL);
  const { id } = params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return new Response(JSON.stringify({ error: 'Invalid event id.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { email, revokedByEmail, adminEmail } = body || {};
  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  if (!revokedByEmail && !adminEmail) {
    return new Response(JSON.stringify({ error: 'revokedByEmail is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const targetEmail = String(email).trim().toLowerCase();
  const revoker = revokedByEmail ? String(revokedByEmail).trim().toLowerCase() : null;
  try {
    // Guard: cannot revoke the owner's access (owner is not in event_access, but give a clear error)
    const eventRows = await sql`SELECT owner_email FROM events WHERE id = ${eventId}`;
    if (!eventRows.length) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (eventRows[0].owner_email === targetEmail) {
      return new Response(JSON.stringify({ error: 'Cannot revoke access for the event owner.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const admin = await checkAdmin(sql, adminEmail);
    if (!admin) {
      const revokerAccess = await sql`
        SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${revoker}
        UNION ALL
        SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${revoker}
        LIMIT 1
      `;
      if (!revokerAccess.length) {
        return new Response(JSON.stringify({ error: 'revokedByEmail does not have access to this event.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    await sql`
      DELETE FROM event_access WHERE event_id = ${eventId} AND user_email = ${targetEmail}
    `;
    return new Response(JSON.stringify({ success: true, email: targetEmail, eventId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[DELETE /api/events/:id/access]', err);
    return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequest(context) {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
