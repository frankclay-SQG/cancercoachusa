// Old blog post addresses → new ones.
//
// Posts used to live at /blog.html?slug=<slug>, rendered in the browser.
// They now have their own server-rendered pages at /blog/<slug> (see
// api/blog-post-page.js). Links already shared on social media, and URLs
// search engines have seen, are sent to the new address with a permanent
// (301) redirect so they keep working and pass their ranking along.
// /blog.html without a slug is the blog index and passes straight through.

export const config = {
  matcher: "/blog.html",
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function passThrough() {
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}

export default function middleware(request) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  if (!slug || slug.length > 120 || !SLUG_PATTERN.test(slug)) return passThrough();

  // Keep any tracking parameters (utm_*, fbclid, ...) but drop the slug.
  url.searchParams.delete("slug");
  const query = url.searchParams.toString();
  const target = new URL(`/blog/${slug}${query ? `?${query}` : ""}`, url.origin);

  return new Response(null, {
    status: 301,
    headers: {
      location: target.toString(),
      "cache-control": "public, max-age=3600",
    },
  });
}
