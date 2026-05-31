const form = document.querySelector("#contact-form");
const statusMessage = document.querySelector("#form-status");

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

  if (!name || !email || !role || !message) {
    statusMessage.textContent = "Please complete each field before preparing the email.";
    return;
  }

  const consentText = [
    "I agree to receive email updates from Cancer Coach USA.",
    "I agree to receive text messages from Cancer Coach USA. Message and data rates may apply. Reply STOP to opt out.",
  ].join(" ");

  statusMessage.textContent = "Sending your request.";

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
