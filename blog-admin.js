const adminForm = document.querySelector("#blog-admin-form");
const adminStatus = document.querySelector("#blog-admin-status");
const postList = document.querySelector("#admin-post-list");
const loadPostsButton = document.querySelector("#load-posts-button");
const newPostButton = document.querySelector("#new-post-button");
const deletePostButton = document.querySelector("#delete-post-button");
const featuredPreview = document.querySelector("#featured-image-preview");
const inlinePreview = document.querySelector("#inline-media-preview");
const scheduleFields = document.querySelector("#schedule-publish-fields");
const bodyEditor = document.querySelector("#blog-body-editor");
const inlineImageInput = document.querySelector("#inline-image-input");

let posts = [];
let selectedPost = null;
let lastEditorRange = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function masterKey() {
  return String(new FormData(adminForm).get("master_key") || "");
}

function setStatus(message) {
  adminStatus.textContent = message;
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isFutureDate(value) {
  return value && new Date(value).getTime() > Date.now();
}

function updateScheduleFields() {
  const isScheduled = adminForm.elements.mode.value === "scheduled";
  scheduleFields.hidden = !isScheduled;
  adminForm.elements.publish_date.required = isScheduled;
  adminForm.elements.publish_time.required = isScheduled;
}

function scheduledIsoFromForm(formData) {
  const mode = String(formData.get("mode") || "draft");
  if (mode !== "scheduled") return "";

  const date = String(formData.get("publish_date") || "");
  const time = String(formData.get("publish_time") || "");
  if (!date || !time) {
    throw new Error("Choose a publish date and time for scheduled posts.");
  }

  const scheduled = new Date(`${date}T${time}`);
  if (Number.isNaN(scheduled.getTime())) {
    throw new Error("Choose a valid publish date and time.");
  }

  if (scheduled.getTime() <= Date.now()) {
    throw new Error("Scheduled publish time must be in the future.");
  }

  return scheduled.toISOString();
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

function mediaFromBlocks(blocks = []) {
  return blocks
    .filter((block) => ["image", "file"].includes(block?._type) && (block.assetId || block.asset?._ref))
    .map((block) => ({
      assetType: block._type,
      assetId: block.assetId || block.asset?._ref,
      alt: block.alt || "",
      caption: block.caption || "",
      title: block.title || block.asset?.originalFilename || "Download file",
      filename: block.asset?.originalFilename || "",
      url: block.asset?.url || "",
    }));
}

function renderMediaPreview(container, media) {
  if (!media.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = media
    .map((item) => `
      <span>
        ${escapeHtml(item.assetType === "image" ? "Image" : "File")}:
        ${item.url ? `<a href="${escapeHtml(item.url)}" rel="noopener">${escapeHtml(item.title || item.filename || item.assetId)}</a>` : escapeHtml(item.filename || item.assetId)}
      </span>
    `)
    .join("");
}

function rememberEditorSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (bodyEditor.contains(range.commonAncestorContainer)) {
    lastEditorRange = range.cloneRange();
  }
}

function restoreEditorSelection() {
  bodyEditor.focus();
  const selection = window.getSelection();
  selection.removeAllRanges();
  if (lastEditorRange && bodyEditor.contains(lastEditorRange.commonAncestorContainer)) {
    selection.addRange(lastEditorRange);
  }
}

function insertEditorNode(node) {
  restoreEditorSelection();
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    bodyEditor.append(node);
    bodyEditor.append(document.createElement("p"));
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);

  const spacer = document.createElement("p");
  spacer.append(document.createElement("br"));
  node.after(spacer);

  range.setStart(spacer, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  rememberEditorSelection();
}

function createImageFigure(media) {
  const figure = document.createElement("figure");
  figure.dataset.assetId = media.assetId;
  figure.dataset.assetType = "image";

  const image = document.createElement("img");
  image.src = media.url;
  image.alt = media.alt || "";
  image.dataset.assetId = media.assetId;
  image.dataset.assetType = "image";
  figure.append(image);

  const caption = document.createElement("figcaption");
  caption.textContent = media.caption || "";
  caption.setAttribute("aria-label", "Image caption");
  figure.append(caption);

  return figure;
}

function linkMarkKey(markDefs, href) {
  const found = markDefs.find((definition) => definition._type === "link" && definition.href === href);
  if (found) return found._key;

  const key = `link${markDefs.length + 1}`;
  markDefs.push({ _key: key, _type: "link", href });
  return key;
}

function appendSpan(spans, text, marks = []) {
  if (!text) return;

  const cleanMarks = [...new Set(marks.filter(Boolean))];
  const previous = spans.at(-1);
  if (previous && previous.marks.join("|") === cleanMarks.join("|")) {
    previous.text += text;
    return;
  }

  spans.push({
    _key: `s${Date.now()}${spans.length}${Math.random().toString(16).slice(2, 6)}`,
    _type: "span",
    marks: cleanMarks,
    text,
  });
}

function collectSpans(node, spans, markDefs, activeMarks = []) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendSpan(spans, node.textContent, activeMarks);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.tagName.toLowerCase();
  if (tag === "br") {
    appendSpan(spans, "\n", activeMarks);
    return;
  }

  const marks = [...activeMarks];
  if (["strong", "b"].includes(tag)) marks.push("strong");
  if (["em", "i"].includes(tag)) marks.push("em");
  if (tag === "code") marks.push("code");
  if (tag === "a") {
    const href = node.getAttribute("href");
    if (href && !node.dataset.assetId) marks.push(linkMarkKey(markDefs, href));
  }

  node.childNodes.forEach((child) => collectSpans(child, spans, markDefs, marks));
}

function textBlockFromElement(element, options = {}) {
  const markDefs = [];
  const children = [];
  collectSpans(element, children, markDefs);

  const text = children.map((child) => child.text).join("").trim();
  if (!text) return null;

  return {
    _key: `b${Date.now()}${Math.random().toString(16).slice(2, 8)}`,
    _type: "block",
    style: options.style || "normal",
    markDefs,
    children,
    ...(options.listItem ? { listItem: options.listItem, level: 1 } : {}),
  };
}

function standaloneFileBlock(element) {
  const link = element.matches?.("a[data-asset-id][data-asset-type='file']")
    ? element
    : element.querySelector?.("a[data-asset-id][data-asset-type='file']");
  if (!link) return null;

  const assetId = link.dataset.assetId;
  if (!assetId) return null;

  return {
    _key: `file${Date.now()}${Math.random().toString(16).slice(2, 8)}`,
    _type: "file",
    title: link.textContent.trim() || "Download file",
    asset: { _type: "reference", _ref: assetId },
  };
}

function imageBlockFromElement(element) {
  const image = element.matches?.("img[data-asset-id]")
    ? element
    : element.querySelector?.("img[data-asset-id]");
  if (!image?.dataset.assetId) return null;

  const figure = image.closest("figure");
  return {
    _key: `img${Date.now()}${Math.random().toString(16).slice(2, 8)}`,
    _type: "image",
    alt: image.alt || "",
    caption: figure?.querySelector("figcaption")?.textContent.trim() || "",
    asset: { _type: "reference", _ref: image.dataset.assetId },
  };
}

function blocksFromEditor() {
  const blocks = [];

  bodyEditor.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const wrapper = document.createElement("p");
      wrapper.textContent = node.textContent;
      const block = textBlockFromElement(wrapper);
      if (block) blocks.push(block);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    const fileBlock = standaloneFileBlock(node);
    if (fileBlock) {
      blocks.push(fileBlock);
      return;
    }

    const imageBlock = imageBlockFromElement(node);
    if (imageBlock && tag === "figure") {
      blocks.push(imageBlock);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      node.querySelectorAll(":scope > li").forEach((item) => {
        const block = textBlockFromElement(item, { listItem: tag === "ol" ? "number" : "bullet" });
        if (block) blocks.push(block);
      });
      return;
    }

    const styleMap = {
      h2: "h2",
      h3: "h3",
      blockquote: "blockquote",
    };
    const block = textBlockFromElement(node, { style: styleMap[tag] || "normal" });
    if (block) blocks.push(block);
  });

  return blocks;
}

function plainTextFromBlocks(blocks = []) {
  return blocks
    .filter((block) => block?._type === "block")
    .map((block) => (block.children || []).map((child) => child.text || "").join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function generatedExcerpt() {
  const text = plainTextFromBlocks(blocksFromEditor());
  if (text.length <= 180) return text;
  const clipped = text.slice(0, 181);
  return `${clipped.slice(0, clipped.lastIndexOf(" ") > 120 ? clipped.lastIndexOf(" ") : 180).trim()}...`;
}

function updateGeneratedExcerpt() {
  adminForm.elements.excerpt.value = generatedExcerpt();
  renderMediaPreview(inlinePreview, mediaFromBlocks(blocksFromEditor()));
}

function renderMarkedText(children = [], markDefs = []) {
  return children
    .map((child) => {
      let text = escapeHtml(child.text || "");
      for (const mark of child.marks || []) {
        const definition = markDefs.find((item) => item._key === mark);
        if (mark === "strong") text = `<strong>${text}</strong>`;
        if (mark === "em") text = `<em>${text}</em>`;
        if (mark === "code") text = `<code>${text}</code>`;
        if (definition?._type === "link" && definition.href) {
          text = `<a href="${escapeHtml(definition.href)}">${text}</a>`;
        }
      }
      return text;
    })
    .join("");
}

function editorHtmlFromBlocks(blocks = []) {
  const html = [];
  let listItems = [];
  let listType = "";

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
    listType = "";
  };

  blocks.forEach((block) => {
    if (block._type === "block") {
      const content = renderMarkedText(block.children, block.markDefs);
      if (block.listItem) {
        const type = block.listItem === "number" ? "ol" : "ul";
        if (listType && listType !== type) flushList();
        listType = type;
        listItems.push(`<li>${content}</li>`);
        return;
      }

      flushList();
      const tag = ["h2", "h3", "blockquote"].includes(block.style) ? block.style : "p";
      html.push(`<${tag}>${content}</${tag}>`);
      return;
    }

    flushList();
    if (block._type === "image" && (block.asset?.url || block.assetId)) {
      html.push(`
        <figure data-asset-id="${escapeHtml(block.assetId || block.asset?._ref || "")}" data-asset-type="image">
          <img
            src="${escapeHtml(block.asset?.url || "")}"
            alt="${escapeHtml(block.alt || "")}"
            data-asset-id="${escapeHtml(block.assetId || block.asset?._ref || "")}"
            data-asset-type="image"
          >
          <figcaption>${escapeHtml(block.caption || "")}</figcaption>
        </figure>
      `);
    }

    if (block._type === "file" && (block.asset?.url || block.assetId)) {
      html.push(`
        <p>
          <a
            class="file-link"
            href="${escapeHtml(block.asset?.url || "#")}"
            data-asset-id="${escapeHtml(block.assetId || block.asset?._ref || "")}"
            data-asset-type="file"
          >
            ${escapeHtml(block.title || block.asset?.originalFilename || "Download file")}
          </a>
        </p>
      `);
    }
  });

  flushList();
  return html.join("");
}

function editorHtmlFromPlainText(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function resetEditor(keepKey = true) {
  const key = masterKey();
  adminForm.reset();
  adminForm.elements.post_id.value = "";
  if (keepKey) adminForm.elements.master_key.value = key;
  selectedPost = null;
  bodyEditor.innerHTML = "";
  featuredPreview.innerHTML = "";
  inlinePreview.innerHTML = "";
  updateGeneratedExcerpt();
  updateScheduleFields();
  setStatus("Ready for a new blog post.");
}

function renderPostList() {
  if (!posts.length) {
    postList.innerHTML = "<p>No Sanity blog posts found yet.</p>";
    return;
  }

  postList.innerHTML = posts
    .map((post) => `
      <button class="admin-post-item" type="button" data-id="${escapeHtml(post._id)}">
        <span>${escapeHtml(post.category || "Article")}</span>
        <strong>${escapeHtml(post.title || "Untitled")}</strong>
        <small>${escapeHtml(formatDate(post.publishedAt))}${post._id?.startsWith("drafts.") ? " | Draft" : isFutureDate(post.publishedAt) ? " | Scheduled" : ""}</small>
      </button>
    `)
    .join("");

  postList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const post = posts.find((item) => item._id === button.dataset.id);
      loadPostIntoEditor(post);
    });
  });
}

function loadPostIntoEditor(post) {
  if (!post) return;
  selectedPost = post;

  adminForm.elements.post_id.value = post._id || "";
  adminForm.elements.title.value = post.title || "";
  adminForm.elements.category.value = post.category || "";
  bodyEditor.innerHTML = editorHtmlFromBlocks(post.body) || editorHtmlFromPlainText(post.bodyText);
  adminForm.elements.mode.value = post._id?.startsWith("drafts.") ? "draft" : isFutureDate(post.publishedAt) ? "scheduled" : "published";
  adminForm.elements.publish_date.value = isFutureDate(post.publishedAt) ? formatDateInput(post.publishedAt) : "";
  adminForm.elements.publish_time.value = isFutureDate(post.publishedAt) ? formatTimeInput(post.publishedAt) : "";
  updateGeneratedExcerpt();
  updateScheduleFields();

  renderMediaPreview(
    featuredPreview,
    post.mainImageAssetId
      ? [{
          assetType: "image",
          assetId: post.mainImageAssetId,
          title: post.mainImage?.alt || "Featured image",
          url: post.mainImage?.asset?.url || "",
        }]
      : []
  );
  setStatus(`Editing ${post.title || "selected post"}.`);
}

async function loadPosts() {
  if (!masterKey()) {
    setStatus("Enter the master key first.");
    return;
  }

  postList.innerHTML = "<p>Loading posts.</p>";
  const response = await fetch("/api/admin-blog", {
    headers: { "x-blog-master-key": masterKey() },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Unable to load posts.");
  }

  posts = data.posts || [];
  renderPostList();
  setStatus("Posts loaded.");
}

async function uploadFile(file) {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch("/api/admin-media", {
    method: "POST",
    headers: { "x-blog-master-key": masterKey() },
    body,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Unable to upload ${file.name}.`);
  }

  return data;
}

async function uploadSelectedMedia(formData) {
  const featuredFile = formData.get("featured_image");
  let mainImage = null;

  if (featuredFile && featuredFile.size > 0) {
    setStatus(`Uploading featured image: ${featuredFile.name}`);
    const uploaded = await uploadFile(featuredFile);
    if (uploaded.assetType !== "image") {
      throw new Error("Featured media must be an image.");
    }
    mainImage = {
      assetType: "image",
      assetId: uploaded.assetId,
      alt: String(formData.get("title") || ""),
      caption: "",
      url: uploaded.url,
    };
  } else if (selectedPost?.mainImageAssetId) {
    mainImage = {
      assetType: "image",
      assetId: selectedPost.mainImageAssetId,
      alt: selectedPost.mainImage?.alt || "",
      caption: selectedPost.mainImage?.caption || "",
    };
  }

  return { mainImage };
}

async function insertInlineImages(event) {
  const files = [...(event.currentTarget.files || [])].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  if (!masterKey()) {
    setStatus("Enter the master key before inserting inline pictures.");
    event.currentTarget.value = "";
    return;
  }

  try {
    for (const file of files) {
      setStatus(`Uploading inline picture: ${file.name}`);
      const uploaded = await uploadFile(file);
      if (uploaded.assetType !== "image") {
        throw new Error(`${file.name} is not an image.`);
      }
      insertEditorNode(createImageFigure({
        assetId: uploaded.assetId,
        alt: file.name,
        caption: "",
        url: uploaded.url,
      }));
    }
    updateGeneratedExcerpt();
    setStatus("Inline picture inserted.");
  } catch (error) {
    setStatus(error.message);
  } finally {
    event.currentTarget.value = "";
  }
}

function applyEditorCommand(button) {
  rememberEditorSelection();
  const command = button.dataset.command;
  const value = button.dataset.value;

  if (command === "createLink") {
    const href = window.prompt("Paste the link URL");
    if (!href) return;
    restoreEditorSelection();
    document.execCommand(command, false, href);
  } else if (command === "formatBlock") {
    restoreEditorSelection();
    document.execCommand(command, false, value);
  } else {
    restoreEditorSelection();
    document.execCommand(command, false, null);
  }

  bodyEditor.focus();
  updateGeneratedExcerpt();
}

async function savePost(event) {
  event.preventDefault();

  const formData = new FormData(adminForm);
  if (!masterKey()) {
    setStatus("Master key is required.");
    return;
  }

  const title = String(formData.get("title") || "").trim();
  const bodyBlocks = blocksFromEditor();
  const bodyText = plainTextFromBlocks(bodyBlocks);
  if (!title || !bodyBlocks.length || !bodyText) {
    setStatus("Title and body are required.");
    return;
  }

  try {
    setStatus("Preparing post.");
    const { mainImage } = await uploadSelectedMedia(formData);
    const mode = String(formData.get("mode") || "draft");
    const payload = {
      id: String(formData.get("post_id") || ""),
      title,
      slug: slugify(title),
      category: String(formData.get("category") || "").trim(),
      excerpt: generatedExcerpt(),
      body: bodyText,
      bodyBlocks,
      mode,
      publishedAt: mode === "scheduled" ? scheduledIsoFromForm(formData) : undefined,
      mainImage,
    };

    setStatus("Saving blog post.");
    const response = await fetch("/api/admin-blog", {
      method: payload.id ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-blog-master-key": masterKey(),
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Unable to save this blog post.");
    }

    setStatus(`Saved ${data.mode} post: ${data.slug}.`);
    await loadPosts();
  } catch (error) {
    setStatus(error.message);
  }
}

async function deleteSelectedPost() {
  const id = adminForm.elements.post_id.value;
  if (!id) {
    setStatus("Select a post before deleting.");
    return;
  }

  const confirmed = window.confirm("Delete this blog post from Sanity?");
  if (!confirmed) return;

  try {
    setStatus("Deleting blog post.");
    const response = await fetch("/api/admin-blog", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-blog-master-key": masterKey(),
      },
      body: JSON.stringify({ id }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Unable to delete this blog post.");
    }

    resetEditor();
    await loadPosts();
    setStatus("Blog post deleted.");
  } catch (error) {
    setStatus(error.message);
  }
}

adminForm?.addEventListener("submit", savePost);
adminForm?.elements.mode.addEventListener("change", updateScheduleFields);
bodyEditor?.addEventListener("input", updateGeneratedExcerpt);
bodyEditor?.addEventListener("keyup", rememberEditorSelection);
bodyEditor?.addEventListener("mouseup", rememberEditorSelection);
bodyEditor?.addEventListener("focus", rememberEditorSelection);
inlineImageInput?.addEventListener("change", insertInlineImages);
document.querySelectorAll(".rich-editor-toolbar button").forEach((button) => {
  button.addEventListener("click", () => applyEditorCommand(button));
});
loadPostsButton?.addEventListener("click", () => loadPosts().catch((error) => setStatus(error.message)));
newPostButton?.addEventListener("click", () => resetEditor());
deletePostButton?.addEventListener("click", deleteSelectedPost);
updateGeneratedExcerpt();
updateScheduleFields();
