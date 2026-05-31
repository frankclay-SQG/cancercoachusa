const { handleError, sanityUploadAsset, sendJson } = require("./lib/sanity");

function getHeader(request, name) {
  const headers = request.headers || {};
  const lowerName = name.toLowerCase();
  return headers[name] || headers[lowerName] || headers[Object.keys(headers).find((key) => key.toLowerCase() === lowerName)];
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

function readStream(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function parseContentDisposition(value = "") {
  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.includes("="))
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, rest.join("=").replace(/^"|"$/g, "")];
      })
  );
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    const error = new Error("Missing multipart boundary");
    error.statusCode = 400;
    throw error;
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = buffer.toString("binary");
  const parts = body.split(boundary).slice(1, -1);

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separatorIndex = part.indexOf("\r\n\r\n");
    if (separatorIndex === -1) continue;

    const rawHeaders = part.slice(0, separatorIndex);
    const content = part.slice(separatorIndex + 4);
    const headers = Object.fromEntries(
      rawHeaders.split("\r\n").map((line) => {
        const [name, ...rest] = line.split(":");
        return [name.toLowerCase(), rest.join(":").trim()];
      })
    );
    const disposition = parseContentDisposition(headers["content-disposition"]);

    if (disposition.filename) {
      return {
        buffer: Buffer.from(content, "binary"),
        filename: disposition.filename,
        contentType: headers["content-type"] || "application/octet-stream",
      };
    }
  }

  const error = new Error("No file found in upload");
  error.statusCode = 400;
  throw error;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    validateMasterKey(request);
    const contentType = getHeader(request, "content-type") || "";
    const contentLength = Number(getHeader(request, "content-length") || 0);

    if (contentLength > 15 * 1024 * 1024) {
      sendJson(response, 413, { error: "Uploads are limited to 15 MB." });
      return;
    }

    const buffer = await readStream(request);
    const file = parseMultipart(buffer, contentType);
    const uploaded = await sanityUploadAsset(file);

    sendJson(response, 200, {
      ok: true,
      assetType: uploaded.assetType,
      assetId: uploaded.document?._id,
      url: uploaded.document?.url,
      filename: file.filename,
      mimeType: file.contentType,
    });
  } catch (error) {
    handleError(response, error);
  }
};
