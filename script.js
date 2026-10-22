const form = document.querySelector("#contact-form");
const statusMessage = document.querySelector("#form-status");
const bookReleasePopup = document.querySelector("#book-release-popup");
const bookReleaseCard = bookReleasePopup?.querySelector(".book-release-card");
let bookPopupPreviousFocus = null;
const formLoadedAt = Date.now();

function closeBookReleasePopup() {
  if (!bookReleasePopup || bookReleasePopup.hidden) return;
  bookReleasePopup.hidden = true;
  document.body.classList.remove("book-popup-open");
  bookPopupPreviousFocus?.focus();
}

function openBookReleasePopup() {
  if (!bookReleasePopup) return;
  bookPopupPreviousFocus = document.activeElement;
  bookReleasePopup.hidden = false;
  document.body.classList.add("book-popup-open");
  bookReleaseCard?.focus();
}

bookReleasePopup?.addEventListener("click", (event) => {
  if (event.target.closest("[data-book-popup-close]")) {
    closeBookReleasePopup();
  }
});

bookReleasePopup?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeBookReleasePopup();
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [
    ...bookReleasePopup.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Show the book announcement once per visitor, then again only after 60 days.
const BOOK_POPUP_KEY = "ccusa_book_popup_seen";
const BOOK_POPUP_REPEAT_MS = 60 * 24 * 60 * 60 * 1000;

function bookPopupRecentlySeen() {
  try {
    const seenAt = Number(localStorage.getItem(BOOK_POPUP_KEY));
    return Number.isFinite(seenAt) && seenAt > 0 && Date.now() - seenAt < BOOK_POPUP_REPEAT_MS;
  } catch {
    return false;
  }
}

function rememberBookPopupSeen() {
  try {
    localStorage.setItem(BOOK_POPUP_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode): the popup may show again next visit.
  }
}

window.addEventListener("load", () => {
  if (bookPopupRecentlySeen()) return;
  window.setTimeout(() => {
    openBookReleasePopup();
    rememberBookPopupSeen();
  }, 350);
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const pillar = String(formData.get("pillar") || "").trim();
  const preferredChannel = String(formData.get("preferred_channel") || "").trim();
  const emailOptIn = formData.get("email_opt_in") === "on";
  const smsOptIn = formData.get("sms_opt_in") === "on";
  const message = String(formData.get("message") || "").trim();
  const website = String(formData.get("website") || "");

  if (!name || !email || !phone || !role || !preferredChannel || !message) {
    statusMessage.textContent = "Please complete all required fields before submitting.";
    return;
  }

  const consentText = [
    "I agree to receive email updates from Cancer Coach USA.",
    "I agree to receive text messages from Cancer Coach USA. Message and data rates may apply. Reply STOP to opt out.",
  ].join(" ");

  statusMessage.textContent = "Sending your request to Cancer Coach USA.";

  fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      email,
      phone,
      role,
      pillar,
      preferredChannel,
      emailOptIn,
      smsOptIn,
      message,
      pageUrl: window.location.href,
      consentText,
      website,
      formElapsedMs: Date.now() - formLoadedAt,
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Unable to send your request right now.");
      }
      form.reset();
      statusMessage.textContent = "Thank you. Your request has been received.";
    })
    .catch((error) => {
      statusMessage.textContent = `${error.message} Please email support@cancercoachusa.com if this continues.`;
    });
});
