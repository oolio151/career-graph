"use strict";
const form = document.querySelector("#entry-form");
const idInput = document.querySelector("#campus-id");
const preview = document.querySelector("#student-preview");
const error = document.querySelector("#entry-error");
const resumeInput = document.querySelector("#resume");
const skipResume = document.querySelector("#skip-resume");
const resumeLabel = document.querySelector(".upload-label");
const resumeHint = document.querySelector("#resume-hint");
const csrf = document.querySelector('meta[name="csrf-token"]').content;
const schoolInput = document.querySelector("#school");
let schoolThemeTransition = null;
const schoolReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function applySchoolTheme(animate = false) {
  const school = schoolInput.value;
  if (document.body.dataset.school === school) return;
  const update = () => {
    document.body.dataset.school = school;
    document.querySelector('meta[name="theme-color"]').content = school === "umbc" ? "#171717" : "#387e7d";
  };
  schoolThemeTransition?.skipTransition();
  if (!animate || schoolReducedMotion.matches || !document.startViewTransition) {
    update();
    return;
  }
  const root = document.documentElement;
  // Reveal the entire new page snapshot so text, SVGs, and gradients share one wave.
  root.style.setProperty('--school-splash-radius', `${Math.ceil(Math.hypot(innerWidth, innerHeight) / 2) + 2}px`);
  root.classList.add('school-theme-splash');
  try {
    const transition = document.startViewTransition(update);
    schoolThemeTransition = transition;
    transition.finished.catch(() => {}).finally(() => {
      if (schoolThemeTransition !== transition) return;
      schoolThemeTransition = null;
      root.classList.remove('school-theme-splash');
      root.style.removeProperty('--school-splash-radius');
    });
  } catch {
    root.classList.remove('school-theme-splash');
    root.style.removeProperty('--school-splash-radius');
    update();
  }
}
schoolInput.addEventListener('change', () => applySchoolTheme(true));
window.addEventListener('pageshow', () => applySchoolTheme());
schoolReducedMotion.addEventListener('change', () => {
  if (schoolReducedMotion.matches) schoolThemeTransition?.skipTransition();
});
let lookup = 0;
function showError(message) { error.textContent = message; error.hidden = !message; }
async function findStudent() {
  const version = ++lookup;
  const id = idInput.value.trim().toUpperCase();
  idInput.value = id;
  preview.hidden = true;
  if (!idInput.reportValidity()) return;
  showError("");
  const button = document.querySelector("#find-student");
  button.disabled = true; button.textContent = "Looking up…";
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(id)}`);
    const student = await response.json();
    if (version !== lookup) return;
    if (!response.ok) throw new Error(student.error);
    const title = document.createElement("strong"); title.textContent = `${student.full_name || student.campus_id} · ${student.major}`;
    const summary = document.createElement("p");
    summary.textContent = `${student.class_level} · ${student.track} · GPA ${student.cumulative_gpa ?? "not available yet"}`;
    const detail = document.createElement("p");
    detail.textContent = `${student.credits_earned} credits earned · Graduation ${student.expected_graduation_term}`;
    preview.replaceChildren(title, summary, detail); preview.hidden = false;
  } catch (e) { if (version === lookup) showError(e.message || "Could not look up this student. Try again."); }
  finally { button.disabled = false; button.textContent = "Find student"; }
}
idInput.addEventListener("input", () => { ++lookup; preview.hidden = true; showError(""); });
document.querySelector("#find-student").addEventListener("click", findStudent);
skipResume.addEventListener("change", () => {
  resumeInput.disabled = skipResume.checked;
  resumeInput.required = !skipResume.checked;
  resumeLabel.classList.toggle("muted", skipResume.checked);
  resumeHint.classList.toggle("muted", skipResume.checked);
  resumeInput.value = skipResume.checked ? "" : resumeInput.value;
  resumeHint.textContent = skipResume.checked
    ? "You can upload a resume later from Resume Studio."
    : "UTF-8 LaTeX (.tex), up to 5 MB. Stored on this computer. When AI is enabled, extracted resume text and selected evidence are sent to Gemini.";
});
document.querySelectorAll("[data-sample]").forEach(button => button.addEventListener("click", () => { idInput.value = button.dataset.sample; findStudent(); }));
form.addEventListener("submit", async (event) => {
  event.preventDefault(); showError("");
  const file = resumeInput.files[0];
  if (!skipResume.checked && (!file || !file.size || file.size > 5 * 1024 * 1024)) { showError("Choose a nonempty resume smaller than 5 MB, or select ‘I’ll add a resume later.’"); return; }
  const button = document.querySelector("#enter-app"); button.disabled = true; button.textContent = "Opening your profile…";
  try {
    const response = await fetch("/api/enroll", {method:"POST", headers:{"X-CSRF-Token":csrf}, body:new FormData(form)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    location.assign(data.next);
  } catch (e) { showError(e.message || "Upload failed. Please try again."); button.disabled = false; button.textContent = "Discover my possibilities"; }
});

const graph = document.querySelector("#career-graph");
const edgeLayer = graph.querySelector(".career-edges");
const svgNS = "http://www.w3.org/2000/svg";
const edges = [...graph.querySelectorAll("[data-from]")].map(node => {
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("pathLength", "1");
  path.classList.add("career-edge");
  path.classList.toggle("on-path", node.classList.contains("on-path"));
  path.style.setProperty("--d", `${parseFloat(node.style.getPropertyValue("--d")) - .45}s`);
  edgeLayer.append(path);
  return {path, node, parent: graph.querySelector(`[data-node="${node.dataset.from}"]`)};
});
function drawEdges() {
  const box = graph.getBoundingClientRect();
  edgeLayer.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  for (const {path, node, parent} of edges) {
    if (!node.offsetParent) { path.removeAttribute("d"); continue; }
    const a = parent.getBoundingClientRect(), b = node.getBoundingClientRect();
    const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
    const x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
    const mid = (x1 + x2) / 2;
    path.setAttribute("d", `M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`);
  }
}
new ResizeObserver(drawEdges).observe(graph);
document.fonts.ready.then(() => { drawEdges(); requestAnimationFrame(() => document.documentElement.classList.add("intro-play")); });
document.querySelector("#continue").addEventListener("click", (event) => {
  event.preventDefault();
  const demo = document.querySelector("#main");
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  demo.scrollIntoView({behavior: smooth ? "smooth" : "auto"});
  demo.focus({preventScroll: true});
});
