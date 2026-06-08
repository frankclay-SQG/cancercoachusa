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

const summaryStopWords = new Set([
  "about",
  "after",
  "also",
  "because",
  "been",
  "before",
  "being",
  "care",
  "from",
  "have",
  "into",
  "more",
  "most",
  "post",
  "that",
  "their",
  "there",
  "these",
  "this",
  "through",
  "with",
  "your",
]);

function summaryTerms(value) {
  const counts = new Map();
  const words = String(value || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];

  words.forEach((word) => {
    const term = word.replace(/^'+|'+$/g, "");
    if (summaryStopWords.has(term)) return;
    counts.set(term, (counts.get(term) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([term]) => term);
}

function readableList(items) {
  const cleanItems = items.filter(Boolean);
  if (cleanItems.length <= 1) return cleanItems[0] || "";
  if (cleanItems.length === 2) return `${cleanItems[0]} and ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")}, and ${cleanItems.at(-1)}`;
}

function trimSummary(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).replace(/\s+\S*$/, "").trim()}...`;
}

function summaryFromText(title, value) {
  const cleanTitle = String(title || "").replace(/[.!?]+$/g, "").trim();
  const terms = summaryTerms(value).filter((term) => !cleanTitle.toLowerCase().includes(term));
  const topic = cleanTitle || readableList(terms.slice(0, 2)) || "the article";
  const focus = readableList(terms.slice(0, 3));

  if (!focus) {
    return trimSummary(`A concise overview of ${topic} for readers seeking practical support.`);
  }

  return trimSummary(
    `A concise overview of ${topic}, highlighting ${focus} for readers seeking practical support.`
  );
}

function uniqueKey(prefix, index) {
  return `${prefix}${Date.now()}${index}`;
}

function normalizeMarkDefs(markDefs = []) {
  return markDefs
    .filter((definition) => definition?._type === "link" && definition._key && definition.href)
    .map((definition) => ({
      _key: String(definition._key),
      _type: "link",
      href: String(definition.href),
    }));
}

function normalizeTextBlock(block, index) {
  const allowedStyles = new Set(["normal", "h2", "h3", "blockquote"]);
  const markDefs = normalizeMarkDefs(block.markDefs);
  const allowedMarks = new Set(["strong", "em", "code", ...markDefs.map((definition) => definition._key)]);
  const children = (block.children || [])
    .filter((child) => child?._type === "span" && child.text)
    .map((child, childIndex) => ({
      _key: child._key || uniqueKey("s", `${index}${childIndex}`),
      _type: "span",
      marks: (child.marks || []).filter((mark) => allowedMarks.has(mark)),
      text: String(child.text),
    }));

  if (!children.length) return null;

  const normalized = {
    _key: block._key || uniqueKey("b", index),
    _type: "block",
    style: allowedStyles.has(block.style) ? block.style : "normal",
    markDefs,
    children,
  };

  if (["bullet", "number"].includes(block.listItem)) {
    normalized.listItem = block.listItem;
    normalized.level = Number(block.level) > 0 ? Number(block.level) : 1;
  }

  return normalized;
}

function normalizeRichTextBlocks(blocks = []) {
  return blocks
    .map((block, index) => {
      if (block?._type === "block") return normalizeTextBlock(block, index);

      if (block?._type === "image" && block.asset?._ref) {
        return {
          _key: block._key || uniqueKey("img", index),
          _type: "image",
          alt: String(block.alt || ""),
          caption: String(block.caption || ""),
          asset: { _type: "reference", _ref: String(block.asset._ref) },
        };
      }

      if (block?._type === "file" && block.asset?._ref) {
        return {
          _key: block._key || uniqueKey("file", index),
          _type: "file",
          title: String(block.title || "Download file"),
          asset: { _type: "reference", _ref: String(block.asset._ref) },
        };
      }

      return null;
    })
    .filter(Boolean);
}

function portableTextFromPayload(payload) {
  if (Array.isArray(payload?.bodyBlocks)) {
    const blocks = normalizeRichTextBlocks(payload.bodyBlocks);
    if (blocks.length) return blocks;
  }

  return [
    ...portableTextFromPlainText(payload?.body),
    ...mediaBlocksFromPayload(payload?.media),
  ];
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
  const body = portableTextFromPayload(payload);
  const bodyText = bodyPlainText(body) || String(payload?.body || "").trim();
  const slug = slugify(payload?.slug || title);

  if (!title || !slug || !bodyText) {
    const error = new Error("Title, slug, and body are required.");
    error.statusCode = 400;
    throw error;
  }

  const payloadId = String(payload?.id || "");
  const baseDocumentId = payloadId.replace(/^drafts\./, "") || `post-${slug}`;
  const documentId = payload?.mode === "draft" ? `drafts.${baseDocumentId}` : baseDocumentId;
  const draftIdToDelete = payloadId.startsWith("drafts.") && documentId !== payloadId ? payloadId : "";
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
    excerpt: summaryFromText(title, bodyText),
    category: String(payload?.category || "").trim(),
    publishedAt,
    body,
  };

  if (payload?.mainImage?.assetId) {
    document.mainImage = {
      _type: "image",
      alt: payload.mainImage.alt || "",
      caption: payload.mainImage.caption || "",
      asset: { _type: "reference", _ref: payload.mainImage.assetId },
    };
  }

  return { document, draftIdToDelete, slug };
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

    const { document, draftIdToDelete, slug } = documentFromPayload(payload);
    const mutations = [{ createOrReplace: document }];
    if (draftIdToDelete) mutations.push({ delete: { id: draftIdToDelete } });
    const result = await sanityMutate(mutations);
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
