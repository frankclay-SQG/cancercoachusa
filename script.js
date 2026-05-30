const form = document.querySelector("#contact-form");
const statusMessage = document.querySelector("#form-status");

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!name || !email || !role || !message) {
    statusMessage.textContent = "Please complete each field before preparing the email.";
    return;
  }

  const subject = encodeURIComponent(`Cancer Coach USA guidance request from ${name}`);
  const body = encodeURIComponent(
    [
      `Name: ${name}`,
      `Email: ${email}`,
      `Role: ${role}`,
      "",
      "Support requested:",
      message,
    ].join("\n")
  );

  statusMessage.textContent = "Opening your email app with the message ready to send.";
  window.location.href = `mailto:hello@cancercoachusa.org?subject=${subject}&body=${body}`;
});
