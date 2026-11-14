const blogList = document.querySelector("#blog-list");
const blogPost = document.querySelector("#blog-post");
const params = new URLSearchParams(window.location.search);
// Posts live at /blog/<slug>; older links used /blog.html?slug=<slug>.
const pathSlug = (window.location.pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/) || [])[1];
const ssrSlug = blogPost.dataset.ssrSlug || "";
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

function renderAuthor(post) {
  if (!post.author || !post.authorBio) return "";

  const photo = post.authorImage?.asset?.url
    ? `<img class="author-photo" src="${escapeHtml(post.authorImage.asset.url)}?w=192&h=192&fit=crop" alt="${escapeHtml(post.authorImage.alt || post.author)}">`
    : `<img class="author-photo author-photo-emblem" src="assets/emblem-purple.png" alt="">`;

  return `
    <aside class="author-card" aria-label="About the author">
      ${photo}
      <div>
        <p class="eyebrow">About the author</p>
        <h2>${escapeHtml(post.author)}</h2>
        <p>${escapeHtml(post.authorBio)}</p>
        <a class="author-link" href="index.html#contact">Connect with Cancer Coach USA</a>
      </div>
    </aside>
  `;
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
    ${renderAuthor(post)}
  `;
}

function postPath(slug) {
  return `/blog/${encodeURIComponent(slug)}`;
}

function markCurrent(slug) {
  blogList.querySelectorAll(".blog-list-item").forEach((item) => {
    if (item.dataset.slug === slug) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function showPost(slug) {
  const selected = posts.find((post) => post.slug === slug);
  if (!selected) return false;
  renderPost(selected);
  document.title = `${selected.title} | Cancer Coach USA`;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", `https://www.cancercoachusa.com${postPath(slug)}`);
  markCurrent(slug);
  return true;
}

function renderList() {
  if (!posts.length) {
    blogList.innerHTML = "<p>No published posts are available yet.</p>";
    blogPost.innerHTML = "<p>Add a published post in Sanity to populate this page.</p>";
    return;
  }

  // Real links, so search engines can follow them to each post's own page.
  blogList.innerHTML = posts
    .map((post) => `
      <a class="blog-list-item" href="${postPath(post.slug)}" data-slug="${escapeHtml(post.slug)}">
        <span>${escapeHtml(post.category || "Article")}</span>
        <strong>${escapeHtml(post.title)}</strong>
        <small>${escapeHtml(formatDate(post.publishedAt))}</small>
      </a>
    `)
    .join("");

  blogList.querySelectorAll(".blog-list-item").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      if (showPost(link.dataset.slug)) {
        history.pushState({ slug: link.dataset.slug }, "", postPath(link.dataset.slug));
        blogPost.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  const selectedSlug = ssrSlug || pathSlug || params.get("slug");
  if (ssrSlug) {
    // The server already rendered this post; just highlight it in the list.
    markCurrent(ssrSlug);
    return;
  }
  const selected = posts.find((post) => post.slug === selectedSlug) || posts[0];
  renderPost(selected);
  markCurrent(selected.slug);
}

window.addEventListener("popstate", () => {
  const slug = (window.location.pathname.match(/^\/blog\/([a-z0-9-]+)\/?$/) || [])[1];
  if (slug) showPost(slug);
  else if (posts[0]) showPost(posts[0].slug);
});

fetch("/api/blog-posts")
  .then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load blog posts.");
    posts = data.posts || [];
    renderList();
  })
  .catch((error) => {
    // On a server-rendered post page the article and list are already there.
    if (ssrSlug) return;
    blogList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    blogPost.innerHTML = "<p>Confirm the Sanity environment variables are set on the Vercel project.</p>";
  });
