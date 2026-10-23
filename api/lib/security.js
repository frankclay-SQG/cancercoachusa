const crypto = require("crypto");

function getHeader(request, name) {
  const headers = request.headers || {};
  const lowerName = name.toLowerCase();
  return (
    headers[name] ||
    headers[lowerName] ||
    headers[Object.keys(headers).find((key) => key.toLowerCase() === lowerName)]
  );
}

function clientIp(request) {
  const forwarded = String(getHeader(request, "x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || getHeader(request, "x-real-ip") || request.socket?.remoteAddress || "unknown";
}

// Compares two strings without leaking how many leading characters match.
function safeEqual(provided, expected) {
  const a = crypto.createHash("sha256").update(String(provided || "")).digest();
  const b = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(a, b) && Boolean(provided);
}

// Best-effort, per-instance rate limiter. Serverless instances do not share
// memory, so this slows down abuse rather than guaranteeing a hard cap.
const buckets = new Map();

function rateLimit(key, { limit, windowMs, message }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
  } else {
    bucket.count += 1;
  }

  if (buckets.size > 5000) {
    for (const [storedKey, value] of buckets) {
      if (now - value.start > windowMs) buckets.delete(storedKey);
    }
  }

  const current = buckets.get(key);
  if (current.count > limit) {
    const error = new Error(message || "Too many requests. Please wait a few minutes and try again.");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil((current.start + windowMs - now) / 1000);
    throw error;
  }
}

const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i;

function isSafeHref(href) {
  const value = String(href || "").trim();
  if (!value) return false;
  // Relative paths like "pillars.html" have no scheme and are safe.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  return SAFE_LINK.test(value);
}

module.exports = {
  clientIp,
  getHeader,
  isSafeHref,
  rateLimit,
  safeEqual,
};
