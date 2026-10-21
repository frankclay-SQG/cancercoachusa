// Public, non-secret settings the browser needs. The HubSpot account ID is
// public by nature (it appears in every HubSpot tracking script URL).
// Set HUBSPOT_PORTAL_ID on the Vercel project to skip the lookup below.

let cachedPortalId = null;

async function lookupPortalId() {
  if (process.env.HUBSPOT_PORTAL_ID) return String(process.env.HUBSPOT_PORTAL_ID).trim();
  if (cachedPortalId) return cachedPortalId;

  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) return null;

  try {
    const result = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!result.ok) {
      console.error("[site-config] HubSpot account lookup failed", result.status);
      return null;
    }
    const body = await result.json();
    cachedPortalId = body.portalId ? String(body.portalId) : null;
    return cachedPortalId;
  } catch (error) {
    console.error("[site-config] HubSpot account lookup error", error.message);
    return null;
  }
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const hubspotPortalId = await lookupPortalId();
  const valid = hubspotPortalId && /^\d+$/.test(hubspotPortalId);

  response.statusCode = 200;
  response.setHeader(
    "Cache-Control",
    valid ? "public, s-maxage=86400, stale-while-revalidate=604800" : "no-store",
  );
  response.end(JSON.stringify({ hubspotPortalId: valid ? hubspotPortalId : null }));
};
