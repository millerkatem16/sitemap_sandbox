export async function onRequestGet(context) {
  const { env } = context;
  return new Response(JSON.stringify({ mapsKey: env.VITE_GOOGLE_MAPS_API_KEY || '' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
