import { neon } from '@neondatabase/serverless';

// SECURITY NOTE: The `email` supplied in the query/body is trusted without
// cryptographic proof of identity — the frontend re-sends it after a successful
// /api/auth/login call, but the server does not re-verify it per-request in this
// pass (no session tokens). This is an accepted simplification for the initial
// version; proper session/token auth is a planned future hardening step.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const sql = neon(env.POSTGRES_URL);
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const adminEmail = searchParams.get('adminEmail');

  if (adminEmail) {
    const normalizedAdmin = String(adminEmail).trim().toLowerCase();
    try {
      const adminCheck = await sql`SELECT 1 FROM admins WHERE email = ${normalizedAdmin} LIMIT 1`;
      if (!adminCheck.length) {
        return new Response(JSON.stringify({ error: 'Not an admin account.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      const rows = await sql`SELECT id, name, owner_email, created_at FROM events ORDER BY created_at DESC`;
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      console.error('[GET /api/events admin]', err);
      return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'email query parameter is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const rows = await sql`
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
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[GET /api/events]', err);
    return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const sql = neon(env.POSTGRES_URL);

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { email, name, data } = body || {};
  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  if (!name || !String(name).trim()) {
    return new Response(JSON.stringify({ error: 'name is required.' }), {
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
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    // Ensure owner exists in users (no-op for real users; creates placeholder for admin emails)
    const userRows = await sql`SELECT 1 FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
    if (!userRows.length) {
      await sql`INSERT INTO users (email, pin_hash) VALUES (${normalizedEmail}, NULL)`;
    }
    const now = new Date().toISOString();
    const initialLog = JSON.stringify([{ email: normalizedEmail, timestamp: now }]);
    const rows = await sql`
      INSERT INTO events (name, owner_email, data, edit_log)
      VALUES (
        ${String(name).trim()},
        ${normalizedEmail},
        ${JSON.stringify(data)},
        ${initialLog}::jsonb
      )
      RETURNING id, name, owner_email, created_at
    `;
    return new Response(JSON.stringify(rows[0]), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/events]', err);
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
