"use strict";

// Presentation fixtures only. Replace with dataset-backed API responses later.
const activities = [
  {
    id: "hackathon",
    name: "Build something",
    type: "HANDS-ON LEARNING",
    icon: "code",
    color: "peach",
    description: "Turn an idea into a weekend project.",
    connection: "Engineering pathways",
    skills: ["Prototyping", "Teamwork", "Git"],
    next: "Pick a small problem. Build a demo with a team. Share what you learned.",
    role: "software",
  },
  {
    id: "research",
    name: "Try research",
    type: "CURIOSITY IN ACTION",
    icon: "search",
    color: "purple",
    description: "Explore a question that interests you.",
    connection: "Data & analytics pathways",
    skills: ["Python", "Analysis", "Experimentation"],
    next: "Find a lab you’re curious about and ask how you can get involved.",
    role: "scientist",
  },
  {
    id: "community",
    name: "Join a club",
    type: "CAMPUS CONNECTIONS",
    icon: "people",
    color: "green",
    description: "Meet people. Learn together.",
    connection: "Skills for every pathway",
    skills: ["Communication", "Leadership", "Collaboration"],
    next: "Attend a club meeting and volunteer for a small project.",
    role: "product",
  },
];
const $ = (selector) => document.querySelector(selector);
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
function readIds(key, valid) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(key)) || "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id) => valid.includes(id)) : [],
    );
  } catch {
    return new Set();
  }
}
const storageKey = (key) => `${document.body.dataset.studentId}.${key}`;
const planned = readIds(
  "grit.activities",
  activities.map((a) => a.id),
);
let currentView = "discover";
let toastTimer;
function notify(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
function persist(key, values) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify([...values]));
    return true;
  } catch {
    notify("Saved for this session. Browser storage is unavailable.");
    return false;
  }
}
const pages = {
  discover: ["Discover", "Your next chapter starts here.", "Explore paths taken by alumni in your major."],
  resume: ["Resume", "Shape the resume.", "The file you uploaded, with a chat beside it."],
  engagement: ["Activities", "Learn by doing.", "Pick something you’d like to try."],
};
function showView(view) {
  if (!pages[view]) view = "discover";
  currentView = view;
  document.querySelectorAll(".view").forEach((el) => {
    el.hidden = el.id !== `view-${view}`;
  });
  document.querySelectorAll(".nav-item").forEach((el) => {
    const active = el.dataset.view === view;
    el.classList.toggle("active", active);
    if (active) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  $("#page-title").innerHTML = pages[view][1];
  $("#page-description").textContent = pages[view][2];
  $(".page-heading").hidden = view === "discover" || view === "resume";
  if (view === "resume" && typeof loadResume === "function") loadResume();
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0 });
  $("#main").focus({ preventScroll: true });
}
function renderActivities() {
  $("#engagement-grid").innerHTML = activities
    .map(
      (a) =>
        `<article class="experience-card" id="activity-${a.id}" tabindex="-1"><div class="experience-top"><span class="metric-icon ${a.color}">${icon(a.icon)}</span><span>↗</span></div><h3>${a.name}</h3><p>${a.description}</p><div class="tags">${a.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div><div class="activity-details"><h4>A place to start</h4><p>${a.next}</p><button class="inline-link" data-view="discover">Explore alumni paths ↗</button></div><button class="activity-toggle" data-plan="${a.id}" aria-pressed="${planned.has(a.id)}">${planned.has(a.id) ? "✓ Interested" : "+ I’m interested"}</button></article>`,
    )
    .join("");
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.plan) {
    const id = button.dataset.plan;
    if (planned.has(id)) planned.delete(id);
    else planned.add(id);
    persist("grit.activities", planned);
    renderActivities();
    $(`[data-plan="${id}"]`).focus({ preventScroll: true });
  }
});
$("#about-button").addEventListener("click", () =>
  $("#about-dialog").showModal(),
);
$("#close-about").addEventListener("click", () => $("#about-dialog").close());
$("#about-dialog").addEventListener("click", (event) => {
  if (event.target === $("#about-dialog")) {
    const rect = event.target.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      event.target.close();
  }
});
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
renderActivities();
document.addEventListener("DOMContentLoaded", () => showView(location.hash.slice(1) || "discover"));
