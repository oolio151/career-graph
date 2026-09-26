"use strict";

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const chips = (items) => items.map((s) => `<span class="skill-chip">${escapeHTML(s)}</span>`).join("");
const statusLabels = {completed: "Completed", progress: "In progress", suggested: "Suggested", gap: "Skill gap"};
let state = null;
let options = null;
let expanded = false;
let requestVersion = 0;
let comparisonVersion = 0;
let nodes = [];
let edges = [];

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return response.json();
}

function pathwayURL(student, career, season) {
  return `/api/pathway?${new URLSearchParams({student, career, season})}`;
}

function setStatus(message, error = false) {
  $("#app-status").textContent = message;
  $("#app-status").classList.toggle("error", error);
}

async function initialize() {
  $("#retry").hidden = true;
  setStatus("Loading the career dataset…");
  try {
    options = await getJSON("/api/options");
    $("#student").innerHTML = options.students.map((s) => `<option value="${escapeHTML(s.campus_id)}">${escapeHTML(s.campus_id)} · ${escapeHTML(s.major)} · ${escapeHTML(s.class_level)}</option>`).join("");
    $("#career").innerHTML = options.careers.map((c) => `<option>${escapeHTML(c)}</option>`).join("");
    $("#career").value = options.careers.includes("Data & Analytics") ? "Data & Analytics" : options.careers[0];
    $("#explore").disabled = false;
    await loadPathway();
  } catch (error) {
    setStatus(`Couldn't load the dataset. ${error.message}`, true);
    $("#retry").hidden = false;
  }
}

async function loadPathway() {
  const version = ++requestVersion;
  ++comparisonVersion;
  $("#explore").disabled = true;
  $("#results").hidden = true;
  setStatus("Finding your connections…");
  try {
    const result = await getJSON(pathwayURL($("#student").value, $("#career").value, $("#season").value));
    if (version !== requestVersion) return;
    state = result;
    expanded = false;
    render();
    $("#results").hidden = false;
    setStatus(`Exploring ${state.career} for ${state.student.campus_id} · Based on ${state.job_count.toLocaleString()} entry-level job records.`);
    compareCareer();
  } catch (error) {
    if (version === requestVersion) setStatus(`Couldn't build this pathway. ${error.message} Try Explore pathway again.`, true);
  } finally {
    if (version === requestVersion) $("#explore").disabled = false;
  }
}

function render() {
  const s = state.student;
  $("#profile").innerHTML = `<span class="avatar" aria-hidden="true">↗</span><div><strong>${escapeHTML(s.campus_id)}</strong><small>${escapeHTML(s.major)} · ${escapeHTML(s.track)}</small></div><div class="metric"><strong>${escapeHTML(s.class_level)}</strong><small>${escapeHTML(s.entry_type)}</small></div><div class="metric"><strong>${escapeHTML(s.credits_earned)} / ${escapeHTML(s.credits_required)}</strong><small>Credits earned</small></div><div class="metric"><strong>${s.cumulative_gpa === "Not Applicable" ? "Not yet available" : escapeHTML(s.cumulative_gpa)}</strong><small>Cumulative GPA</small></div><div class="metric"><strong>${escapeHTML(s.expected_graduation_term)}</strong><small>Expected graduation</small></div>`;
  renderGraph();
  selectNode("career");
  renderRecommendations();
  renderActivities();
  const previous = $("#compare").value;
  $("#compare").innerHTML = options.careers.filter((c) => c !== state.career).map((c) => `<option>${escapeHTML(c)}</option>`).join("");
  if (previous !== state.career && options.careers.includes(previous)) $("#compare").value = previous;
}

function renderGraph() {
  const skills = expanded ? state.skills : state.skills.slice(0, 8);
  const visibleSkills = new Set(skills.map((s) => s.name));
  const relevant = [...state.courses].sort((a, b) => {
    const count = (c) => c.skills.filter((s) => visibleSkills.has(s)).length;
    return count(b) - count(a) || a.course_id.localeCompare(b.course_id);
  });
  const suggestions = state.suggestions.filter((c) => c.skills.some((s) => visibleSkills.has(s)));
  const courses = expanded ? [...relevant, ...state.suggestions] : [...relevant.filter((c) => c.skills.some((s) => visibleSkills.has(s))).slice(0, 8 - suggestions.length), ...suggestions];
  const rows = Math.max(skills.length, courses.length, 3);
  const height = 70 + rows * 68 + 130;
  nodes = [];
  edges = [];
  const add = (id, type, data, x, y, width, title, subtitle, status) => nodes.push({id, type, data, x, y, width, title, subtitle, status});
  courses.forEach((c, i) => add(`course:${c.course_id}`, "course", c, 24, 48 + i * 68, 205, `${c.course_id} · ${statusLabels[c.status]}`, c.course_title, c.status));
  skills.forEach((s, i) => add(`skill:${s.name}`, "skill", s, 310, 48 + i * 68, 175, s.name, `${s.percent}% of entry-level records · ${statusLabels[s.status]}`, s.status));
  add("career", "career", null, 575, 48 + Math.floor(rows / 2) * 68, 160, state.career, `${state.coverage.percent}% course skill coverage`, "career");
  add("activity", "activity", null, 24, height - 100, 205, "Beyond the classroom", "Activities & certifications", "activity");
  add("cohort", "activity", null, 310, height - 100, 175, `${state.cohort_count} alumni pathways`, "Same major · Bachelor’s degree", "activity");
  courses.forEach((c) => c.skills.filter((s) => visibleSkills.has(s)).forEach((s) => edges.push({from: `course:${c.course_id}`, to: `skill:${s}`, status: c.status})));
  skills.forEach((s) => edges.push({from: `skill:${s.name}`, to: "career", status: s.status}));
  edges.push({from: "activity", to: "cohort", status: "association"}, {from: "cohort", to: "career", status: "association"});
  const graph = $("#graph");
  graph.style.height = `${height}px`;
  const paths = edges.map((edge, i) => {
    const source = nodes.find((n) => n.id === edge.from);
    const target = nodes.find((n) => n.id === edge.to);
    const x1 = source.x + source.width, y1 = source.y + 27, x2 = target.x, y2 = target.y + 27;
    const mid = (x1 + x2) / 2;
    return `<path class="edge ${edge.status}" data-edge="${i}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"/>`;
  }).join("");
  graph.innerHTML = `<svg width="760" height="${height}" aria-hidden="true">${paths}</svg><span class="column-label" style="left:24px">YOUR LEARNING</span><span class="column-label" style="left:310px">CAREER SKILLS</span><span class="column-label" style="left:575px">YOUR DIRECTION</span>${nodes.map((n, i) => `<button type="button" class="node ${n.status}" data-node="${i}" style="left:${n.x}px;top:${n.y}px;width:${n.width}px" title="${escapeHTML(n.subtitle)}" aria-pressed="false"><strong>${escapeHTML(n.title)}</strong><small>${escapeHTML(n.subtitle)}</small></button>`).join("")}`;
  graph.querySelectorAll("[data-node]").forEach((button) => button.addEventListener("click", () => selectNode(nodes[Number(button.dataset.node)].id)));
  $("#graph-note").innerHTML = `${expanded ? "All" : "Focused view:"} ${courses.length} of ${state.courses.length + state.suggestions.length} relevant courses · ${skills.length} of ${state.skills.length} target skills. Purple dotted links show alumni associations. <button type="button" class="text-button" id="expand-graph">${expanded ? "Show focused map" : "Show full map"}</button>`;
  $("#expand-graph").addEventListener("click", () => { expanded = !expanded; renderGraph(); selectNode("career"); });
}

function selectNode(id) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return;
  const connected = new Set([id]);
  const relatedEdges = new Set();
  edges.forEach((edge, index) => {
    if (edge.from === id || edge.to === id || id === "career") {
      connected.add(edge.from); connected.add(edge.to); relatedEdges.add(index);
    }
  });
  $("#graph").querySelectorAll("[data-node]").forEach((button) => {
    const item = nodes[Number(button.dataset.node)];
    button.classList.toggle("selected", item.id === id);
    button.classList.toggle("dim", !connected.has(item.id));
    button.setAttribute("aria-pressed", String(item.id === id));
  });
  $("#graph").querySelectorAll("[data-edge]").forEach((path) => {
    path.classList.toggle("active", relatedEdges.has(Number(path.dataset.edge)) && id !== "career");
    path.classList.toggle("dim", !relatedEdges.has(Number(path.dataset.edge)));
  });
  if (node.type === "course") showCourse(node.data);
  else if (node.type === "skill") showSkill(node.data);
  else if (node.type === "activity") showActivityContext();
  else showCareer();
}

function showCareer() {
  const c = state.coverage;
  $("#detail").innerHTML = `<span class="tag">YOUR TARGET</span><h3 class="detail-rule">${escapeHTML(state.career)}</h3><div class="coverage-number">${c.percent}<span>%</span></div><p>Course-derived skill coverage</p><div class="meter"><span style="width:${c.percent}%"></span></div><p><strong>${c.covered} of ${c.total} target skills</strong> appear in courses you’ve earned credit for. ${c.in_progress} additional skills are in progress.</p><p class="detail-rule">Target skills are the union of tags across ${state.job_count} entry-level job records. Each distinct skill counts equally toward coverage.</p><p>Explore a skill to see its frequency and the courses that teach it.</p><p class="footnote">This reflects coursework exposure, not verified mastery or hiring probability.</p>`;
}

function showCourse(c) {
  const prerequisites = c.prerequisite_ids === "Not Applicable" ? "None listed" : c.prerequisite_ids.replaceAll("|", "; ");
  $("#detail").innerHTML = `<span class="tag">${escapeHTML(statusLabels[c.status])}</span><h3 class="detail-rule">${escapeHTML(c.course_id)}</h3><p>${escapeHTML(c.course_title)}</p><p><strong>${escapeHTML(c.credits)} credits</strong> · ${escapeHTML(c.course_type)}</p><h4>Connected career skills</h4>${chips(c.skills)}<p class="detail-rule"><strong>Prerequisites:</strong> ${escapeHTML(prerequisites)}</p><p><strong>Typically offered:</strong> ${escapeHTML(c.typical_terms_offered.replaceAll("|", ", "))}</p><p><strong>Prerequisite course coverage:</strong> ${c.prerequisite_gaps.length ? `Missing ${escapeHTML(c.prerequisite_gaps.join("; "))}` : "Listed courses have earned credit, or none are required."}</p><p>Minimum grades, transfer equivalencies, seat availability, and full degree rules aren’t supplied. Confirm eligibility with an advisor.</p>`;
}

function showSkill(skill) {
  const courses = [...state.courses, ...state.suggestions].filter((c) => c.skills.includes(skill.name));
  $("#detail").innerHTML = `<span class="tag">${escapeHTML(statusLabels[skill.status])}</span><h3 class="detail-rule">${escapeHTML(skill.name)}</h3><div class="coverage-number">${skill.percent}<span>%</span></div><p>${skill.count} of ${state.job_count} entry-level ${escapeHTML(state.career)} job records list this skill.</p><h4>Your course connections</h4>${courses.length ? `<ul>${courses.map((c) => `<li>${escapeHTML(c.course_id)} · ${escapeHTML(c.course_title)} (${escapeHTML(statusLabels[c.status])})</li>`).join("")}</ul>` : '<p>No completed, in-progress, or currently recommended course covers this skill. Explore the prerequisite and season constraints below.</p>'}<p class="detail-rule">A skill tag identifies course coverage, not a measurement of your ability.</p>`;
}

function showActivityContext() {
  $("#detail").innerHTML = `<span class="tag">ALUMNI ASSOCIATION</span><h3 class="detail-rule">Experience adds context.</h3><p>These ${state.cohort_count} alumni earned a bachelor’s in ${escapeHTML(state.student.major)} and have an entry-level ${escapeHTML(state.career)} job record.</p><p>Each person counts once per activity type, even if they joined several times or held several roles.</p><p>Activities have no skill tags, so the map connects them through alumni pathways rather than assigning skills.</p><p class="detail-rule">The comparison spans graduation cohorts from 2015–2026. It is descriptive, not a matched study or a prediction. Scroll to the activity panel for counts and example paths.</p>`;
}

function renderRecommendations() {
  $("#season-note").textContent = `Typically offered in ${state.season}`;
  $("#recommendations").innerHTML = state.suggestions.length ? state.suggestions.map((c, i) => `<article class="recommendation"><div class="step"><span>0${i + 1} / EXPLORE A COURSE</span><span>${escapeHTML(c.credits)} credits</span></div><h3>${escapeHTML(c.course_title)}</h3><p>${escapeHTML(c.course_id)} · ${c.new_skills.length} skills beyond completed coursework</p>${chips(c.new_skills)}<p>Listed prerequisites have course credit, or none are required. Confirm minimum grades and availability.</p><button class="text-button" type="button" data-course="${i}">See the connection ↗</button></article>`).join("") : `<p class="empty">${state.coverage.covered === state.coverage.total ? 'Your completed coursework covers every target skill in this dataset. Explore alumni experiences or compare another career.' : 'No additional course meets the current prerequisite and season filters for skills beyond your completed and in-progress coursework. Explore the constraints below or try another season.'}</p>`;
  $("#recommendations").querySelectorAll("[data-course]").forEach((button) => button.addEventListener("click", () => {
    const course = state.suggestions[Number(button.dataset.course)];
    if (!nodes.some((n) => n.id === `course:${course.course_id}`)) { expanded = true; renderGraph(); }
    selectNode(`course:${course.course_id}`);
    $(".detail-panel").scrollIntoView({behavior: "smooth", block: "nearest"});
  }));
  $("#blocked").hidden = state.blocked_courses.length === 0;
  $("#blocked-list").innerHTML = state.blocked_courses.map((c) => `<div class="blocked-item"><strong>${escapeHTML(c.course_id)} · ${escapeHTML(c.course_title)}</strong><br>${c.prerequisite_gaps.length ? `Prerequisite courses without earned credit: ${escapeHTML(c.prerequisite_gaps.join("; "))}. ` : ''}${!c.offered ? `Typically offered in ${escapeHTML(c.typical_terms_offered.replaceAll("|", ", "))}, not ${escapeHTML(state.season)}.` : ''}<br>${chips(c.new_skills)}</div>`).join("");
}

function renderActivities() {
  $("#cohort-note").textContent = `${state.cohort_count} unique ${state.student.major} bachelor’s alumni with an entry-level ${state.career} role, across 2015–2026 graduation cohorts. Share who participated at least once:`;
  $("#activities").innerHTML = state.activities.length ? state.activities.map((a) => `<article class="activity"><h3>${escapeHTML(a.name)}</h3><span class="count">${a.percent}%</span><small>${a.count} of ${state.cohort_count} alumni</small><div class="meter"><span style="width:${a.percent}%"></span></div><small>${a.student_count ? `${a.student_count} in your experience records` : 'Not in your experience records'}</small></article>`).join("") : '<p class="empty">No matching alumni activity records for this comparison.</p>';
  $("#examples").innerHTML = state.examples.length ? state.examples.map((e) => `<article class="example"><h3>${escapeHTML(e.campus_id)} · Class of ${escapeHTML(e.year)}</h3><p>${escapeHTML(e.track)}</p><p>${escapeHTML(e.activities.join(" · "))}</p><ol>${e.jobs.map((j) => `<li><strong>${escapeHTML(j.title)}</strong><br>${escapeHTML(j.start)} · ${escapeHTML(j.level)}</li>`).join("")}</ol></article>`).join("") : '<p class="empty">No matching pathways.</p>';
}

async function compareCareer() {
  if (!state) return;
  const version = ++comparisonVersion;
  const current = state;
  $("#comparison").textContent = "Comparing coursework…";
  try {
    const alternative = await getJSON(pathwayURL(current.student.campus_id, $("#compare").value, current.season));
    if (version !== comparisonVersion || state !== current) return;
    $("#comparison").innerHTML = `<div class="comparison-score">${current.coverage.percent}% → ${alternative.coverage.percent}%</div><p class="muted">${escapeHTML(current.career)} → ${escapeHTML(alternative.career)}</p><p class="muted">Alternative: ${alternative.coverage.covered} / ${alternative.coverage.total} distinct skills covered. Each career has a different target skill set.</p>`;
  } catch (error) {
    if (version === comparisonVersion) $("#comparison").textContent = `Comparison unavailable: ${error.message}`;
  }
}

$("#controls").addEventListener("submit", (event) => { event.preventDefault(); loadPathway(); });
$("#controls").addEventListener("change", () => setStatus("Options changed. Select Explore pathway to update the map."));
$("#compare").addEventListener("change", compareCareer);
$("#retry").addEventListener("click", initialize);
initialize();
