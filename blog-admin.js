const adminForm = document.querySelector("#blog-admin-form");
const adminStatus = document.querySelector("#blog-admin-status");

adminForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(adminForm);
  const masterKey = String(formData.get("master_key") || "");
  const payload = {
    title: String(formData.get("title") || "").trim(),
    slug: String(formData.get("slug") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    excerpt: String(formData.get("excerpt") || "").trim(),
    body: String(formData.get("body") || "").trim(),
    mode: String(formData.get("mode") || "published"),
  };

  if (!masterKey || !payload.title || !payload.body) {
    adminStatus.textContent = "Master key, title, and body are required.";
    return;
  }

  adminStatus.textContent = "Saving blog post.";

  fetch("/api/admin-blog", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-blog-master-key": masterKey,
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Unable to save this blog post.");
      }
      adminForm.reset();
      adminStatus.textContent = `Saved ${data.mode} post: ${data.slug}.`;
    })
    .catch((error) => {
      adminStatus.textContent = error.message;
    });
});
