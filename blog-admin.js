const adminForm = document.querySelector("#blog-admin-form");
const adminStatus = document.querySelector("#blog-admin-status");
const postList = document.querySelector("#admin-post-list");
const loadPostsButton = document.querySelector("#load-posts-button");
const newPostButton = document.querySelector("#new-post-button");
const deletePostButton = document.querySelector("#delete-post-button");
const featuredPreview = document.querySelector("#featured-image-preview");
const inlinePreview = document.querySelector("#inline-media-preview");
const scheduleFields = document.querySelector("#schedule-publish-fields");

let posts = [];
let selectedPost = null;
let preservedInlineMedia = [];

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
    .filter((block) => ["image", "file"].includes(block?._type) && block.assetId)
    .map((block) => ({
      assetType: block._type,
      assetId: block.assetId,
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

function resetEditor(keepKey = true) {
  const key = masterKey();
  adminForm.reset();
  adminForm.elements.post_id.value = "";
  if (keepKey) adminForm.elements.master_key.value = key;
  selectedPost = null;
  preservedInlineMedia = [];
  featuredPreview.innerHTML = "";
  inlinePreview.innerHTML = "";
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
  preservedInlineMedia = mediaFromBlocks(post.body);

  adminForm.elements.post_id.value = post._id || "";
  adminForm.elements.title.value = post.title || "";
  adminForm.elements.slug.value = post.slug || "";
  adminForm.elements.category.value = post.category || "";
  adminForm.elements.excerpt.value = post.excerpt || "";
  adminForm.elements.body.value = post.bodyText || "";
  adminForm.elements.mode.value = post._id?.startsWith("drafts.") ? "draft" : isFutureDate(post.publishedAt) ? "scheduled" : "published";
  adminForm.elements.publish_date.value = isFutureDate(post.publishedAt) ? formatDateInput(post.publishedAt) : "";
  adminForm.elements.publish_time.value = isFutureDate(post.publishedAt) ? formatTimeInput(post.publishedAt) : "";
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
  renderMediaPreview(inlinePreview, preservedInlineMedia);
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
  const inlineFiles = formData.getAll("inline_media").filter((file) => file && file.size > 0);
  let mainImage = null;
  const inlineMedia = [...preservedInlineMedia];

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

  for (const file of inlineFiles) {
    setStatus(`Uploading media: ${file.name}`);
    const uploaded = await uploadFile(file);
    inlineMedia.push({
      assetType: uploaded.assetType,
      assetId: uploaded.assetId,
      title: file.name,
      filename: file.name,
      alt: file.name,
      caption: "",
      url: uploaded.url,
    });
  }

  return { mainImage, inlineMedia };
}

async function savePost(event) {
  event.preventDefault();

  const formData = new FormData(adminForm);
  if (!masterKey()) {
    setStatus("Master key is required.");
    return;
  }

  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!title || !body) {
    setStatus("Title and body are required.");
    return;
  }

  try {
    setStatus("Preparing post.");
    const { mainImage, inlineMedia } = await uploadSelectedMedia(formData);
    const slug = String(formData.get("slug") || "").trim() || slugify(title);
    const mode = String(formData.get("mode") || "draft");
    const payload = {
      id: String(formData.get("post_id") || ""),
      title,
      slug,
      category: String(formData.get("category") || "").trim(),
      excerpt: String(formData.get("excerpt") || "").trim(),
      body,
      mode,
      publishedAt: mode === "scheduled" ? scheduledIsoFromForm(formData) : undefined,
      mainImage,
      media: inlineMedia,
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
loadPostsButton?.addEventListener("click", () => loadPosts().catch((error) => setStatus(error.message)));
newPostButton?.addEventListener("click", () => resetEditor());
deletePostButton?.addEventListener("click", deleteSelectedPost);
updateScheduleFields();
