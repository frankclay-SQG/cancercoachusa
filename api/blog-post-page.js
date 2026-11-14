// Serves each blog post as its own page at /blog/<slug> (see the rewrite in
// vercel.json).
//
// blog.html is used as the page template. This route fills in the post's
// title, description, canonical link, share tags, structured data, the full
// article text and the list of posts, so search engines and link previews
// see the real post without running JavaScript. blog.js then takes over in
// the browser for switching between posts.

const fs = require("fs");
const path = require("path");
const { sanityQuery } = require("./lib/sanity");
const {
  POST_FIELDS,
  SITE,
  SLUG_PATTERN,
  escapeHtml,
  postUrl,
  renderList,
  renderPost,
} = require("./lib/posts");

const DEFAULT_DESCRIPTION = "Survivorship articles, guidance, and resources from Cancer Coach USA.";
const LOGO = `${SITE}/assets/cancer-coach-usa-logo.png`;

let templateCache = null;
let notFoundCache = null;

function readFile(name) {
  return fs.readFileSync(path.join(process.cwd(), name), "utf8");
}

function template() {
  if (!templateCache) templateCache = readFile("blog.html");
  return templateCache;
}

function notFoundPage() {
  if (!notFoundCache) {
    try {
      notFoundCache = readFile("404.html");
    } catch {
      notFoundCache = "<!doctype html><title>Page Not Found | Cancer Coach USA</title><p>Page not found.</p>";
    }
  }
  return notFoundCache;
}

// Replace exactly one piece of the template; fail loudly if blog.html changes
// shape so a broken page is never served silently.
function replaceOnce(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`blog.html template is missing: ${label}`);
  return html.replace(pattern, () => replacement);
}

function isoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function structuredData(post, url, image) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    image: image ? [image] : undefined,
    datePublished: isoDate(post.publishedAt),
    dateModified: isoDate(post._updatedAt || post.publishedAt),
    author: post.author ? { "@type": "Person", name: post.author } : undefined,
    publisher: {
      "@type": "Organization",
      name: "Cancer Coach USA",
      url: SITE,
      logo: { "@type": "ImageObject", url: LOGO },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    articleSection: post.category || undefined,
  };
  // "<" is escaped so post text can never close the script tag.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function buildPage(post, posts) {
  const url = postUrl(post.slug);
  const title = `${post.title} | Cancer Coach USA`;
  const description = post.excerpt || DEFAULT_DESCRIPTION;
  const shareImage = post.mainImage?.asset?.url
    ? `${post.mainImage.asset.url}?w=1200&h=630&fit=crop&fm=jpg&q=85`
    : null;

  let html = template();

  // Post pages live one folder down, so resolve blog.html's relative links
  // (styles.css, site.js, index.html#contact, ...) from the site root.
  html = replaceOnce(html, /<meta charset="utf-8">/, '<meta charset="utf-8">\n    <base href="/">', "charset meta");

  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`, "title");
  html = replaceOnce(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*>/,
    `<meta name="description" content="${escapeHtml(description)}">`,
    "meta description"
  );
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeHtml(url)}">`, "canonical");
  html = replaceOnce(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="article">`, "og:type");
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(post.title)}">`, "og:title");
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    "og:description"
  );
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(url)}">`, "og:url");

  if (shareImage) {
    const imageTags = [
      `<meta property="og:image" content="${escapeHtml(shareImage)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${escapeHtml(post.mainImage.alt || post.title)}">`,
    ].join("\n    ");
    html = replaceOnce(html, /<meta property="og:image" content="[^"]*">/, imageTags, "og:image");
    html = replaceOnce(html, /<meta name="twitter:card" content="[^"]*">/, `<meta name="twitter:card" content="summary_large_image">`, "twitter:card");
  }

  if (post.publishedAt) {
    html = replaceOnce(
      html,
      /<\/head>/,
      `    <meta property="article:published_time" content="${escapeHtml(isoDate(post.publishedAt) || "")}">\n` +
        `    <script type="application/ld+json">${structuredData(post, url, shareImage)}</script>\n  </head>`,
      "head close"
    );
  }

  // The post title is the page's h1; the "Blog" banner becomes a styled <p>.
  html = replaceOnce(
    html,
    /<h1 id="blog-title">Blog<\/h1>/,
    '<p class="page-hero-title" id="blog-title">Blog</p>',
    "hero heading"
  );

  html = replaceOnce(
    html,
    /<div id="blog-list" class="blog-list">[\s\S]*?<\/div>/,
    `<div id="blog-list" class="blog-list">${renderList(posts, post.slug)}\n          </div>`,
    "post list"
  );

  html = replaceOnce(
    html,
    /<article id="blog-post" class="blog-post">[\s\S]*?<\/article>/,
    `<article id="blog-post" class="blog-post" data-ssr-slug="${escapeHtml(post.slug)}">${renderPost(post)}\n        </article>`,
    "post article"
  );

  return html;
}

function sendHtml(response, statusCode, html, cacheControl) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", cacheControl);
  response.end(html);
}

function sendNotFound(response) {
  sendHtml(response, 404, notFoundPage(), "public, max-age=0, s-maxage=60");
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end();
    return;
  }

  const slug = String(request.query?.slug || "").trim();
  if (!slug || slug.length > 120 || !SLUG_PATTERN.test(slug)) {
    sendNotFound(response);
    return;
  }

  try {
    const result = await sanityQuery(
      `{
        "post": *[_type == "post" && slug.current == $slug && publishedAt <= now()][0]${POST_FIELDS},
        "posts": *[_type == "post" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc){
          title, "slug": slug.current, publishedAt, category
        }
      }`,
      { slug }
    );

    if (!result?.post?.title) {
      sendNotFound(response);
      return;
    }

    const posts = (result.posts || []).filter((item) => SLUG_PATTERN.test(item.slug || ""));
    sendHtml(
      response,
      200,
      buildPage(result.post, posts),
      "public, max-age=0, s-maxage=300, stale-while-revalidate=86400"
    );
  } catch (error) {
    console.error("[blog-post-page]", error.message);
    // 503 tells search engines this is temporary, so the page keeps its place.
    response.setHeader("Retry-After", "300");
    sendHtml(
      response,
      503,
      '<!doctype html><meta charset="utf-8"><title>Cancer Coach USA</title>' +
        '<p>This article is temporarily unavailable. Please try again in a few minutes, or visit <a href="/blog.html">the blog</a>.</p>',
      "no-store"
    );
  }
};
