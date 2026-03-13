module.exports = async function handler(req, res) {
  // Security: only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Security: basic rate limit via Vercel's edge (no state needed)
  const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!GMAPS_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration' }); // never expose key name
  }

  const { gmaps_url, origin, destination } = req.query;

  // Security: validate inputs exist
  if (!gmaps_url && !(origin && destination)) {
    return res.status(400).json({ error: 'Provide gmaps_url or both origin and destination' });
  }

  // Security: if gmaps_url provided, validate it looks like a Google Maps URL
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
