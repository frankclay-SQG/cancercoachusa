function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const {
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
    } = payload || {};

    if (!name || !email || !message) {
      sendJson(response, 400, { error: "Name, email, and message are required." });
      return;
    }

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

    sendJson(response, 200, {
      ok: true,
      contactId: contact.id,
      updated: Boolean(existing),
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Contact submission failed",
      details: error.details,
    });
  }
};
