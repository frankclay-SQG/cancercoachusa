// Per-post link previews for the blog.
//
// blog.html is one static page that renders whichever post is named in
// ?slug=. Social sites (Facebook, LinkedIn, Bluesky, Threads, iMessage)
// read the page's Open Graph tags without running JavaScript, so every
// shared post used to show the same generic card. When a request names a
// slug, this middleware fills that post's title, excerpt and featured
// image into the page's share tags. All other requests pass straight
// through to the static file.

export const config = {
  matcher: "/blog.html",
};

const SITE = "https://www.cancercoachusa.com";
const API_VERSION = "2025-05-01";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function passThrough() {
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchPost(slug) {
  const projectId = process.env.SANITY_PROJECT_ID;
  if (!projectId) return null;
  const dataset = process.env.SANITY_DATASET || "production";
  const token = process.env.SANITY_READ_TOKEN || process.env.SANITY_API_READ_TOKEN;

  const url = new URL(`https://${projectId}.apicdn.sanity.io/v${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set(
    "query",
    `*[_type == "post" && slug.current == $slug && publishedAt <= now()][0]{title, excerpt, "imageUrl": mainImage.asset->url, "imageAlt": mainImage.alt}`
  );
  url.searchParams.set("$slug", JSON.stringify(slug));

  const response = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!response.ok) return null;
  const body = await response.json();
  return body?.result || null;
}

function setTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function personalize(html, post, slug) {
  const pageUrl = `${SITE}/blog.html?slug=${encodeURIComponent(slug)}`;
  const title = `${post.title} | Cancer Coach USA`;
  const description = post.excerpt || "Survivorship articles, guidance, and resources from Cancer Coach USA.";
  const image = post.imageUrl ? `${post.imageUrl}?w=1200&h=630&fit=crop&fm=jpg&q=85` : null;

  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = setTag(html, /<meta\s+name="description"\s+content="[^"]*"\s*>/, `<meta name="description" content="${escapeAttr(description)}">`);
  html = setTag(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${escapeAttr(pageUrl)}">`);
  html = setTag(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="article">`);
  html = setTag(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeAttr(post.title)}">`);
  html = setTag(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeAttr(description)}">`);
  html = setTag(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeAttr(pageUrl)}">`);

  if (image) {
    const imageTags = [
      `<meta property="og:image" content="${escapeAttr(image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${escapeAttr(post.imageAlt || post.title)}">`,
    ].join("\n    ");
    html = setTag(html, /<meta property="og:image" content="[^"]*">/, imageTags);
    html = setTag(html, /<meta name="twitter:card" content="[^"]*">/, `<meta name="twitter:card" content="summary_large_image">`);
  }

  return html;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  if (!slug || slug.length > 120 || !SLUG_PATTERN.test(slug)) return passThrough();

  try {
    const post = await fetchPost(slug);
    if (!post?.title) return passThrough();

    // Load the static page itself (no slug, so this request passes through).
    const pageHeaders = {};
    const cookie = request.headers.get("cookie");
    if (cookie) pageHeaders.cookie = cookie; // keeps preview deployments' sign-in working
    const page = await fetch(new URL("/blog.html", url.origin), { headers: pageHeaders });
    if (!page.ok) return passThrough();

    const html = personalize(await page.text(), post, slug);
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[middleware] blog preview", error?.message || error);
    return passThrough();
  }
}
