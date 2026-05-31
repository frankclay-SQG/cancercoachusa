const { handleError, sanityMutate, sanityQuery, sendJson } = require("./lib/sanity");

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
  const stamp = Date.now();
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      _key: `p${stamp}${index}`,
      _type: "block",
      style: "normal",
      markDefs: [],
      children: [
        {
          _key: `s${stamp}${index}`,
          _type: "span",
          marks: [],
          text: paragraph.replace(/\n/g, " "),
        },
      ],
    }));
}

function mediaBlocksFromPayload(media = []) {
  const stamp = Date.now();
  return media
    .filter((item) => item?.assetId)
    .map((item, index) => {
      if (item.assetType === "image") {
        return {
          _key: `img${stamp}${index}`,
          _type: "image",
          alt: item.alt || "",
          caption: item.caption || "",
          asset: { _type: "reference", _ref: item.assetId },
        };
      }

      return {
        _key: `file${stamp}${index}`,
        _type: "file",
        title: item.title || item.filename || "Download file",
        asset: { _type: "reference", _ref: item.assetId },
      };
    });
}

function bodyPlainText(blocks = []) {
  return blocks
    .filter((block) => block?._type === "block")
    .map((block) => (block.children || []).map((child) => child.text || "").join(""))
    .filter(Boolean)
    .join("\n\n");
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

async function readPayload(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body;
}

async function listPosts(response) {
  const posts = await sanityQuery(`*[_type == "post"] | order(publishedAt desc){
    _id,
    title,
    "slug": slug.current,
    excerpt,
    publishedAt,
    category,
    "bodyText": pt::text(body),
    "mainImageAssetId": mainImage.asset._ref,
    mainImage{
      alt,
      caption,
      asset->{url}
    },
    body[]{
      ...,
      _type == "image" => {
        ...,
        "assetId": asset._ref,
        asset->{url}
      },
      _type == "file" => {
        ...,
        "assetId": asset._ref,
        asset->{url, originalFilename, mimeType, size}
      }
    }
  }`);

  sendJson(response, 200, { posts: posts || [] });
}

function documentFromPayload(payload) {
  const title = String(payload?.title || "").trim();
  const bodyText = String(payload?.body || "").trim();
  const slug = slugify(payload?.slug || title);

  if (!title || !slug || !bodyText) {
    const error = new Error("Title, slug, and body are required.");
    error.statusCode = 400;
    throw error;
  }

  const documentId = payload?.id || (payload?.mode === "draft" ? `drafts.post-${slug}` : `post-${slug}`);
  const publishedAt = payload?.mode === "scheduled"
    ? payload?.publishedAt
    : payload?.publishedAt || new Date().toISOString();

  if (payload?.mode === "scheduled" && !publishedAt) {
    const error = new Error("Scheduled posts require a publish date and time.");
    error.statusCode = 400;
    throw error;
  }

  const document = {
    _id: documentId,
    _type: "post",
    title,
    slug: { _type: "slug", current: slug },
    excerpt: String(payload?.excerpt || "").trim(),
    category: String(payload?.category || "").trim(),
    publishedAt,
    body: [
      ...portableTextFromPlainText(bodyText),
      ...mediaBlocksFromPayload(payload?.media),
    ],
  };

  if (payload?.mainImage?.assetId) {
    document.mainImage = {
      _type: "image",
      alt: payload.mainImage.alt || "",
      caption: payload.mainImage.caption || "",
      asset: { _type: "reference", _ref: payload.mainImage.assetId },
    };
  }

  return { document, slug };
}

module.exports = async function handler(request, response) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    validateMasterKey(request);

    if (request.method === "GET") {
      await listPosts(response);
      return;
    }

    const payload = await readPayload(request);

    if (request.method === "DELETE") {
      const id = payload?.id || request.query?.id;
      if (!id) {
        sendJson(response, 400, { error: "Post id is required." });
        return;
      }
      await sanityMutate([{ delete: { id } }]);
      sendJson(response, 200, { ok: true, deletedId: id });
      return;
    }

    const { document, slug } = documentFromPayload(payload);
    const result = await sanityMutate([{ createOrReplace: document }]);
    sendJson(response, 200, {
      ok: true,
      slug,
      documentId: result.results?.[0]?.id || document._id,
      mode: document._id.startsWith("drafts.") ? "draft" : payload?.mode === "scheduled" ? "scheduled" : "published",
    });
  } catch (error) {
    handleError(response, error);
  }
};
