export async function onRequestGet(context) {
  const { request, env } = context;
  const { searchParams } = new URL(request.url);
  const center = searchParams.get('center');
  const zoom = searchParams.get('zoom');
  const size = searchParams.get('size');
  const maptype = searchParams.get('maptype') || 'satellite';

  const key = env.VITE_GOOGLE_MAPS_API_KEY || '';
  if (!key) {
    return new Response(JSON.stringify({ error: 'No API key configured' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(center)}&zoom=${zoom}&size=${size}&maptype=${maptype}&scale=2&key=${key}`;

  try {
    const imageResponse = await fetch(url);
    return new Response(imageResponse.body, {
      headers: {
        'Content-Type': imageResponse.headers.get('content-type') || 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
