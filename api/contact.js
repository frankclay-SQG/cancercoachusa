const { clientIp, rateLimit } = require("./lib/security");

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { name: 120, email: 254, phone: 32, role: 80, pillar: 80, preferredChannel: 40, message: 4000 };

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstname: parts[0] || "", lastname: "" };
  }
  return {
    firstname: parts.slice(0, -1).join(" "),
    lastname: parts.at(-1),
  };
}

function addOptional(properties, envKey, value) {
  const propertyName = process.env[envKey];
  if (propertyName && value !== undefined && value !== null && value !== "") {
    properties[propertyName] = value;
  }
}

function intakeNoteBody(payload) {
  const lines = [
    "Cancer Coach USA website intake",
    "",
    `Submitted: ${payload.submittedAt}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Mobile phone: ${payload.phone || "Not provided"}`,
    `Role: ${payload.role || "Not provided"}`,
    `Primary interest: ${payload.pillar || "Not provided"}`,
    `Preferred contact method: ${payload.preferredChannel || "Not provided"}`,
    `Email opt-in: ${payload.emailOptIn ? "Yes" : "No"}`,
    `SMS opt-in: ${payload.smsOptIn ? "Yes" : "No"}`,
    `Source page: ${payload.pageUrl || "Not provided"}`,
    "",
    "Consent text:",
    payload.consentText || "Not provided",
    "",
    "Requested support:",
    payload.message,
  ];

  return lines.join("\n");
}

async function hubspotRequest(path, options = {}) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) {
    const error = new Error("Missing HUBSPOT_PRIVATE_APP_TOKEN");
    error.statusCode = 500;
    throw error;
  }

  const result = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await result.json().catch(() => ({}));

  if (!result.ok) {
    const error = new Error(body.message || "HubSpot request failed");
    error.statusCode = result.status;
    error.details = body;
    throw error;
  }

  return body;
}

async function findContactByEmail(email) {
  const body = await hubspotRequest("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: email,
            },
          ],
        },
      ],
      properties: ["email"],
      limit: 1,
    }),
  });

  return body.results?.[0];
}

async function createIntakeNote(contactId, payload) {
  const note = await hubspotRequest("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_timestamp: payload.submittedAt,
        hs_note_body: intakeNoteBody(payload),
      },
    }),
  });

  await hubspotRequest(`/crm/v4/objects/notes/${note.id}/associations/default/contacts/${contactId}`, {
    method: "PUT",
  });

  return note;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};

    // Spam traps: a hidden field real visitors never fill in, and a minimum
    // time on the page. Bots get a normal-looking success so they move on.
    const elapsedMs = Number(payload.formElapsedMs);
    if (payload.website || (Number.isFinite(elapsedMs) && elapsedMs < 2500)) {
      sendJson(response, 200, { ok: true });
      return;
    }

    const name = clean(payload.name, LIMITS.name);
    const email = clean(payload.email, LIMITS.email).toLowerCase();
    const phone = clean(payload.phone, LIMITS.phone);
    const role = clean(payload.role, LIMITS.role);
    const pillar = clean(payload.pillar, LIMITS.pillar);
    const preferredChannel = clean(payload.preferredChannel, LIMITS.preferredChannel);
    const message = clean(payload.message, LIMITS.message);
    const emailOptIn = payload.emailOptIn === true;
    const smsOptIn = payload.smsOptIn === true;
    const pageUrl = clean(payload.pageUrl, 500);
    const consentText = clean(payload.consentText, 1000);

    if (!name || !email || !phone || !preferredChannel || !message) {
      throw badRequest("Name, email, mobile phone, preferred contact method, and message are required.");
    }

    if (!EMAIL_PATTERN.test(email)) {
      throw badRequest("Please enter a valid email address.");
    }

    if (phone.replace(/\D/g, "").length < 10) {
      throw badRequest("Please enter a valid mobile phone number.");
    }

    // Count only well-formed submissions, so visitors fixing a typo aren't blocked.
    rateLimit(`contact:${clientIp(request)}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
      message: "We've received several requests from you already. Please try again in an hour or email support@cancercoachusa.com.",
    });

    const { firstname, lastname } = splitName(name);
    const submittedAt = new Date().toISOString();
    const properties = {
      email,
      firstname,
      lastname,
    };

    if (phone) {
      properties.phone = phone;
      properties.mobilephone = phone;
    }

    addOptional(properties, "HUBSPOT_CONTACT_ROLE_PROPERTY", role);
    addOptional(properties, "HUBSPOT_CONTACT_PILLAR_PROPERTY", pillar);
    addOptional(properties, "HUBSPOT_CONTACT_CHANNEL_PROPERTY", preferredChannel);
    addOptional(properties, "HUBSPOT_CONTACT_MESSAGE_PROPERTY", message);
    addOptional(properties, "HUBSPOT_EMAIL_OPT_IN_PROPERTY", emailOptIn ? "true" : "false");
    addOptional(properties, "HUBSPOT_SMS_OPT_IN_PROPERTY", smsOptIn ? "true" : "false");
    addOptional(properties, "HUBSPOT_CONSENT_SOURCE_PROPERTY", "Cancer Coach USA website");
    addOptional(properties, "HUBSPOT_CONSENT_TIMESTAMP_PROPERTY", submittedAt);
    addOptional(properties, "HUBSPOT_SOURCE_PAGE_PROPERTY", pageUrl);
    addOptional(properties, "HUBSPOT_CONSENT_TEXT_PROPERTY", consentText);

    const existing = await findContactByEmail(email);
    const contact = existing
      ? await hubspotRequest(`/crm/v3/objects/contacts/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ properties }),
        })
      : await hubspotRequest("/crm/v3/objects/contacts", {
          method: "POST",
          body: JSON.stringify({ properties }),
        });

    const note = await createIntakeNote(contact.id, {
      name,
      email,
      phone,
      role,
      pillar,
      preferredChannel,
      emailOptIn,
      smsOptIn,
      message,
      pageUrl,
      consentText,
      submittedAt,
    });

    sendJson(response, 200, {
      ok: true,
      contactId: contact.id,
      noteId: note.id,
      updated: Boolean(existing),
    });
  } catch (caught) {
    const error = caught instanceof SyntaxError ? badRequest("The form data could not be read.") : caught;
    const isVisitorError = error.statusCode === 400 || error.statusCode === 429;
    if (!isVisitorError) {
      // HubSpot details stay in the server logs, never in the browser.
      console.error("[contact]", error.message, error.details ? JSON.stringify(error.details) : "");
    }
    if (error.retryAfterSeconds) {
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    sendJson(response, isVisitorError ? error.statusCode : 502, {
      error: isVisitorError ? error.message : "We could not send your request right now.",
    });
  }
};
