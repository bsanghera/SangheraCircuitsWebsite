module.exports = async function handler(req, res) {
  // Security: only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GMAPS_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const { gmaps_url, origin, destination } = req.query;

  if (!gmaps_url && !(origin && destination)) {
    return res.status(400).json({ error: 'Provide gmaps_url or both origin and destination' });
  }

  if (gmaps_url) {
    const decoded = decodeURIComponent(gmaps_url);
    const isGoogleUrl = /^https:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps|maps\.google\.com)/.test(decoded);
    if (!isGoogleUrl) {
      return res.status(400).json({ error: 'URL must be a Google Maps link' });
    }
  }

  try {
    let resolvedOrigin = origin;
    let resolvedDestination = destination;

    if (gmaps_url) {
      const decoded = decodeURIComponent(gmaps_url);
      const resolved = await fetch(decoded, { redirect: 'follow' });
      const finalUrl = resolved.url;
      const parsed = parseGoogleMapsUrl(finalUrl);
      resolvedOrigin = parsed.origin;
      resolvedDestination = parsed.destination;
    }

    resolvedOrigin = resolvedOrigin.replace(/[^a-zA-Z0-9 .,\-+]/g, '').substring(0, 200);
    resolvedDestination = resolvedDestination.replace(/[^a-zA-Z0-9 .,\-+]/g, '').substring(0, 200);

    const directionsUrl =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${encodeURIComponent(resolvedOrigin)}` +
      `&destination=${encodeURIComponent(resolvedDestination)}` +
      `&mode=bicycling` +
      `&key=${GMAPS_KEY}`;

    const gmaps = await fetch(directionsUrl).then(r => r.json());

    console.log('Google API status:', gmaps.status, '| error_message:', gmaps.error_message || 'none');
    console.log('Routes count:', gmaps.routes ? gmaps.routes.length : 'no routes key');

    if (gmaps.status !== 'OK') {
      return res.status(400).json({ error: 'Could not get directions. Check that both points are valid.' });
    }

    const route = gmaps.routes[0];
    console.log('overview_polyline:', JSON.stringify(route.overview_polyline));
    console.log('legs count:', route.legs ? route.legs.length : 'none');

    const polylineValue = route.overview_polyline && route.overview_polyline.value;
    if (!polylineValue) {
      return res.status(500).json({ error: 'No polyline in directions response' });
    }

    const points = decodePolyline(polylineValue);
    const steps = route.legs[0].steps;
    const gpx = buildGpx(points, steps, resolvedOrigin, resolvedDestination);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', 'attachment; filename="route.gpx"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(gpx);

  } catch (err) {
    console.error('GPX handler error:', err.message, err.stack);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

function parseGoogleMapsUrl(url) {
  const dirMatch = url.match(/maps\/dir\/([^/]+)\/([^/?]+)/);
  if (dirMatch) return {
    origin: decodeURIComponent(dirMatch[1].replace(/\+/g, ' ')),
    destination: decodeURIComponent(dirMatch[2].replace(/\+/g, ' '))
  };
  const saddr = url.match(/[?&]saddr=([^&]+)/);
  const daddr = url.match(/[?&]daddr=([^&]+)/);
  if (saddr && daddr) return {
    origin: decodeURIComponent(saddr[1]),
    destination: decodeURIComponent(daddr[1])
  };
  throw new Error('Could not parse Google Maps URL');
}

function decodePolyline(encoded) {
  let points = [], index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function buildGpx(points, steps, origin, destination) {
  const wpts = steps.map(s => {
    const loc = s.start_location;
    const instr = s.html_instructions.replace(/<[^>]+>/g, '').substring(0, 60);
    const safe = instr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `  <wpt lat="${loc.lat}" lon="${loc.lng}"><name>${safe}</name></wpt>`;
  }).join('\n');

  const trkpts = points.map(([lat, lng]) =>
    `      <trkpt lat="${lat}" lon="${lng}"/>`
  ).join('\n');

  const safeName = `${origin} to ${destination}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="KioxRouter">
  <metadata><name>${safeName}</name></metadata>
${wpts}
  <trk><name>Route</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}