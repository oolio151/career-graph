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
let selectedNextJob = "";
let aiSkills = new Set();
let requestVersion = 0;
let hasArrived = false;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
  document.querySelector("#profile-id").textContent = profile.full_name && profile.full_name !== profile.campus_id
    ? `${profile.full_name} · ${profile.campus_id}` : profile.campus_id;
  document.querySelector("#profile-major").textContent = profile.major;
  document.querySelector("#profile-summary").textContent =
    `${profile.class_level} · ${profile.track} · GPA ${profile.cumulative_gpa ?? "not available yet"} · ${profile.credits_earned} of ${profile.credits_required} credits`;
  const gpaFilter = document.querySelector("#filter-gpa");
  gpaFilter.disabled = profile.cumulative_gpa === null;
  if (gpaFilter.disabled) gpaFilter.checked = false;
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

}

// The sheet rises whenever its job changes while it is peeking from the bottom of the screen.
let peekText = "";
let hasRisen = false;
function riseSheet() {
  const sheet = document.querySelector("#detail-sheet");
  const top = sheet.getBoundingClientRect().top;
  if (reduceMotion.matches || top < innerHeight * .6 || top > innerHeight) return;
  sheet.style.animationDelay = hasRisen ? "0s" : ".3s";
  hasRisen = true;
  sheet.classList.remove("rising");
  void sheet.offsetWidth;
  sheet.classList.add("rising");
  sheet.addEventListener("animationend", () => sheet.classList.remove("rising"), {once: true});
}

function renderJobDetail(job, data) {
  const panel = document.querySelector("#field-detail");
  const drawer = document.querySelector("#detail-drawer");
  if (!job) { drawer.hidden = true; return; }
  drawer.hidden = false;
  const next = job.next_roles.find(role => role.title === selectedNextJob);
  const covered = job.skills.filter(skill => studentProfile.course_skills.includes(skill));
  document.querySelector("#peek-title").textContent = next ? next.title : job.title;
  document.querySelector("#peek-figure").textContent = next
    ? `${next.percent}% of second jobs after ${job.title}`
    : `${job.percent}% of reported first jobs`;
  const peek = document.querySelector("#detail-drawer .sheet-peek").textContent;
  if (peek !== peekText) { peekText = peek; riseSheet(); }
  const html = next
    ? `<div><p class="role-type">Recorded second job after ${escapeHtml(job.title)}</p>
       <h2>${escapeHtml(next.title)}</h2>
       <p class="share-figure"><strong>${next.percent}%</strong><span>${next.count} of ${job.with_next_job} alumni with a second job recorded after ${escapeHtml(job.title)}.</span></p>
       <p class="field-hint">These are observed transitions, not predictions. Select a first-job node to see its hiring routes and skills.</p></div>`
    : `<div><p class="role-type">Reported first job</p><h2>${escapeHtml(job.title)}</h2>
       <p class="share-figure"><strong>${job.percent}%</strong><span>${job.count} of ${data.employed_count} graduates who reported a first job.</span></p>
       <p class="field-hint">${job.with_next_job} of these ${job.count} alumni have a second job recorded.</p></div>
       <div><h3>How they found it</h3><ul class="compact-list">${job.routes.map(route => `<li><span>${escapeHtml(route.name)}</span><strong>${route.percent}% <small>${route.count} of ${job.count}</small></strong></li>`).join("")}</ul></div>
       <div><h3>Skills these jobs asked for</h3><div class="tags">${job.skills.map(skill => `<span class="tag ${aiSkills.has(skill) ? "ai-covered" : covered.includes(skill) ? "covered" : ""}">${escapeHtml(skill)}</span>`).join("") || "No skills recorded."}</div>
       <p class="field-hint">Blue highlights are skills identified in your uploaded resume. Gold highlights appear in passed courses.</p></div>`;
  if (panel.innerHTML === html) return;
  panel.innerHTML = html;
  panel.classList.remove("swap");
  void panel.offsetWidth;
  panel.classList.add("swap");
  panel.addEventListener("animationend", () => panel.classList.remove("swap"), {once: true});
}

async function loadResumeSkills() {
  try {
    const result = await api("/api/resume/skills");
    aiSkills = new Set(result.skills || []);
    if (discoverData) renderDiscover(discoverData);
  } catch {
    aiSkills = new Set();
  }
}

// The map keeps one element per job so filter and selection changes can move
// nodes instead of redrawing them.
const MAP = {label: 34, row: 72, nodeH: 58, nodeW: 232, firstX: 130, nextX: 506, width: 740, minRows: 5};
const mapNodes = new Map();
const mapEdges = new Map();
let edgeFrame = 0;

function tweenNumber(element, to) {
  const from = parseFloat(element.dataset.value ?? to);
  element.dataset.value = to;
  if (from === to || reduceMotion.matches) { element.textContent = to; return; }
  const decimals = String(to).split(".")[1]?.length || 0;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 450);
    const eased = 1 - (1 - t) ** 3;
    element.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (t < 1 && element.dataset.value == to) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function mapNode(map, key, attrs) {
  let node = mapNodes.get(key);
  if (!node) {
    node = document.createElement("button");
    node.type = "button";
    node.className = "alumni-node entering";
    node.innerHTML = "<strong></strong><span><b></b><em></em></span>";
    node.style.top = attrs.top + "px";
    map.append(node);
    mapNodes.set(key, node);
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove("entering")));
  }
  node.style.left = attrs.left + "px";
  node.style.top = attrs.top + "px";
  node.querySelector("strong").textContent = attrs.title;
  tweenNumber(node.querySelector("b"), attrs.value);
  node.querySelector("em").textContent = attrs.suffix;
  node.classList.toggle("selected", attrs.selected);
  node.classList.toggle("branch-parent", Boolean(attrs.branchParent));
  node.setAttribute("aria-pressed", attrs.selected);
  node.setAttribute("aria-label", `${attrs.title}, ${attrs.value}${attrs.suffix}`);
  for (const [name, value] of Object.entries(attrs.data)) node.dataset[name] = value;
  return node;
}

function drawEdges(map, center) {
  const svg = map.querySelector(".alumni-edges");
  for (const [key, path] of mapEdges) {
    const node = mapNodes.get(key);
    if (!node) continue;
    const y2 = node.offsetTop + MAP.nodeH / 2, x2 = node.offsetLeft;
    let x1 = 0, y1 = center;
    if (key.startsWith("next:")) {
      const parent = [...mapNodes.values()].find(el => el.dataset.firstJob === selectedFamily);
      if (!parent) continue;
      x1 = parent.offsetLeft + MAP.nodeW; y1 = parent.offsetTop + MAP.nodeH / 2;
    }
    const mid = (x1 + x2) / 2;
    path.setAttribute("d", `M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`);
  }
  svg.setAttribute("viewBox", `0 0 ${MAP.width} ${map.offsetHeight}`);
}

function renderAlumniMap(data) {
  const map = document.querySelector("#alumni-map");
  if (!map.querySelector(".alumni-edges")) {
    map.innerHTML = `
      <div class="alumni-column-label" style="left:${MAP.firstX}px">Started here</div>
      <div class="alumni-column-label" style="left:${MAP.nextX}px">Went next</div>
      <svg class="alumni-edges" aria-hidden="true"></svg>
      <p class="alumni-no-next" style="left:${MAP.nextX}px" hidden>No second jobs recorded for this first job.</p>`;
  }
  const jobs = data.first_jobs.slice(0, 5);
  const chosen = jobs.find(job => job.title === selectedFamily);
  const next = chosen?.next_roles.slice(0, 5) || [];
  const rows = Math.max(MAP.minRows, jobs.length, next.length);
  const height = MAP.label * 2 + rows * MAP.row;
  const center = height / 2;
  const columnTop = (count, i) => center - (count * MAP.row) / 2 + i * MAP.row + (MAP.row - MAP.nodeH) / 2;
  map.style.height = height + "px";
  map.style.width = MAP.width + "px";

  const wanted = new Set();
  jobs.forEach((job, i) => {
    const key = `first:${job.title}`;
    wanted.add(key);
    mapNode(map, key, {
      left: MAP.firstX, top: columnTop(jobs.length, i), title: job.title, value: job.percent,
      suffix: `% · ${job.count} first jobs`, selected: job.title === selectedFamily && !selectedNextJob,
      branchParent: job.title === selectedFamily && Boolean(selectedNextJob),
      data: {firstJob: job.title},
    });
  });
  next.forEach((role, i) => {
    const key = `next:${role.title}`;
    wanted.add(key);
    mapNode(map, key, {
      left: MAP.nextX, top: columnTop(next.length, i), title: role.title, value: role.count,
      suffix: " recorded transitions", selected: role.title === selectedNextJob,
      data: {nextJob: role.title},
    });
  });
  const noNext = map.querySelector(".alumni-no-next");
  noNext.hidden = Boolean(next.length);
  noNext.style.top = center - 20 + "px";

  const svg = map.querySelector(".alumni-edges");
  for (const key of wanted) {
    let path = mapEdges.get(key);
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("entering");
      svg.append(path);
      mapEdges.set(key, path);
      requestAnimationFrame(() => requestAnimationFrame(() => path.classList.remove("entering")));
    }
    path.classList.remove("leaving");
    path.classList.toggle("active", key === `first:${selectedFamily}` ||
      (Boolean(selectedNextJob) && key === `next:${selectedNextJob}`));
  }
  for (const [key, node] of mapNodes) {
    if (wanted.has(key)) continue;
    const path = mapEdges.get(key);
    mapNodes.delete(key);
    mapEdges.delete(key);
    node.classList.add("leaving");
    path?.classList.add("leaving");
    const remove = () => { node.remove(); path?.remove(); };
    if (reduceMotion.matches) remove(); else setTimeout(remove, 260);
  }

  cancelAnimationFrame(edgeFrame);
  const until = performance.now() + (reduceMotion.matches ? 0 : 520);
  const follow = () => {
    drawEdges(map, center);
    if (performance.now() < until) edgeFrame = requestAnimationFrame(follow);
  };
  follow();

  if (!hasArrived) {
    hasArrived = true;
    if (!reduceMotion.matches) {
      map.classList.add("arriving");
      setTimeout(() => map.classList.remove("arriving"), 700);
    }
  }
}

function setResultsHidden(hidden) {
  document.querySelector("#discover-results").hidden = hidden;
  document.querySelector("#outcomes-panel").hidden = hidden;
  if (hidden) document.querySelector("#detail-drawer").hidden = true;
}

function renderDiscover(data) {
  discoverData = data;
  const years = data.graduation_years;
  const likeYou = ["track", "gpa", "internships"].some(name => document.querySelector(`#filter-${name}`).checked);
  document.querySelector("#cohort-title").textContent = `Where ${data.major} graduates ${likeYou ? "like you " : ""}went`;
  document.querySelector("#cohort-lead").textContent = years.length
    ? `Bachelor’s graduates, ${years[0]}–${years.at(-1)}. Recorded outcomes from synthetic alumni, not open jobs.`
    : "No bachelor’s graduates match these filters.";
  document.querySelector("#outcomes-summary").textContent = `All first destinations · ${data.cohort_count} graduates`;
  document.querySelector("#outcome-list").innerHTML = data.outcomes.map(outcome =>
    `<li><span>${escapeHtml(outcome.name === "No Response" ? "No response (unknown)" : outcome.name)}</span><strong>${outcome.percent}% <small>${outcome.count} of ${data.cohort_count}</small></strong></li>`).join("");
  if (!data.first_jobs.slice(0, 5).some(job => job.title === selectedFamily)) selectedFamily = data.first_jobs[0]?.title || "";
  const job = data.first_jobs.find(job => job.title === selectedFamily);
  if (!job?.next_roles.slice(0, 5).some(role => role.title === selectedNextJob)) selectedNextJob = "";
  setResultsHidden(false);
  renderAlumniMap(data);
  renderJobDetail(job, data);
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
      setResultsHidden(true);
      status.textContent = "No alumni match these filters. Turn one off to widen the group.";
      return;
    }
    const caution = data.small_sample ? " Small group: a few people can move the percentage." : "";
    status.textContent = `${countLabel(data.cohort_count)} graduates in this group. ${countLabel(data.employed_count)} reported a first job. ${countLabel(data.unknown_count)} outcomes are unknown.${caution}`;
    renderDiscover(data);
  } catch (error) {
    if (version !== requestVersion) return;
    setResultsHidden(true);
    status.textContent = error.message || "Could not load alumni paths.";
    retry.hidden = false;
  } finally {
    if (version === requestVersion) results.setAttribute("aria-busy", "false");
  }
}

document.querySelector("#alumni-map").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || !discoverData) return;
  if (button.dataset.firstJob) {
    selectedFamily = button.dataset.firstJob;
    selectedNextJob = "";
  } else if (button.dataset.nextJob) {
    selectedNextJob = button.dataset.nextJob;
  } else return;
  renderDiscover(discoverData);
});

document.querySelector("#drawer-toggle").addEventListener("click", () =>
  document.querySelector("#detail-sheet").scrollIntoView({block: "start", behavior: reduceMotion.matches ? "auto" : "smooth"}));

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
  if (!file || !/\.tex$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) {
    status.textContent = "Choose a nonempty LaTeX .tex file smaller than 5 MB.";
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
    await loadResumeSkills();
  } catch (error) {
    status.textContent = error.message || "Upload failed. Try again.";
  } finally {
    button.disabled = false;
  }
});

async function initializeDiscover() {
  try {
    renderProfile(await api("/api/session"));
    await loadResumeSkills();
    await loadDiscover();
  } catch (error) {
    document.querySelector("#discover-status").textContent = error.message || "Could not load your profile.";
    document.querySelector("#discover-retry").hidden = false;
  }
}

initializeDiscover();
