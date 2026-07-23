import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function onRequestGet(context) {
  const { env } = context;
  const sql = neon(env.POSTGRES_URL);
  try {
    const rows = await sql`
      SELECT id, name, city, preview_image_url, created_at
      FROM venues ORDER BY created_at DESC
    `;
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[GET /api/venues]', err);
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
  const { name, city, venue_data, pin, preview_image } = body || {};
  if (!name || !String(name).trim()) {
    return new Response(JSON.stringify({ error: 'Name is required.' }), {
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
  if (!venue_data) {
    return new Response(JSON.stringify({ error: 'venue_data is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  try {
    const pin_hash = await bcrypt.hash(String(pin), 10);
    let preview_image_url = null;
    if (preview_image) {
      const b64 = String(preview_image).replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      const key = `venues/preview-${Date.now()}.jpg`;
      await env.PREVIEW_IMAGES_BUCKET.put(key, buf, {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      preview_image_url = `${env.R2_PUBLIC_URL_BASE}/${key}`;
    }
    const rows = await sql`
      INSERT INTO venues (name, city, venue_data, pin_hash, preview_image_url)
      VALUES (
        ${String(name).trim()},
        ${city ? String(city).trim() : null},
        ${JSON.stringify(venue_data)},
        ${pin_hash},
        ${preview_image_url}
      )
      RETURNING id, name, city, preview_image_url, created_at
    `;
    return new Response(JSON.stringify(rows[0]), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[POST /api/venues]', err);
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
