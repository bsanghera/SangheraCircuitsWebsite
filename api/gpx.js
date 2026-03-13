module.exports = async function handler(req, res) {
  const { gmaps_url } = req.query;

  if (!gmaps_url) {
    return res.status(400).json({ error: 'Missing gmaps_url parameter' });
  }

  const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

  try {
    // Resolve shortened URL and extract origin/destination
    const resolved = await fetch(gmaps_url, { redirect: 'follow' });
    const finalUrl = resolved.url;
    const { origin, destination } = parseGoogleMapsUrl(finalUrl);

    // Call Directions API
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=bicycling&key=${GMAPS_KEY}`;
    const gmaps = await fetch(directionsUrl).then(r => r.json());

    if (gmaps.status !== 'OK') {
      return res.status(400).json({ error: `Directions API error: ${gmaps.status}` });
    }

    const route = gmaps.routes[0];
    const points = decodePolyline(route.overview_polyline.value);
    const steps = route.legs[0].steps;
    const gpx = buildGpx(points, steps, origin, destination);

    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', 'attachment; filename="route.gpx"');
    return res.send(gpx);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function parseGoogleMapsUrl(url) {
  // Format: /maps/dir/Origin/Destination
  const dirMatch = url.match(/maps\/dir\/([^/]+)\/([^/?]+)/);
  if (dirMatch) return {
    origin: decodeURIComponent(dirMatch[1].replace(/\+/g, ' ')),
    destination: decodeURIComponent(dirMatch[2].replace(/\+/g, ' '))
  };
  // Format: ?saddr=...&daddr=...
  const saddr = url.match(/[?&]saddr=([^&]+)/);
  const daddr = url.match(/[?&]daddr=([^&]+)/);
  if (saddr && daddr) return {
    origin: decodeURIComponent(saddr[1]),
    destination: decodeURIComponent(daddr[1])
  };
  throw new Error('Could not parse Google Maps URL — try sharing a route with both a start and end point set');
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
    const instr = s.html_instructions.replace(/<[^>]+>/g, '');
    return `  <wpt lat="${loc.lat}" lon="${loc.lng}"><name>${instr.substring(0, 60)}</name></wpt>`;
  }).join('\n');

  const trkpts = points.map(([lat, lng]) =>
    `      <trkpt lat="${lat}" lon="${lng}"/>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="KioxRouter">
  <metadata><name>${origin} to ${destination}</name></metadata>
${wpts}
  <trk><name>Route</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}
```

---

## Phase 3: Add your API key to Vercel (2 mins)

1. In Vercel dashboard → your project → **Settings → Environment Variables**
2. Add a new variable:
   - **Name:** `GOOGLE_MAPS_API_KEY`
   - **Value:** your key from Phase 1
3. Hit Save, then go to **Deployments** and **Redeploy** so it picks up the variable

**Test it:** Visit `https://your-project.vercel.app/api/gpx?origin=San+Francisco,CA&destination=Oakland,CA` — your browser should download a `.gpx` file.

---

## Phase 4: Build the iOS Shortcut

Now follow Phase 3 from my previous message exactly, but use your **Vercel URL** for the endpoint:
```
https://your-project.vercel.app/api/gpx?gmaps_url=