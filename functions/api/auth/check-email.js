import { neon } from '@neondatabase/serverless';

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
  const { email } = body || {};
  if (!email || !String(email).trim()) {
    return new Response(JSON.stringify({ error: 'Email is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  try {
    const rows = await sql`
      SELECT 1 FROM users WHERE email = ${String(email).trim().toLowerCase()} LIMIT 1
    `;
    return new Response(JSON.stringify({ exists: rows.length > 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/auth/check-email]', err);
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
