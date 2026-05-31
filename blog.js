const blogList = document.querySelector("#blog-list");
const blogPost = document.querySelector("#blog-post");
const params = new URLSearchParams(window.location.search);
let posts = [];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

function renderSpan(span, markDefs = []) {
  let text = escapeHtml(span.text);
  for (const mark of span.marks || []) {
    const definition = markDefs.find((item) => item._key === mark);
    if (mark === "strong") text = `<strong>${text}</strong>`;
    if (mark === "em") text = `<em>${text}</em>`;
    if (mark === "code") text = `<code>${text}</code>`;
    if (definition?._type === "link" && definition.href) {
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

  for (const block of blocks) {
    if (block._type === "block") {
      const content = (block.children || []).map((span) => renderSpan(span, block.markDefs)).join("");
      if (block.listItem) {
        listType = block.listItem === "number" ? "ol" : "ul";
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
      html.push(`
        <figure>
          <img src="${escapeHtml(block.asset.url)}" alt="${escapeHtml(block.alt || "")}">
          ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}
        </figure>
      `);
    }

    if (block._type === "file" && block.asset?.url) {
      flushList();
      html.push(`
        <p>
          <a class="file-link" href="${escapeHtml(block.asset.url)}" rel="noopener">
            ${escapeHtml(block.title || block.asset.originalFilename || "Download file")}
          </a>
        </p>
      `);
    }
  }

  flushList();
  return html.join("");
}

function renderPost(post) {
  if (!post) {
    blogPost.innerHTML = "<p>No post selected.</p>";
    return;
  }

  const image = post.mainImage?.asset?.url
    ? `<img class="post-hero-image" src="${escapeHtml(post.mainImage.asset.url)}" alt="${escapeHtml(post.mainImage.alt || "")}">`
    : "";

  blogPost.innerHTML = `
    ${image}
    <p class="eyebrow">${escapeHtml(post.category || "Article")}</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="post-meta">${[formatDate(post.publishedAt), post.author].filter(Boolean).map(escapeHtml).join(" | ")}</p>
    ${post.excerpt ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>` : ""}
    <div class="rich-text">${renderBlocks(post.body)}</div>
  `;
}

function renderList() {
  if (!posts.length) {
    blogList.innerHTML = "<p>No published posts are available yet.</p>";
    blogPost.innerHTML = "<p>Add a published post in Sanity to populate this page.</p>";
    return;
  }

  blogList.innerHTML = posts
    .map((post) => `
      <button class="blog-list-item" type="button" data-slug="${escapeHtml(post.slug)}">
        <span>${escapeHtml(post.category || "Article")}</span>
        <strong>${escapeHtml(post.title)}</strong>
        <small>${escapeHtml(formatDate(post.publishedAt))}</small>
      </button>
    `)
    .join("");

  blogList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = posts.find((post) => post.slug === button.dataset.slug);
      history.replaceState(null, "", `blog.html?slug=${encodeURIComponent(button.dataset.slug)}`);
      renderPost(selected);
    });
  });

  const selectedSlug = params.get("slug");
  renderPost(posts.find((post) => post.slug === selectedSlug) || posts[0]);
}

fetch("/api/blog-posts")
  .then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load blog posts.");
    posts = data.posts || [];
    renderList();
  })
  .catch((error) => {
    blogList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    blogPost.innerHTML = "<p>Confirm the Sanity environment variables are set on the Vercel project.</p>";
  });
