const meetupForm = document.querySelector("#meetup-form");
const meetupStatus = document.querySelector("#meetup-form-status");
const meetupLoadedAt = Date.now();

meetupForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(meetupForm);
  const value = (key) => String(formData.get(key) || "").trim();
  const firstName = value("first_name");
  const lastName = value("last_name");
  const email = value("email");
  const phone = value("phone");
  const role = value("role");
  const attendance = value("attendance");
  const preferredChannel = value("preferred_channel");
  const message = value("message");

  if (!firstName || !lastName || !email || !role || !attendance || !preferredChannel) {
    meetupStatus.textContent = "Please complete all required fields before registering.";
    return;
  }

  const wantsSms = formData.get("sms_opt_in") === "on" || preferredChannel.includes("SMS");
  if (wantsSms && phone.replace(/\D/g, "").length < 10) {
    meetupStatus.textContent = "Please enter your mobile phone number so we can text you.";
    return;
  }

  const consentText = [
    "I agree to receive email updates from Cancer Coach USA.",
    "I agree to receive text messages from Cancer Coach USA about my requests, appointments, and meetup updates. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of any purchase. See our SMS Terms (cancercoachusa.com/sms-terms.html) and Privacy Policy (cancercoachusa.com/privacy.html).",
  ].join(" ");

  const button = meetupForm.querySelector("button[type=submit]");
  button.disabled = true;
  meetupStatus.textContent = "Sending your registration.";

  fetch("/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      formType: "meetup",
      firstName,
      lastName,
      email,
      phone,
      role,
      attendance,
      preferredChannel,
      message,
      emailOptIn: formData.get("email_opt_in") === "on",
      smsOptIn: formData.get("sms_opt_in") === "on",
      pageUrl: window.location.href,
      consentText,
      website: String(formData.get("website") || ""),
      formElapsedMs: Date.now() - meetupLoadedAt,
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Unable to send your registration right now.");
      }
      meetupForm.reset();
      meetupStatus.textContent = "You're registered. We'll be in touch with the next gathering details soon.";
    })
    .catch((error) => {
      meetupStatus.textContent = `${error.message} Please email support@cancercoachusa.com if this continues.`;
    })
    .finally(() => {
      button.disabled = false;
    });
});
