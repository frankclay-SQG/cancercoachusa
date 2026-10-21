const ADMIN_SESSION_KEY = "ccusa_admin_verified";
const ADMIN_SESSION_DURATION = 8 * 60 * 60 * 1000;

function hasAdminSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || "null");
    if (!session?.verifiedAt) return false;

    const age = Date.now() - new Date(session.verifiedAt).getTime();
    if (age > ADMIN_SESSION_DURATION) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

if (window.location.protocol !== "file:" && !hasAdminSession()) {
  window.location.replace("admin.html?next=analytics");
}

const analyticsRange = document.querySelector("#analytics-range");
const analyticsSegment = document.querySelector("#analytics-segment");
const kpiGrid = document.querySelector("#kpi-grid");
const sourceChart = document.querySelector("#source-chart");
const sourceTotal = document.querySelector("#source-total");
const intentList = document.querySelector("#intent-list");
const knownVisitorRate = document.querySelector("#known-visitor-rate");
const contentPerformance = document.querySelector("#content-performance");
const engagementRate = document.querySelector("#engagement-rate");
const visitorTableBody = document.querySelector("#visitor-table-body");
const reportSummary = document.querySelector("#report-summary");
const exportButton = document.querySelector("#analytics-export");
const pdfExportButton = document.querySelector("#analytics-pdf-export");
const copySummaryButton = document.querySelector("#copy-summary");

const reportNow = new Date();
const sourceLabel = document.querySelector("#analytics-source-label");
const updatedLabel = document.querySelector("#analytics-updated-label");

// Real visit data must be supplied by a connected analytics source as
// window.CCUSA_ANALYTICS_DATA. There is intentionally no sample fallback, so
// the dashboard never presents invented visitors as real traffic.
const hasConnectedData = Array.isArray(window.CCUSA_ANALYTICS_DATA);
const analyticsData = hasConnectedData ? window.CCUSA_ANALYTICS_DATA : [];

if (sourceLabel) {
  sourceLabel.textContent = hasConnectedData ? "Connected analytics source" : "No analytics source connected";
}
if (updatedLabel) {
  updatedLabel.textContent = hasConnectedData
    ? `Updated ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(reportNow)}`
    : "No data yet";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function daysBetween(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function filteredVisits() {
  const days = Number(analyticsRange.value || 30);
  const segment = analyticsSegment.value;

  return analyticsData
    .filter((visit) => {
      const visitDate = new Date(visit.date);
      const withinRange = daysBetween(visitDate, reportNow) <= days;
      const inSegment = segment === "all" || visit.audience === segment;
      return withinRange && inSegment;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function countBy(visits, getter) {
  return visits.reduce((counts, visit) => {
    const key = getter(visit);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function topEntries(map, limit = 6) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function renderKpis(visits) {
  const totalVisits = visits.length;
  const knownVisitors = visits.filter((visit) => visit.consented).length;
  const guidanceRequests = visits.filter((visit) => visit.outcome.includes("guidance request")).length;
  const engagedVisits = visits.filter((visit) => visit.duration >= 180 || visit.pages.length >= 3).length;
  const avgDuration = totalVisits
    ? visits.reduce((sum, visit) => sum + visit.duration, 0) / totalVisits
    : 0;
  const returnRate = totalVisits
    ? (visits.filter((visit) => visit.returning).length / totalVisits) * 100
    : 0;

  const kpis = [
    {
      label: "Visitors",
      value: formatNumber(totalVisits),
      detail: `${formatNumber(knownVisitors)} known or consented visitors`,
    },
    {
      label: "Guidance Requests",
      value: formatNumber(guidanceRequests),
      detail: `${formatPercent((guidanceRequests / totalVisits) * 100)} visit-to-request rate`,
    },
    {
      label: "Engaged Sessions",
      value: formatPercent((engagedVisits / totalVisits) * 100),
      detail: "3+ minutes or 3+ pages viewed",
    },
    {
      label: "Avg. Time On Site",
      value: formatDuration(avgDuration),
      detail: `${formatPercent(returnRate)} returning visitor rate`,
    },
  ];

  kpiGrid.innerHTML = kpis
    .map((kpi) => `
      <article class="kpi-card">
        <span>${escapeHtml(kpi.label)}</span>
        <strong>${escapeHtml(kpi.value)}</strong>
        <p>${escapeHtml(kpi.detail)}</p>
      </article>
    `)
    .join("");
}

function renderSources(visits) {
  const entries = topEntries(countBy(visits, (visit) => visit.source));
  const max = Math.max(...entries.map((entry) => entry[1]), 1);

  sourceTotal.textContent = `${formatNumber(visits.length)} visits`;
  sourceChart.innerHTML = entries
    .map(([source, count]) => `
      <div class="bar-row">
        <span>${escapeHtml(source)}</span>
        <div class="bar-track" aria-hidden="true">
          <span style="width: ${(count / max) * 100}%"></span>
        </div>
        <strong>${formatNumber(count)}</strong>
      </div>
    `)
    .join("");
}

function renderIntent(visits) {
  const entries = topEntries(countBy(visits, (visit) => visit.audience));
  const total = Math.max(visits.length, 1);
  const known = visits.filter((visit) => visit.consented).length;

  knownVisitorRate.textContent = `${formatPercent((known / total) * 100)} known`;
  intentList.innerHTML = entries
    .map(([audience, count]) => `
      <article>
        <span>${escapeHtml(audience)}</span>
        <strong>${formatPercent((count / total) * 100)}</strong>
        <small>${formatNumber(count)} visits</small>
      </article>
    `)
    .join("");
}

function renderContent(visits) {
  const pageCounts = countBy(
    visits.flatMap((visit) => visit.pages.map((page) => ({ ...visit, page }))),
    (item) => item.page,
  );
  const actionCounts = countBy(
    visits.flatMap((visit) => visit.actions.map((action) => ({ ...visit, action }))),
    (item) => item.action,
  );
  const engaged = visits.filter((visit) => visit.duration >= 180 || visit.pages.length >= 3).length;
  const total = Math.max(visits.length, 1);

  engagementRate.textContent = `${formatPercent((engaged / total) * 100)} engaged`;
  contentPerformance.innerHTML = `
    <div>
      <h4>Top pages</h4>
      ${topEntries(pageCounts, 5).map(([page, count]) => `<p><span>${escapeHtml(page)}</span><strong>${formatNumber(count)}</strong></p>`).join("")}
    </div>
    <div>
      <h4>Top actions</h4>
      ${topEntries(actionCounts, 5).map(([action, count]) => `<p><span>${escapeHtml(action)}</span><strong>${formatNumber(count)}</strong></p>`).join("")}
    </div>
  `;
}

function renderVisitors(visits) {
  if (!visits.length) {
    visitorTableBody.innerHTML = `<tr><td colspan="7">${
      hasConnectedData
        ? "No visits in the selected period."
        : "No analytics source is connected yet, so there are no visits to show."
    }</td></tr>`;
    return;
  }

  visitorTableBody.innerHTML = visits
    .map((visit) => {
      const visitorName = visit.consented ? visit.name : "Anonymous visitor";
      const pageList = visit.pages.join(" -> ");
      const keyAction = visit.actions.at(-1) || "Page view";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(visitorName)}</strong>
            <span>${escapeHtml(visit.location)}</span>
          </td>
          <td>${escapeHtml(visit.audience)}</td>
          <td>${escapeHtml(visit.source)}</td>
          <td>${escapeHtml(pageList)}</td>
          <td>${escapeHtml(keyAction)}</td>
          <td>${escapeHtml(visit.outcome)}</td>
          <td>${escapeHtml(formatDate(visit.date))}</td>
        </tr>
      `;
    })
    .join("");
}

function summaryLines(visits) {
  const total = visits.length;
  if (!total) {
    return [
      hasConnectedData
        ? "No site visits were captured in the selected period."
        : "No analytics source is connected yet, so there is nothing to report.",
    ];
  }
  const requests = visits.filter((visit) => visit.outcome.includes("guidance request")).length;
  const topSource = topEntries(countBy(visits, (visit) => visit.source), 1)[0]?.[0] || "No source";
  const topAudience = topEntries(countBy(visits, (visit) => visit.audience), 1)[0]?.[0] || "No audience";
  const topPage = topEntries(
    countBy(visits.flatMap((visit) => visit.pages.map((page) => ({ page }))), (item) => item.page),
    1,
  )[0]?.[0] || "No page";
  const avgDuration = total
    ? visits.reduce((sum, visit) => sum + visit.duration, 0) / total
    : 0;

  return [
    `${formatNumber(total)} site visits were captured in the selected period.`,
    `${topAudience} visitors represented the largest audience segment.`,
    `${topSource} was the leading acquisition source, and ${topPage} was the most viewed page.`,
    `${formatNumber(requests)} visits converted into guidance requests, with an average session time of ${formatDuration(avgDuration)}.`,
  ];
}

function renderSummary(visits) {
  reportSummary.innerHTML = summaryLines(visits)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
}

function downloadCsv(visits) {
  const headers = ["visitor", "audience", "source", "location", "pages", "key_action", "outcome", "last_seen"];
  const rows = visits.map((visit) => [
    visit.consented ? visit.name : "Anonymous visitor",
    visit.audience,
    visit.source,
    visit.location,
    visit.pages.join(" -> "),
    visit.actions.at(-1) || "Page view",
    visit.outcome,
    visit.date,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "cancer-coach-usa-analytics.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportPdf() {
  document.body.classList.add("analytics-printing");
  window.print();
}

async function copySummary(visits) {
  const text = summaryLines(visits).join("\n");
  await navigator.clipboard.writeText(text);
  copySummaryButton.textContent = "Copied";
  window.setTimeout(() => {
    copySummaryButton.textContent = "Copy Summary";
  }, 1800);
}

function renderDashboard() {
  const visits = filteredVisits();
  renderKpis(visits);
  renderSources(visits);
  renderIntent(visits);
  renderContent(visits);
  renderVisitors(visits);
  renderSummary(visits);
}

analyticsRange?.addEventListener("change", renderDashboard);
analyticsSegment?.addEventListener("change", renderDashboard);
exportButton?.addEventListener("click", () => downloadCsv(filteredVisits()));
pdfExportButton?.addEventListener("click", exportPdf);
copySummaryButton?.addEventListener("click", () => {
  copySummary(filteredVisits()).catch(() => {
    copySummaryButton.textContent = "Copy unavailable";
  });
});

window.addEventListener("afterprint", () => {
  document.body.classList.remove("analytics-printing");
});

renderDashboard();
