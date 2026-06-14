const COOKIE_CONSENT_KEY = "ccusa_cookie_consent";

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
      <button type="button" data-cookie-action="accept-all">Accept All</button>
      <button type="button" data-cookie-action="essentials">Essentials Only</button>
      <button type="button" data-cookie-action="manage">Manage Choices</button>
    </div>
    <form class="cookie-preferences" hidden>
      <label><input type="checkbox" checked disabled> Essential cookies, always active for basic site function.</label>
      <label><input name="analytics" type="checkbox"> Analytics cookies to understand page usage.</label>
      <label><input name="marketing" type="checkbox"> Communication cookies to improve outreach and campaign relevance.</label>
      <button type="submit">Save Choices</button>
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

document.addEventListener("DOMContentLoaded", () => {
  renderCookieBanner();
});
