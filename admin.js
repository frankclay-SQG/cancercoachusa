const ADMIN_SESSION_KEY = "ccusa_admin_verified";
const ADMIN_SESSION_DURATION = 8 * 60 * 60 * 1000;

const adminLoginForm = document.querySelector("#admin-login-form");
const adminLoginStatus = document.querySelector("#admin-login-status");
const adminToolsPanel = document.querySelector("#admin-tools-panel");
const adminLogoutButton = document.querySelector("#admin-logout-button");

function readAdminSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || "null");
    if (!session?.verifiedAt) return null;

    const age = Date.now() - new Date(session.verifiedAt).getTime();
    if (age > ADMIN_SESSION_DURATION) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function saveAdminSession() {
  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      verified: true,
      verifiedAt: new Date().toISOString(),
    }),
  );
}

function nextDestination() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (next === "analytics") return "analytics.html";
  if (next === "blog") return "blog-admin.html";
  return "";
}

function showAdminTools(message = "Signed in.") {
  adminLoginForm.hidden = true;
  adminToolsPanel.hidden = false;
  adminLoginStatus.textContent = message;
}

function showLogin(message = "") {
  adminLoginForm.hidden = false;
  adminToolsPanel.hidden = true;
  adminLoginStatus.textContent = message;
}

async function verifyMasterKey(masterKey) {
  const response = await fetch("/api/admin-blog", {
    headers: { "x-blog-master-key": masterKey },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Unable to verify the master key.");
  }

  return data;
}

adminLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(adminLoginForm);
  const masterKey = String(formData.get("master_key") || "").trim();
  const requestedDestination = event.submitter?.value === "analytics" ? "analytics.html" : "";

  if (!masterKey) {
    adminLoginStatus.textContent = "Enter the master key.";
    return;
  }

  adminLoginStatus.textContent = "Verifying master key.";

  try {
    await verifyMasterKey(masterKey);
    saveAdminSession();

    const destination = nextDestination() || requestedDestination;
    if (destination) {
      window.location.assign(destination);
      return;
    }

    showAdminTools("Signed in. Choose a private tool.");
  } catch (error) {
    showLogin(`${error.message} Try again.`);
  }
});

adminLogoutButton?.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  adminLoginForm.reset();
  showLogin("Signed out.");
});

if (readAdminSession()) {
  const destination = nextDestination();
  if (destination) {
    window.location.assign(destination);
  } else {
    showAdminTools("Signed in. Choose a private tool.");
  }
}
