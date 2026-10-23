const { validateMasterKey } = require("./lib/security");
const { handleError, sendJson } = require("./lib/sanity");

// Confirms the analytics master key. Has no access to Sanity content;
// blog publishing now happens in the hosted Sanity Studio with Google sign-in.
module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    validateMasterKey(request);
    response.setHeader("Cache-Control", "no-store");
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: true }));
  } catch (error) {
    handleError(response, error);
  }
};
