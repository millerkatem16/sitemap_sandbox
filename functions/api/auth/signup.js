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
  if (!/^\d{4}$/.test(String(pin || ''))) {
    return new Response(JSON.stringify({ error: 'PIN must be exactly 4 digits.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const existing = await sql`SELECT 1 FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
    if (existing.length > 0) {
      return new Response(JSON.stringify({ error: 'Email already registered.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const pin_hash = await bcrypt.hash(String(pin), 10);
    await sql`INSERT INTO users (email, pin_hash) VALUES (${normalizedEmail}, ${pin_hash})`;
    return new Response(JSON.stringify({ success: true, email: normalizedEmail }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/auth/signup]', err);
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
