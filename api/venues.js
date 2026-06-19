const { sql } = require('@vercel/postgres');
const { put } = require('@vercel/blob');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'GET') {
    try {
      const { rows } = await sql`
        SELECT id, name, city, preview_image_url, created_at
        FROM venues ORDER BY created_at DESC
      `;
      res.json(rows);
    } catch (err) {
      console.error('[GET /api/venues]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  if (req.method === 'POST') {
    const { name, city, venue_data, pin, preview_image } = req.body || {};
    if (!name || !String(name).trim()) { res.status(400).json({ error: 'Name is required.' }); return; }
    if (!/^\d{4}$/.test(String(pin || ''))) { res.status(400).json({ error: 'PIN must be exactly 4 digits.' }); return; }
    if (!venue_data) { res.status(400).json({ error: 'venue_data is required.' }); return; }
    try {
      const pin_hash = await bcrypt.hash(String(pin), 10);
      let preview_image_url = null;
      if (preview_image) {
        const b64 = String(preview_image).replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(b64, 'base64');
        const blob = await put(`venues/preview-${Date.now()}.jpg`, buf, { access: 'public', contentType: 'image/jpeg' });
        preview_image_url = blob.url;
      }
      const { rows } = await sql`
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
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error('[POST /api/venues]', err);
      res.status(500).json({ error: err.message, code: err.code || null });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
