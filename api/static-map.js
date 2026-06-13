const https = require('https');

module.exports = (req, res) => {
  const { center, zoom, size, maptype = 'satellite' } = req.query;
  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!key) { res.status(500).json({ error: 'No API key configured' }); return; }

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${size}&maptype=${maptype}&scale=2&key=${key}`;

  https.get(url, (imgRes) => {
    const chunks = [];
    imgRes.on('data', c => chunks.push(c));
    imgRes.on('end', () => {
      res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/png');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end(Buffer.concat(chunks));
    });
  }).on('error', err => res.status(500).json({ error: err.message }));
};
