import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, { status: 200, headers: corsHeaders });
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
  const { email, pin } = body || {};
  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'Email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const rows = await sql`SELECT pin_hash FROM users WHERE email = ${normalizedEmail}`;
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Email not found.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (rows[0].pin_hash === null) {
      // Placeholder user invited before signup — this login attempt sets their PIN
      if (!/^\d{4}$/.test(String(pin || ''))) {
        return new Response(JSON.stringify({ error: 'PIN must be exactly 4 digits.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      const pin_hash = await bcrypt.hash(String(pin), 10);
      await sql`UPDATE users SET pin_hash = ${pin_hash} WHERE email = ${normalizedEmail}`;
      return new Response(JSON.stringify({ success: true, email: normalizedEmail, firstTimeSetup: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const valid = await bcrypt.compare(String(pin || ''), rows[0].pin_hash);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Incorrect PIN.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify({ success: true, email: normalizedEmail }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
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
