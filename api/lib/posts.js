// Shared blog-post helpers for the serverless routes.
//
// POST_FIELDS is the GROQ projection used by /api/blog-posts and by the
// server-rendered post pages at /blog/<slug>. The render* functions turn a
// post into the same HTML that blog.js builds in the browser, so a search
// engine (or anyone without JavaScript) sees the full article.

const SITE = "https://www.cancercoachusa.com";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const POST_FIELDS = `{
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  _updatedAt,
  category,
  "author": coalesce(author->name, *[_type == "author"] | order(_createdAt asc)[0].name),
  "authorBio": coalesce(author->bio, *[_type == "author"] | order(_createdAt asc)[0].bio),
  "authorImage": coalesce(author->image, *[_type == "author"] | order(_createdAt asc)[0].image){
    alt,
    asset->{url}
  },
  mainImage{
    alt,
    asset->{url, metadata{dimensions}}
  },
  body[]{
    ...,
    _type == "image" => {
      ...,
      alt,
      asset->{url, metadata{dimensions}}
    },
    _type == "file" => {
      ...,
      asset->{url, originalFilename, mimeType, size}
    }
  }
}`;

function postPath(slug) {
  return `/blog/${slug}`;
}

function postUrl(slug) {
  return `${SITE}${postPath(slug)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function isSafeHref(href) {
  const value = String(href || "").trim();
  if (!value) return false;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  return /^(https?:|mailto:|tel:)/i.test(value);
}

function renderSpan(span, markDefs = []) {
  let text = escapeHtml(span.text);
  for (const mark of span.marks || []) {
    const definition = markDefs.find((item) => item._key === mark);
    if (mark === "strong") text = `<strong>${text}</strong>`;
    if (mark === "em") text = `<em>${text}</em>`;
    if (mark === "code") text = `<code>${text}</code>`;
    if (definition?._type === "link" && isSafeHref(definition.href)) {
      text = `<a href="${escapeHtml(definition.href)}" rel="noopener">${text}</a>`;
    }
  }
  return text;
}

function renderBlocks(blocks = []) {
  const html = [];
  let listItems = [];
  let listType = "ul";

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
  };

  for (const block of blocks || []) {
    if (block._type === "block") {
      const content = (block.children || []).map((span) => renderSpan(span, block.markDefs)).join("");
      if (block.listItem) {
        const type = block.listItem === "number" ? "ol" : "ul";
        if (listItems.length && type !== listType) flushList();
        listType = type;
        listItems.push(`<li>${content}</li>`);
        continue;
      }

      flushList();
      const style = block.style || "normal";
      if (style === "h2") html.push(`<h2>${content}</h2>`);
      else if (style === "h3") html.push(`<h3>${content}</h3>`);
      else if (style === "blockquote") html.push(`<blockquote>${content}</blockquote>`);
      else html.push(`<p>${content}</p>`);
    }

    if (block._type === "image" && block.asset?.url) {
      flushList();
      html.push(
        `<figure><img src="${escapeHtml(block.asset.url)}" alt="${escapeHtml(block.alt || "")}" loading="lazy">` +
          (block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "") +
          `</figure>`
      );
    }

    if (block._type === "file" && block.asset?.url) {
      flushList();
      html.push(
        `<p><a class="file-link" href="${escapeHtml(block.asset.url)}" rel="noopener">` +
          `${escapeHtml(block.title || block.asset.originalFilename || "Download file")}</a></p>`
      );
    }
  }

  flushList();
  return html.join("\n");
}

function renderAuthor(post) {
  if (!post.author || !post.authorBio) return "";

  const photo = post.authorImage?.asset?.url
    ? `<img class="author-photo" src="${escapeHtml(post.authorImage.asset.url)}?w=192&h=192&fit=crop" alt="${escapeHtml(post.authorImage.alt || post.author)}">`
    : `<img class="author-photo author-photo-emblem" src="/assets/emblem-purple.png" alt="">`;

  return `
    <aside class="author-card" aria-label="About the author">
      ${photo}
      <div>
        <p class="eyebrow">About the author</p>
        <h2>${escapeHtml(post.author)}</h2>
        <p>${escapeHtml(post.authorBio)}</p>
        <a class="author-link" href="/index.html#contact">Connect with Cancer Coach USA</a>
      </div>
    </aside>`;
}

function renderPost(post) {
  const image = post.mainImage?.asset?.url
    ? `<img class="post-hero-image" src="${escapeHtml(post.mainImage.asset.url)}" alt="${escapeHtml(post.mainImage.alt || "")}">`
    : "";

  return `
    ${image}
    <p class="eyebrow">${escapeHtml(post.category || "Article")}</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="post-meta">${[formatDate(post.publishedAt), post.author].filter(Boolean).map(escapeHtml).join(" | ")}</p>
    ${post.excerpt ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>` : ""}
    <div class="rich-text">${renderBlocks(post.body)}</div>
    ${renderAuthor(post)}`;
}

function renderList(posts, currentSlug) {
  return posts
    .map(
      (post) => `
      <a class="blog-list-item" href="${postPath(post.slug)}" data-slug="${escapeHtml(post.slug)}"${
        post.slug === currentSlug ? ' aria-current="page"' : ""
      }>
        <span>${escapeHtml(post.category || "Article")}</span>
        <strong>${escapeHtml(post.title)}</strong>
        <small>${escapeHtml(formatDate(post.publishedAt))}</small>
      </a>`
    )
    .join("");
}

module.exports = {
  POST_FIELDS,
  SITE,
  SLUG_PATTERN,
  escapeHtml,
  postPath,
  postUrl,
  renderList,
  renderPost,
};
