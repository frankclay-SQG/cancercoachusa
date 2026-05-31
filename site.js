const COOKIE_CONSENT_KEY = "ccusa_cookie_consent";
const CONSTRUCTION_DISMISSED_KEY = "ccusa_under_construction_dismissed";

function readConsent() {
  try {
    return JSON.parse(localStorage.getItem(COOKIE_CONSENT_KEY) || "null");
  } catch {
    return null;
  }
}

function saveConsent(preferences) {
  localStorage.setItem(
    COOKIE_CONSENT_KEY,
    JSON.stringify({
      essential: true,
      analytics: Boolean(preferences.analytics),
      marketing: Boolean(preferences.marketing),
      updatedAt: new Date().toISOString(),
    }),
  );
}

function closeCookieBanner() {
  document.querySelector(".cookie-consent")?.remove();
}

function renderCookieSettingsButton() {
  if (!readConsent() || document.querySelector(".cookie-settings-button")) return;

  const button = document.createElement("button");
  button.className = "cookie-settings-button";
  button.type = "button";
  button.textContent = "Cookie Settings";
  button.addEventListener("click", () => {
    button.remove();
    renderCookieBanner({ force: true, showPreferences: true });
  });
  document.body.append(button);
}

function renderCookieBanner(options = {}) {
  const consent = readConsent();
  if (consent && !options.force) {
    renderCookieSettingsButton();
    return;
  }

  const banner = document.createElement("section");
  banner.className = "cookie-consent";
  banner.setAttribute("aria-label", "Cookie consent");
  banner.innerHTML = `
    <div class="cookie-consent-copy">
      <p class="eyebrow">Privacy choices</p>
      <h2>Cookie Preferences</h2>
      <p>
        Cancer Coach USA uses essential cookies for site function. With your
        permission, we may also use non-essential cookies for analytics and
        communication improvements. You can accept, reject, or customize those
        non-essential cookies.
      </p>
    </div>
    <div class="cookie-consent-actions">
      <button class="button button-primary" type="button" data-cookie-action="accept-all">Accept All</button>
      <button class="button button-secondary" type="button" data-cookie-action="essentials">Essentials Only</button>
      <button class="button button-secondary" type="button" data-cookie-action="manage">Manage Choices</button>
    </div>
    <form class="cookie-preferences" hidden>
      <label class="check-label">
        <input type="checkbox" checked disabled>
        <span>Essential cookies, always active for basic site function.</span>
      </label>
      <label class="check-label">
        <input name="analytics" type="checkbox">
        <span>Analytics cookies to understand page usage.</span>
      </label>
      <label class="check-label">
        <input name="marketing" type="checkbox">
        <span>Communication cookies to improve outreach and campaign relevance.</span>
      </label>
      <button class="button button-primary" type="submit">Save Choices</button>
    </form>
  `;

  document.body.append(banner);

  const preferences = banner.querySelector(".cookie-preferences");
  if (consent) {
    preferences.elements.analytics.checked = Boolean(consent.analytics);
    preferences.elements.marketing.checked = Boolean(consent.marketing);
  }
  if (options.showPreferences) preferences.hidden = false;

  banner.querySelector('[data-cookie-action="accept-all"]').addEventListener("click", () => {
    saveConsent({ analytics: true, marketing: true });
    closeCookieBanner();
    renderCookieSettingsButton();
  });

  banner.querySelector('[data-cookie-action="essentials"]').addEventListener("click", () => {
    saveConsent({ analytics: false, marketing: false });
    closeCookieBanner();
    renderCookieSettingsButton();
  });

  banner.querySelector('[data-cookie-action="manage"]').addEventListener("click", () => {
    preferences.hidden = !preferences.hidden;
  });

  preferences.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    saveConsent({
      analytics: formData.get("analytics") === "on",
      marketing: formData.get("marketing") === "on",
    });
    closeCookieBanner();
    renderCookieSettingsButton();
  });
}

function renderConstructionDialog() {
  const path = window.location.pathname || "";
  if (path.endsWith("blog-admin.html")) return;
  if (localStorage.getItem(CONSTRUCTION_DISMISSED_KEY)) return;

  const dialog = document.createElement("dialog");
  dialog.className = "construction-dialog";
  dialog.setAttribute("aria-labelledby", "construction-title");
  dialog.innerHTML = `
    <div class="construction-dialog-body">
      <p class="eyebrow">Site notice</p>
      <h2 id="construction-title">Under Construction</h2>
      <p>
        Cancer Coach USA is still being refined for survivors in remission and
        families navigating life after active treatment. Content, blog posts,
        scheduling, and resource links may change as the site is prepared for launch.
      </p>
      <button class="button button-primary" type="button">Continue to Site</button>
    </div>
  `;

  document.body.append(dialog);

  const dismiss = () => {
    localStorage.setItem(CONSTRUCTION_DISMISSED_KEY, "true");
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  dialog.querySelector("button").addEventListener("click", dismiss);
  dialog.addEventListener("cancel", dismiss);

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderConstructionDialog();
  renderCookieBanner();
});
