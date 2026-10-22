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
    return { firstName: parts[0] || "", lastName: "" };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

// Attio expects international format. US numbers typed as 10 digits get +1.
function toE164(phone) {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function intakeNoteBody(payload) {
  return [
    `Submitted: ${payload.submittedAt}`,
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Mobile phone: ${payload.phone || "Not provided"}`,
    `I am: ${payload.role || "Not provided"}`,
    `Primary interest: ${payload.pillar || "Not provided"}`,
    `Preferred contact method: ${payload.preferredChannel || "Not provided"}`,
    `Email updates opt-in: ${payload.emailOptIn ? "Yes" : "No"}`,
    `Text message opt-in: ${payload.smsOptIn ? "Yes" : "No"}`,
    `Source page: ${payload.pageUrl || "Not provided"}`,
    "",
    "Consent text shown at submission:",
    payload.consentText || "Not provided",
    "",
    "What kind of support would help most:",
    payload.message,
  ].join("\n");
}

const ATTIO_API = "https://api.attio.com/v2";
const INTAKE_LIST = process.env.ATTIO_INTAKE_LIST || "intake_pipeline";

async function attioRequest(path, { method = "GET", body } = {}) {
  const token = process.env.ATTIO_API_KEY;
  if (!token) {
    const error = new Error("Missing ATTIO_API_KEY");
    error.statusCode = 500;
    throw error;
  }

  const result = await fetch(`${ATTIO_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await result.json().catch(() => ({}));

  if (!result.ok) {
    const error = new Error(data.message || `Attio request failed (${result.status})`);
    error.statusCode = result.status;
    error.details = data;
    throw error;
  }

  return data;
}

// Create or update the person, matched by email so repeat visitors don't
// become duplicates. If Attio rejects the phone number, save the person
// without it; the number is still in the intake note.
async function upsertPerson({ name, email, phone }) {
  const { firstName, lastName } = splitName(name);
  const values = {
    email_addresses: [{ email_address: email }],
    name: [{ first_name: firstName, last_name: lastName, full_name: name }],
  };
  const e164 = toE164(phone);
  const path = "/objects/people/records?matching_attribute=email_addresses";

  if (e164) {
    try {
      const withPhone = await attioRequest(path, {
        method: "PUT",
        body: { data: { values: { ...values, phone_numbers: [{ original_phone_number: e164 }] } } },
      });
      return withPhone.data;
    } catch (error) {
      if (error.statusCode !== 400) throw error;
      console.error("[contact] Attio rejected phone number; saving without it", JSON.stringify(error.details));
    }
  }

  const withoutPhone = await attioRequest(path, { method: "PUT", body: { data: { values } } });
  return withoutPhone.data;
}

// Non-essential steps: if one fails, the person and note are already saved,
// so log it and carry on rather than telling the visitor it failed.
async function bestEffort(label, task) {
  try {
    await task();
  } catch (error) {
    console.error(`[contact] ${label} failed`, error.message, error.details ? JSON.stringify(error.details) : "");
  }
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

    const submittedAt = new Date().toISOString();
    const intake = {
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
    };

    const person = await upsertPerson(intake);
    const personId = person.id.record_id;

    await attioRequest("/notes", {
      method: "POST",
      body: {
        data: {
          parent_object: "people",
          parent_record_id: personId,
          title: `Website intake – ${submittedAt.slice(0, 10)}`,
          format: "plaintext",
          content: intakeNoteBody(intake),
        },
      },
    });

    await bestEffort("Adding to intake list", () =>
      attioRequest(`/lists/${INTAKE_LIST}/entries`, {
        method: "PUT",
        body: { data: { parent_record_id: personId, parent_object: "people", entry_values: {} } },
      }),
    );

    await bestEffort("Creating follow-up task", () =>
      attioRequest("/tasks", {
        method: "POST",
        body: {
          data: {
            content: `Follow up with ${name} (${preferredChannel}) – website intake`,
            format: "plaintext",
            deadline_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            is_completed: false,
            linked_records: [{ target_object: "people", target_record_id: personId }],
            assignees: [],
          },
        },
      }),
    );

    sendJson(response, 200, { ok: true });
  } catch (caught) {
    const error = caught instanceof SyntaxError ? badRequest("The form data could not be read.") : caught;
    const isVisitorError = error.statusCode === 400 && !error.details || error.statusCode === 429;
    if (!isVisitorError) {
      // CRM error details stay in the server logs, never in the browser.
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
