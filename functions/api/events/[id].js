import { neon } from '@neondatabase/serverless';

// SECURITY NOTE (Step 5/6 known simplifications):
// 1. `email` in request body/query is trusted without cryptographic proof — no session
//    tokens in this pass. The server checks ownership/access records but cannot verify
//    the caller truly authenticated as that email.
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
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function onRequestGet(context) {
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

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const adminEmail = searchParams.get('adminEmail');
  if (!email && !adminEmail) {
    return new Response(JSON.stringify({ error: 'email query parameter is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
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
      const access = await sql`
        SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${normalizedEmail}
        UNION ALL
        SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${normalizedEmail}
        LIMIT 1
      `;
      if (!access.length) {
        return new Response(JSON.stringify({ error: 'Access denied.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }
    const rows = await sql`
      SELECT id, name, owner_email, created_at, data, edit_log
      FROM events WHERE id = ${eventId}
    `;
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const accessRows = await sql`
      SELECT user_email, granted_at, granted_by
      FROM event_access WHERE event_id = ${eventId}
      ORDER BY granted_at ASC
    `;
    return new Response(JSON.stringify({ ...rows[0], access: accessRows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[GET /api/events/:id]', err);
    return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestPut(context) {
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
  const { email, data, adminEmail } = body || {};
  if (!email && !adminEmail) {
    return new Response(JSON.stringify({ error: 'email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'data is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
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
      const access = await sql`
        SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${normalizedEmail}
        UNION ALL
        SELECT 1 FROM event_access WHERE event_id = ${eventId} AND user_email = ${normalizedEmail}
        LIMIT 1
      `;
      if (!access.length) {
        return new Response(JSON.stringify({ error: 'Access denied.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }
    const actor = admin ? String(adminEmail).trim().toLowerCase() : normalizedEmail;
    const now = new Date().toISOString();
    const newEntry = JSON.stringify([{ email: actor, timestamp: now }]);
    const rows = await sql`
      UPDATE events SET
        data     = ${JSON.stringify(data)},
        edit_log = edit_log || ${newEntry}::jsonb
      WHERE id = ${eventId}
      RETURNING id, name, owner_email, created_at, data, edit_log
    `;
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify(rows[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[PUT /api/events/:id]', err);
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
  const { email, adminEmail } = body || {};
  if (!email && !adminEmail) {
    return new Response(JSON.stringify({ error: 'email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
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
      const ownerCheck = await sql`
        SELECT 1 FROM events WHERE id = ${eventId} AND owner_email = ${normalizedEmail}
      `;
      if (!ownerCheck.length) {
        return new Response(JSON.stringify({ error: 'Only the event owner can delete this event.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }
    const deleted = await sql`
      DELETE FROM events WHERE id = ${eventId} RETURNING name
    `;
    if (!deleted.length) {
      return new Response(JSON.stringify({ error: 'Event not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify({ deleted: true, name: deleted[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[DELETE /api/events/:id]', err);
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
