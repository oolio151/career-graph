"use strict";

// Presentation fixtures only. Replace with dataset-backed API responses later.
const roles = {
  software: {
    title: "Software Engineer",
    group: "engineering",
    stage: "First chapter",
    salary: "$75k – $110k",
    description:
      "Build apps and tools people use every day.",
    skills: ["Python", "Data structures", "Git", "Problem solving"],
  },
  frontend: {
    title: "Frontend Developer",
    group: "engineering",
    stage: "First chapter",
    salary: "$70k – $105k",
    description:
      "Build websites that are easy for everyone to use.",
    skills: ["JavaScript", "HTML & CSS", "Accessibility", "UI development"],
  },
  analyst: {
    title: "Data Analyst",
    group: "data",
    stage: "First chapter",
    salary: "$60k – $90k",
    description:
      "Turn data into insights that help teams decide.",
    skills: ["SQL", "Python", "Visualization", "Statistics"],
  },
  senior: {
    title: "Senior Software Engineer",
    group: "engineering",
    stage: "Next chapter",
    salary: "$115k – $160k",
    description:
      "Design reliable systems and guide other engineers.",
    skills: ["System design", "Architecture", "Mentoring", "Testing"],
  },
  product: {
    title: "Product Engineer",
    group: "engineering",
    stage: "Next chapter",
    salary: "$100k – $145k",
    description:
      "Turn people’s needs into useful product features.",
    skills: ["Full-stack development", "User research", "Prototyping"],
  },
  scientist: {
    title: "Data Scientist",
    group: "data",
    stage: "Next chapter",
    salary: "$95k – $140k",
    description:
      "Use data and experiments to solve problems.",
    skills: ["Machine learning", "Statistics", "Python", "Experimentation"],
  },
  systems: {
    title: "Systems Analyst",
    group: "engineering",
    stage: "First chapter",
    salary: "$65k – $95k",
    description:
      "Help people work better with technology.",
    skills: [
      "Requirements analysis",
      "SQL",
      "Process mapping",
      "Communication",
    ],
  },
  it: {
    title: "IT Specialist",
    group: "engineering",
    stage: "First chapter",
    salary: "$55k – $85k",
    description:
      "Keep systems running and help people use them.",
    skills: ["Networking", "Troubleshooting", "Security", "Linux"],
  },
  architect: {
    title: "Solutions Architect",
    group: "engineering",
    stage: "Next chapter",
    salary: "$110k – $155k",
    description:
      "Design how a company’s technology fits together.",
    skills: [
      "Cloud platforms",
      "System design",
      "Integration",
      "Communication",
    ],
  },
  manager: {
    title: "IT Project Manager",
    group: "engineering",
    stage: "Next chapter",
    salary: "$90k – $130k",
    description:
      "Help teams plan and deliver technology projects.",
    skills: ["Planning", "Agile methods", "Leadership", "Risk management"],
  },
};
var pathways = {
  cs: ["software", "frontend", "analyst", "senior", "product", "scientist"],
  is: ["systems", "it", "analyst", "architect", "manager", "scientist"],
};
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
  "careergraph.activities",
  activities.map((a) => a.id),
);
var major = "cs";
var selectedRole = "software";
var filter = "all";
let currentView = "explore";
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
  explore: ["Explore", "Find your next step.", "Your degree. A few possibilities. A place to start."],
  engagement: ["Activities", "Learn by doing.", "Pick something you’d like to try."],
};
function showView(view) {
  if (!pages[view]) return;
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
  $(".page-heading > .primary-button").hidden = view === "discover" || view === "resume";
  if (view === "resume" && typeof loadResume === "function") loadResume();
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0 });
  $("#main").focus({ preventScroll: true });
}
function renderGraph() {
  $("#degree-name").innerHTML =
    major === "cs" ? "Computer<br>Science" : "Information<br>Systems";
  $("#role-nodes").innerHTML = pathways[major]
    .map((id, i) => {
      const role = roles[id];
      const muted = filter !== "all" && role.group !== filter;
      return `<button class="role-node ${id === selectedRole ? "selected" : ""} ${muted ? "muted" : ""}" data-role="${id}" data-column="${i > 2 ? 1 : 0}" data-row="${i % 3}" aria-pressed="${id === selectedRole}" ${muted ? "disabled" : ""}><strong>${role.title}</strong><span><i></i>${id === selectedRole ? "Selected" : "View role"}</span></button>`;
    })
    .join("");
  document
    .querySelectorAll(".edge")
    .forEach((edge) =>
      edge.classList.toggle(
        "muted",
        filter !== "all" && !edge.classList.contains(filter),
      ),
    );
  renderDetail();
}
function renderDetail() {
  const role = roles[selectedRole];
  $("#role-detail").innerHTML =
    `<div class="detail-top"><span class="role-type">${role.stage === "First chapter" ? "Starting role" : "Next step"}</span></div><h3>${role.title}</h3><p class="detail-description">${role.description}</p><div class="salary"><span>Example salary / year</span><strong>${role.salary}<small> / yr</small></strong></div><div class="skills-block"><p class="skills-title">Skills to explore</p><div class="tags">${role.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div></div>`;
}
function renderActivities() {
  $("#experience-preview").innerHTML = activities
    .map(
      (a) =>
        `<button class="experience-card" data-activity="${a.id}"><span class="experience-top"><span class="metric-icon ${a.color}">${icon(a.icon)}</span><span>↗</span></span><h3>${a.name}</h3><p>${a.description}</p></button>`,
    )
    .join("");
  $("#engagement-grid").innerHTML = activities
    .map(
      (a) =>
        `<article class="experience-card" id="activity-${a.id}" tabindex="-1"><div class="experience-top"><span class="metric-icon ${a.color}">${icon(a.icon)}</span><span>↗</span></div><h3>${a.name}</h3><p>${a.description}</p><div class="tags">${a.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div><div class="activity-details"><h4>A place to start</h4><p>${a.next}</p><button class="inline-link" data-open-role="${a.role}">Explore ${roles[a.role].title} ↗</button></div><button class="activity-toggle" data-plan="${a.id}" aria-pressed="${planned.has(a.id)}">${planned.has(a.id) ? "✓ Interested" : "+ I’m interested"}</button></article>`,
    )
    .join("");
}
function openRole(id) {
  if (!roles[id]) return;
  if (!pathways[major].includes(id)) {
    major = pathways.cs.includes(id) ? "cs" : "is";
    $("#major").value = major;
  }
  filter = "all";
  selectedRole = id;
  updateFilters();
  renderGraph();
  showView("explore");
  $("#pathway-title").scrollIntoView({ block: "start" });
  $(`[data-role="${id}"]`).focus({ preventScroll: true });
}
function updateFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.role) {
    selectedRole = button.dataset.role;
    renderGraph();
    $(`[data-role="${selectedRole}"]`).focus({ preventScroll: true });
  }
  if (button.dataset.filter) {
    filter = button.dataset.filter;
    if (filter !== "all" && roles[selectedRole].group !== filter)
      selectedRole = pathways[major].find((id) => roles[id].group === filter);
    updateFilters();
    renderGraph();
  }
  if (button.dataset.openRole) openRole(button.dataset.openRole);
  if (button.dataset.activity) {
    showView("engagement");
    $(`#activity-${button.dataset.activity}`).focus();
  }
  if (button.dataset.plan) {
    const id = button.dataset.plan;
    if (planned.has(id)) planned.delete(id);
    else planned.add(id);
    persist("careergraph.activities", planned);
    renderActivities();
    $(`[data-plan="${id}"]`).focus({ preventScroll: true });
  }
});
$("#major").addEventListener("change", (event) => {
  major = event.target.value;
  selectedRole = pathways[major].find(
    (id) => filter === "all" || roles[id].group === filter,
  );
  renderGraph();
});
$("#reset-graph").addEventListener("click", () => {
  filter = "all";
  selectedRole = pathways[major][0];
  updateFilters();
  renderGraph();
  $(".graph-scroll").scrollLeft = 0;
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
renderGraph();
renderActivities();
showView(pages[location.hash.slice(1)] ? location.hash.slice(1) : "discover");
