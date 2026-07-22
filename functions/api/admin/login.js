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
  const { email, password } = body || {};
  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'Email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  if (!password) {
    return new Response(JSON.stringify({ error: 'Password is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const rows = await sql`SELECT password_hash FROM admins WHERE email = ${normalizedEmail}`;
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Invalid credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const valid = await bcrypt.compare(String(password), rows[0].password_hash);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify({ success: true, email: normalizedEmail, isAdmin: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/admin/login]', err);
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
