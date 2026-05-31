const { handleError, sanityMutate, sendJson } = require("./lib/sanity");

function getHeader(request, name) {
  const headers = request.headers || {};
  const lowerName = name.toLowerCase();
  return headers[name] || headers[lowerName] || headers[Object.keys(headers).find((key) => key.toLowerCase() === lowerName)];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function portableTextFromPlainText(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      _key: `p${Date.now()}${index}`,
      _type: "block",
      style: "normal",
      markDefs: [],
      children: [
        {
          _key: `s${Date.now()}${index}`,
          _type: "span",
          marks: [],
          text: paragraph.replace(/\n/g, " "),
        },
      ],
    }));
}

function validateMasterKey(request) {
  const configuredKey = process.env.BLOG_ADMIN_MASTER_KEY;
  const providedKey = getHeader(request, "x-blog-master-key");

  if (!configuredKey) {
    const error = new Error("Missing BLOG_ADMIN_MASTER_KEY");
    error.statusCode = 500;
    throw error;
  }

  if (!providedKey || providedKey !== configuredKey) {
    const error = new Error("Invalid blog master key");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    validateMasterKey(request);

    const payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const title = String(payload?.title || "").trim();
    const bodyText = String(payload?.body || "").trim();
    const slug = slugify(payload?.slug || title);

    if (!title || !slug || !bodyText) {
      sendJson(response, 400, { error: "Title, slug, and body are required." });
      return;
    }

    const document = {
      _type: "post",
      title,
      slug: { _type: "slug", current: slug },
      excerpt: String(payload?.excerpt || "").trim(),
      category: String(payload?.category || "").trim(),
      publishedAt: payload?.publishNow === false ? payload?.publishedAt || new Date().toISOString() : new Date().toISOString(),
      body: portableTextFromPlainText(bodyText),
    };

    if (payload?.mode === "draft") {
      document._id = `drafts.post-${slug}`;
    }

    const result = await sanityMutate([{ createOrReplace: document }]);
    sendJson(response, 200, {
      ok: true,
      slug,
      documentId: result.results?.[0]?.id,
      mode: payload?.mode === "draft" ? "draft" : "published",
    });
  } catch (error) {
    handleError(response, error);
  }
};
