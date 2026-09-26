"use strict";

const escapeHtml = (value) =>
  String(value ?? "Not available").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]),
  );
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const countLabel = (value) => Number(value).toLocaleString("en-US");

let studentProfile;
let discoverData;
let selectedFamily = "";
let requestVersion = 0;

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (response.status === 401) {
    location.assign("/");
    throw new Error("Your session ended.");
  }
  if (!response.ok) throw new Error(data.error || "Could not load this information. Please try again.");
  return data;
}

function joined(items) {
  const safe = items.map(escapeHtml);
  if (safe.length < 2) return safe[0] || "";
  if (safe.length === 2) return `${safe[0]} and ${safe[1]}`;
  return `${safe.slice(0, -1).join(", ")}, and ${safe.at(-1)}`;
}

function renderProfile(data) {
  studentProfile = data.student;
  const profile = studentProfile;
  document.querySelector("#profile-id").textContent = profile.campus_id;
  document.querySelector("#profile-major").textContent = profile.major;
  document.querySelector("#profile-summary").textContent =
    `${profile.class_level} · ${profile.track} · GPA ${profile.cumulative_gpa ?? "not available yet"} · ${profile.credits_earned} of ${profile.credits_required} credits`;
  const gpaFilter = document.querySelector("#filter-gpa");
  gpaFilter.disabled = profile.cumulative_gpa === null;
  gpaFilter.closest("label").title = profile.cumulative_gpa === null ? "No GPA yet" : "";
  document.querySelector("#filter-explanation").textContent = profile.cumulative_gpa === null
    ? "No GPA yet, so GPA matching is unavailable. Internships match 0, 1, or 2 or more."
    : "GPA compares your current GPA with graduates’ final GPA. Internships match 0, 1, or 2 or more.";
  document.querySelector("#profile-content").innerHTML = `
    <dl class="profile-facts">
      <div><dt>GPA</dt><dd>${escapeHtml(profile.cumulative_gpa ?? "Not available yet")}</dd></div>
      <div><dt>Credits earned</dt><dd>${escapeHtml(profile.credits_earned)} / ${escapeHtml(profile.credits_required)}</dd></div>
      <div><dt>Expected graduation</dt><dd>${escapeHtml(profile.expected_graduation_term)}</dd></div>
      <div><dt>Internships / co-ops</dt><dd>${escapeHtml(profile.internship_count)}</dd></div>
      <div><dt>Certifications</dt><dd>${escapeHtml(profile.credential_count)}</dd></div>
      <div><dt>Other activities</dt><dd>${escapeHtml(profile.engagement_activity_count)}</dd></div>
    </dl>
    <h3>Resume on file</h3>
    <p>${escapeHtml(data.resume.filename)} · ${Math.max(1, Math.ceil(data.resume.size / 1024))} KB</p>
    <p class="field-hint">Stored on this computer. Not read for these results. Replacing it deletes the previous file.</p>
    <details class="record-detail">
      <summary>Skills covered by passed courses (${profile.course_skills.length})</summary>
      <div class="tags">${profile.course_skills.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join("") || "No passed coursework yet."}</div>
    </details>
    <details class="record-detail">
      <summary>Courses (${profile.courses.length} attempts)</summary>
      <div class="record-table"><table><thead><tr><th>Course</th><th>Term</th><th>Grade</th></tr></thead><tbody>
        ${profile.courses.map((course) => `<tr><td>${escapeHtml(course.course_id)} · ${escapeHtml(course.course_title)}</td><td>${escapeHtml(course.term)}</td><td>${escapeHtml(course.grade)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="field-hint">IP means in progress. W means withdrawn. Repeated attempts are listed separately. Transfer credits may not appear here.</p>
    </details>
    <details class="record-detail">
      <summary>Experience records (${profile.experiences.length})</summary>
      <ul class="record-list">${profile.experiences.map((item) => `<li><strong>${escapeHtml(item.experience_name)}</strong><span>${escapeHtml(item.experience_type)} · ${escapeHtml(item.organization)} · ${escapeHtml(item.term)}</span><span>${escapeHtml(item.outcome)}</span></li>`).join("") || "<li>No experience records yet.</li>"}</ul>
    </details>`;
  major = profile.major === "Computer Science" ? "cs" : "is";
  selectedRole = pathways[major][0];
  filter = "all";
  document.querySelector("#major").value = major;
  updateFilters();
  renderGraph();
}

function fieldButton(field, employedCount) {
  const selected = field.family === selectedFamily;
  return `<button type="button" class="field-row${selected ? " selected" : ""}" data-family="${escapeHtml(field.family)}" aria-pressed="${selected}" aria-label="${escapeHtml(field.family)}, ${field.percent} percent, ${countLabel(field.count)} of ${countLabel(employedCount)} employed graduates">
    <span class="field-name">${escapeHtml(field.family)}</span>
    <span class="field-share">${field.percent}%</span>
    <span class="field-sample">${countLabel(field.count)} of ${countLabel(employedCount)}</span>
    <span class="percentage-track" aria-hidden="true"><span style="width:${Math.min(field.percent, 100)}%"></span></span>
  </button>`;
}

function renderDetail(field, data) {
  const panel = document.querySelector("#field-detail");
  if (!field) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  const covered = field.skills.filter((skill) => studentProfile.course_skills.includes(skill));
  const uncovered = field.skills.filter((skill) => !covered.includes(skill));
  const skillTags = [
    ...covered.map((skill) => `<span class="tag covered">${escapeHtml(skill)}</span>`),
    ...uncovered.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`),
  ].join("");
  const nextBlock = field.with_next_job
    ? `<p class="detail-description">${countLabel(field.with_next_job)} of ${countLabel(field.count)} have a second job recorded. Shares below use those ${countLabel(field.with_next_job)} people.</p>
       <ul class="compact-list">${field.next_roles.map((role) => `<li><span>${escapeHtml(role.title)}</span><strong>${role.percent}% <small>${countLabel(role.count)} of ${countLabel(field.with_next_job)}</small></strong></li>`).join("")}</ul>`
    : `<p class="detail-description">No second jobs recorded in this group yet.</p>`;
  const journeys = field.examples.length
    ? `<h4>A few recorded journeys</h4><p class="field-hint">Up to three people, chosen by record ID. Employers are fictional.</p>${field.examples.map((example) => `<details class="journey"><summary>${escapeHtml(example.campus_id)} · Class of ${escapeHtml(example.graduation_year)}</summary><ol>${example.jobs.map((job) => `<li><strong>${escapeHtml(job.job_title)}</strong><span>${escapeHtml(job.employer)}</span><small>${escapeHtml(job.start_date)} → ${escapeHtml(job.end_date || "Current at Sep 2026")} · ${escapeHtml(job.change_type)}</small></li>`).join("")}</ol></details>`).join("")}`
    : "";
  panel.innerHTML = `
    <p class="role-type">First job after a ${escapeHtml(data.major)} bachelor’s</p>
    <h3>${escapeHtml(field.family)}</h3>
    <p class="share-figure"><strong>${field.percent}%</strong><span>${countLabel(field.count)} of ${countLabel(data.employed_count)} who reported a first job</span></p>
    <p class="detail-description">Common titles: ${joined(field.titles)}.</p>
    <h4>How they found it</h4>
    <ul class="compact-list">${field.routes.map((route) => `<li><span>${escapeHtml(route.name)}</span><strong>${route.percent}% <small>${countLabel(route.count)} of ${countLabel(field.count)}</small></strong></li>`).join("")}</ul>
    <p class="field-hint">The three most common routes in this field.</p>
    <h4>What came next</h4>
    ${nextBlock}
    <h4>Skills these jobs asked for</h4>
    <div class="tags">${skillTags}</div>
    <p class="field-hint">${covered.length ? `Highlighted skills also appear in courses you passed: ${joined(covered)}.` : "None of these appear in courses you passed yet."}</p>
    ${journeys}`;
}

function renderDiscover(data, scrollDetail) {
  discoverData = data;
  const results = document.querySelector("#discover-results");
  const years = data.graduation_years;
  document.querySelector("#cohort-title").textContent = `Where ${data.major} graduates went`;
  document.querySelector("#cohort-lead").textContent = years.length
    ? `Bachelor’s graduates, ${years[0]}–${years.at(-1)}. Recorded outcomes from synthetic alumni, not open jobs.`
    : "No bachelor’s graduates match these filters.";
  document.querySelector("#field-list-title").textContent = data.employed_count
    ? `First job · ${countLabel(data.employed_count)} people`
    : "First job";
  document.querySelector("#outcomes-summary").textContent =
    `All first destinations · ${countLabel(data.cohort_count)} graduates`;
  document.querySelector("#outcome-list").innerHTML = data.outcomes.map((outcome) =>
    `<li><span>${escapeHtml(outcome.name === "No Response" ? "No response (unknown)" : outcome.name)}</span><strong>${outcome.percent}% <small>${countLabel(outcome.count)} of ${countLabel(data.cohort_count)}</small></strong></li>`,
  ).join("");
  if (!data.fields.some((field) => field.family === selectedFamily))
    selectedFamily = data.fields[0]?.family || "";
  document.querySelector("#field-list").innerHTML = data.fields.length
    ? data.fields.map((field) => fieldButton(field, data.employed_count)).join("")
    : `<p class="empty-fields">No first jobs were reported in this group.</p>`;
  renderDetail(data.fields.find((field) => field.family === selectedFamily), data);
  results.hidden = false;
  if (scrollDetail && window.matchMedia("(max-width: 950px)").matches)
    document.querySelector("#field-detail").scrollIntoView({ block: "nearest" });
}

async function loadDiscover() {
  const version = ++requestVersion;
  const results = document.querySelector("#discover-results");
  const status = document.querySelector("#discover-status");
  const retry = document.querySelector("#discover-retry");
  retry.hidden = true;
  results.setAttribute("aria-busy", "true");
  status.textContent = "Finding alumni paths…";
  const params = new URLSearchParams();
  for (const name of ["track", "gpa", "internships"])
    params.set(name, document.querySelector(`#filter-${name}`).checked ? "1" : "0");
  try {
    const data = await api(`/api/discover?${params}`);
    if (version !== requestVersion) return;
    if (!data.cohort_count) {
      results.hidden = true;
      status.textContent = "No alumni match these filters. Turn one off to widen the group.";
      return;
    }
    const caution = data.small_sample ? " Small group: a few people can move the percentage." : "";
    status.textContent = `${countLabel(data.cohort_count)} graduates in this group. ${countLabel(data.employed_count)} reported a first job. ${countLabel(data.unknown_count)} outcomes are unknown.${caution}`;
    renderDiscover(data, false);
  } catch (error) {
    if (version !== requestVersion) return;
    results.hidden = true;
    status.textContent = error.message || "Could not load alumni paths.";
    retry.hidden = false;
  } finally {
    if (version === requestVersion) results.setAttribute("aria-busy", "false");
  }
}

document.querySelector("#field-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-family]");
  if (!button || !discoverData) return;
  selectedFamily = button.dataset.family;
  renderDiscover(discoverData, true);
  document.querySelector('#field-list [aria-pressed="true"]')?.focus({ preventScroll: true });
});

for (const name of ["track", "gpa", "internships"])
  document.querySelector(`#filter-${name}`).addEventListener("change", loadDiscover);

document.querySelector("#discover-retry").addEventListener("click", () => {
  if (studentProfile) loadDiscover();
  else initializeDiscover();
});

document.querySelector("#change-student").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    const data = await api("/api/session/clear", { method: "POST", headers: { "X-CSRF-Token": csrfToken } });
    location.assign(data.next);
  } catch (error) {
    notify(error.message);
    document.querySelector("#change-student").disabled = false;
  }
});

document.querySelector("#replace-resume-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#resume-status");
  const button = event.currentTarget.querySelector("button");
  const file = document.querySelector("#replace-resume").files[0];
  if (!studentProfile) {
    status.textContent = "Wait for your profile to load, then try again.";
    return;
  }
  if (!file || !file.size || file.size > 5 * 1024 * 1024) {
    status.textContent = "Choose a nonempty resume smaller than 5 MB.";
    return;
  }
  const body = new FormData(event.currentTarget);
  body.set("campus_id", studentProfile.campus_id);
  button.disabled = true;
  status.textContent = "Uploading…";
  try {
    await api("/api/enroll", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body });
    renderProfile(await api("/api/session"));
    status.textContent = "Resume replaced. The previous file was deleted.";
    document.querySelector("#replace-resume-form").reset();
  } catch (error) {
    status.textContent = error.message || "Upload failed. Try again.";
  } finally {
    button.disabled = false;
  }
});

async function initializeDiscover() {
  try {
    renderProfile(await api("/api/session"));
    await loadDiscover();
  } catch (error) {
    document.querySelector("#discover-status").textContent = error.message || "Could not load your profile.";
    document.querySelector("#discover-retry").hidden = false;
  }
}

initializeDiscover();
