// Serves /sitemap.xml (see the rewrite in vercel.json).
//
// The fixed pages are listed below. Every published blog post is added
// from Sanity with its last-edited date, so new posts and edits reach
// search engines without anyone touching this file. If Sanity can't be
// reached, the fixed pages are still served.

const { sanityQuery } = require("./lib/sanity");

const SITE = "https://www.cancercoachusa.com";

const PAGES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/pillars.html", priority: "0.8", changefreq: "monthly" },
  { path: "/blog.html", priority: "0.8", changefreq: "weekly" },
  { path: "/schedule.html", priority: "0.7", changefreq: "monthly" },
  { path: "/podcast.html", priority: "0.6", changefreq: "monthly" },
  { path: "/meetings.html", priority: "0.6", changefreq: "monthly" },
  { path: "/meetup.html", priority: "0.6", changefreq: "monthly" },
  { path: "/download.html", priority: "0.6", changefreq: "monthly" },
  { path: "/privacy.html", priority: "0.2", changefreq: "yearly" },
  { path: "/terms.html", priority: "0.2", changefreq: "yearly" },
];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function day(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadPosts() {
  try {
    const posts = await sanityQuery(
      `*[_type == "post" && defined(slug.current) && publishedAt <= now() && !(_id in path("drafts.**"))] | order(publishedAt desc){"slug": slug.current, publishedAt, _updatedAt}`
    );
    return (posts || []).filter((post) => SLUG_PATTERN.test(post.slug || ""));
  } catch (error) {
    console.error("[sitemap] Could not load blog posts", error.message);
    return [];
  }
}

module.exports = async function handler(request, response) {
  const posts = await loadPosts();
  const newestPost = posts.reduce((latest, post) => {
    const updated = day(post._updatedAt);
    return updated && (!latest || updated > latest) ? updated : latest;
  }, null);

  const entries = PAGES.map((page) =>
    urlEntry({
      loc: `${SITE}${page.path}`,
      // The blog index changes whenever a post does.
      lastmod: page.path === "/blog.html" ? newestPost : null,
      changefreq: page.changefreq,
      priority: page.priority,
    })
  );

  for (const post of posts) {
    entries.push(
      urlEntry({
        loc: `${SITE}/blog.html?slug=${post.slug}`,
        lastmod: day(post._updatedAt) || day(post.publishedAt),
        changefreq: "monthly",
        priority: "0.7",
      })
    );
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/xml; charset=utf-8");
  response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  response.end(xml);
};
