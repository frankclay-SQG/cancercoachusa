const scheduleCalendar = document.querySelector("#schedule-calendar");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

function formatTimeRange(start, end) {
  const formatter = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
  return `${formatter.format(new Date(start))}${end ? ` - ${formatter.format(new Date(end))}` : ""}`;
}

function groupByDate(slots) {
  return slots.reduce((groups, slot) => {
    const key = new Date(slot.start).toISOString().slice(0, 10);
    groups[key] = groups[key] || [];
    groups[key].push(slot);
    return groups;
  }, {});
}

function renderSchedule(slots) {
  if (!slots.length) {
    scheduleCalendar.innerHTML = "<p>No available openings are listed yet.</p>";
    return;
  }

  const grouped = groupByDate(slots);
  scheduleCalendar.innerHTML = Object.entries(grouped)
    .map(([date, daySlots]) => `
      <section class="schedule-day">
        <h3>${escapeHtml(formatDate(date))}</h3>
        <div class="schedule-slot-list">
          ${daySlots
            .map((slot) => `
              <article class="schedule-slot">
                <span>${escapeHtml(slot.meetingType || "Consultation")}</span>
                <strong>${escapeHtml(slot.title || "Available meeting")}</strong>
                <p>${escapeHtml(formatTimeRange(slot.start, slot.end))}</p>
                ${slot.description ? `<p>${escapeHtml(slot.description)}</p>` : ""}
                ${slot.location ? `<p>${escapeHtml(slot.location)}</p>` : ""}
                ${
                  slot.bookingUrl
                    ? `<a class="button button-primary" href="${escapeHtml(slot.bookingUrl)}" rel="noopener">Book This Time</a>`
                    : `<a class="button button-secondary" href="index.html#contact">Request This Time</a>`
                }
              </article>
            `)
            .join("")}
        </div>
      </section>
    `)
    .join("");
}

fetch("/api/schedule")
  .then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load the schedule.");
    renderSchedule(data.slots || []);
  })
  .catch((error) => {
    scheduleCalendar.innerHTML = `
      <p>${escapeHtml(error.message)}</p>
      <p>Confirm the Sanity environment variables are set on the Vercel project.</p>
    `;
  });
