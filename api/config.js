module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ mapsKey: process.env.VITE_GOOGLE_MAPS_API_KEY || '' });
};
