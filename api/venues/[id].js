const { sql } = require('@vercel/postgres');
const { put } = require('@vercel/blob');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const { rows } = await sql`
        SELECT id, name, city, venue_data, preview_image_url, created_at, updated_at
        FROM venues WHERE id = ${id}
      `;
      if (!rows.length) { res.status(404).json({ error: 'Venue not found.' }); return; }
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'PUT') {
    const { pin, venue_data, name, city, preview_image } = req.body || {};
    if (!venue_data) { res.status(400).json({ error: 'venue_data is required.' }); return; }
    try {
      const { rows: existing } = await sql`SELECT pin_hash FROM venues WHERE id = ${id}`;
      if (!existing.length) { res.status(404).json({ error: 'Venue not found.' }); return; }
      const valid = await bcrypt.compare(String(pin || ''), existing[0].pin_hash);
      if (!valid) { res.status(401).json({ error: 'Incorrect PIN — venue not updated.' }); return; }
      let preview_image_url = null;
      if (preview_image) {
        const b64 = String(preview_image).replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(b64, 'base64');
        const blob = await put(`venues/preview-${Date.now()}.jpg`, buf, { access: 'public', contentType: 'image/jpeg' });
        preview_image_url = blob.url;
      }
      const { rows } = await sql`
        UPDATE venues SET
          venue_data        = ${JSON.stringify(venue_data)},
          name              = COALESCE(${name ? String(name).trim() : null}, name),
          city              = COALESCE(${city ? String(city).trim() : null}, city),
          preview_image_url = COALESCE(${preview_image_url}, preview_image_url),
          updated_at        = now()
        WHERE id = ${id}
        RETURNING id, name, city, venue_data, preview_image_url, updated_at
      `;
      if (!rows.length) { res.status(404).json({ error: 'Venue not found.' }); return; }
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
