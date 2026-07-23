import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions(context) {
  return new Response(null, { status: 200, headers: corsHeaders });
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const { id } = params;
  const sql = neon(env.POSTGRES_URL);
  try {
    const rows = await sql`
      SELECT id, name, city, venue_data, preview_image_url, created_at, updated_at
      FROM venues WHERE id = ${id}
    `;
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Venue not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify(rows[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[GET /api/venues/:id]', err);
    return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const { id } = params;
  const sql = neon(env.POSTGRES_URL);

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { pin, venue_data, name, city, preview_image } = body || {};
  if (!venue_data) {
    return new Response(JSON.stringify({ error: 'venue_data is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  try {
    const existing = await sql`SELECT pin_hash FROM venues WHERE id = ${id}`;
    if (!existing.length) {
      return new Response(JSON.stringify({ error: 'Venue not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const valid = await bcrypt.compare(String(pin || ''), existing[0].pin_hash);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Incorrect PIN — venue not updated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
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
      UPDATE venues SET
        venue_data        = ${JSON.stringify(venue_data)},
        name              = COALESCE(${name ? String(name).trim() : null}, name),
        city              = COALESCE(${city ? String(city).trim() : null}, city),
        preview_image_url = COALESCE(${preview_image_url}, preview_image_url),
        updated_at        = now()
      WHERE id = ${id}
      RETURNING id, name, city, venue_data, preview_image_url, updated_at
    `;
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Venue not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    return new Response(JSON.stringify(rows[0]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[PUT /api/venues/:id]', err);
    return new Response(JSON.stringify({ error: err.message, code: err.code || null }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const { id } = params;
  const sql = neon(env.POSTGRES_URL);

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { pin } = body || {};
  try {
    const existing = await sql`SELECT pin_hash, name FROM venues WHERE id = ${id}`;
    if (!existing.length) {
      return new Response(JSON.stringify({ error: 'Venue not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const valid = await bcrypt.compare(String(pin || ''), existing[0].pin_hash);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Incorrect PIN — venue not deleted.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    await sql`DELETE FROM venues WHERE id = ${id}`;
    return new Response(JSON.stringify({ deleted: true, name: existing[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[DELETE /api/venues/:id]', err);
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
