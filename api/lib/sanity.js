const API_VERSION = "2025-05-01";

function getSanityConfig() {
  const projectId = process.env.SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET || "production";
  const token = process.env.SANITY_READ_TOKEN || process.env.SANITY_API_READ_TOKEN;

  if (!projectId) {
    const error = new Error("Missing SANITY_PROJECT_ID");
    error.statusCode = 500;
    throw error;
  }

  return { projectId, dataset, token };
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", statusCode === 200 ? "s-maxage=60, stale-while-revalidate=600" : "no-store");
  response.end(JSON.stringify(payload));
}

async function sanityQuery(query, params = {}) {
  const { projectId, dataset, token } = getSanityConfig();
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set("query", query);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(`$${key}`, JSON.stringify(value));
    }
  }

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const result = await fetch(url, { headers });
  const body = await result.json().catch(() => ({}));

  if (!result.ok) {
    const error = new Error(body?.error?.description || body?.message || "Sanity query failed");
    error.statusCode = result.status;
    error.details = body;
    throw error;
  }

  return body.result;
}

function handleError(response, error) {
  sendJson(response, error.statusCode || 500, {
    error: error.message || "Unexpected server error",
    details: error.details,
  });
}

module.exports = {
  handleError,
  sanityQuery,
  sendJson,
};
