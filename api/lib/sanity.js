const API_VERSION = "2025-05-01";

function getSanityConfig() {
  const projectId = process.env.SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET || "production";
  const token =
    process.env.SANITY_READ_TOKEN ||
    process.env.SANITY_API_READ_TOKEN ||
    process.env.SANITY_WRITE_TOKEN ||
    process.env.SANITY_API_WRITE_TOKEN;

  if (!projectId) {
    const error = new Error("Missing SANITY_PROJECT_ID");
    error.statusCode = 500;
    throw error;
  }

  return { projectId, dataset, token };
}

function getSanityWriteConfig() {
  const config = getSanityConfig();
  const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_WRITE_TOKEN;

  if (!token) {
    const error = new Error("Missing SANITY_WRITE_TOKEN");
    error.statusCode = 500;
    throw error;
  }

  return { ...config, token };
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

async function sanityMutate(mutations) {
  const { projectId, dataset, token } = getSanityWriteConfig();
  const url = `https://${projectId}.api.sanity.io/v${API_VERSION}/data/mutate/${dataset}`;
  const result = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mutations }),
  });
  const body = await result.json().catch(() => ({}));

  if (!result.ok) {
    const error = new Error(body?.error?.description || body?.message || "Sanity mutation failed");
    error.statusCode = result.status;
    error.details = body;
    throw error;
  }

  return body;
}

async function sanityUploadAsset({ buffer, filename, contentType }) {
  const { projectId, dataset, token } = getSanityWriteConfig();
  const isImage = String(contentType || "").startsWith("image/");
  const assetType = isImage ? "images" : "files";
  const url = new URL(`https://${projectId}.api.sanity.io/v${API_VERSION}/assets/${assetType}/${dataset}`);

  if (filename) {
    url.searchParams.set("filename", filename);
  }

  const result = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: buffer,
  });
  const body = await result.json().catch(() => ({}));

  if (!result.ok) {
    const error = new Error(body?.error?.description || body?.message || "Sanity asset upload failed");
    error.statusCode = result.status;
    error.details = body;
    throw error;
  }

  return {
    assetType: isImage ? "image" : "file",
    document: body.document,
  };
}

function handleError(response, error) {
  sendJson(response, error.statusCode || 500, {
    error: error.message || "Unexpected server error",
    details: error.details,
  });
}

module.exports = {
  handleError,
  sanityMutate,
  sanityQuery,
  sanityUploadAsset,
  sendJson,
};
