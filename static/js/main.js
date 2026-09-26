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
const saved = readIds("careergraph.saved", Object.keys(roles));
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
  explore: ["Explore", "Find your next step.", "Your degree. A few possibilities. A place to start."],
  engagement: ["Activities", "Learn by doing.", "Pick something you’d like to try."],
  advisor: ["Advisor", "Let’s figure it out.", "Ask about roles, skills, or getting started."],
  saved: ["Saved", "Keep your options open.", "Your saved roles, right here in this browser."],
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
  $(".page-heading").hidden = view === "discover";
  $(".page-heading > .primary-button").hidden = view === "advisor" || view === "discover";
  if (view === "saved") renderSaved();
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
  const isSaved = saved.has(selectedRole);
  $("#role-detail").innerHTML =
    `<div class="detail-top"><span class="role-type">${role.stage === "First chapter" ? "Starting role" : "Next step"}</span><button class="icon-button ${isSaved ? "bookmarked" : ""}" data-save="${selectedRole}" aria-label="${isSaved ? "Unsave" : "Save"} ${role.title}" aria-pressed="${isSaved}">${icon("bookmark")}</button></div><h3>${role.title}</h3><p class="detail-description">${role.description}</p><div class="salary"><span>Example salary / year</span><strong>${role.salary}<small> / yr</small></strong></div><div class="skills-block"><p class="skills-title">Skills to explore</p><div class="tags">${role.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div></div><button class="primary-button" data-prompt="How can I explore becoming a ${role.title}?">Ask about this role ${icon("arrow")}</button>`;
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
function renderSaved() {
  $("#saved-count").textContent = saved.size;
  $("#saved-roles").innerHTML = saved.size
    ? [...saved]
        .map((id) => {
          const role = roles[id];
          return `<article class="saved-card"><span class="metric-icon green">${icon("case")}</span><h3>${role.title}</h3><p>${role.description}</p><div class="tags">${role.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div><div class="saved-card-actions"><button class="inline-link" data-open-role="${id}">Explore role ↗</button><button class="icon-button bookmarked" data-save="${id}" aria-label="Unsave ${role.title}">${icon("bookmark")}</button></div></article>`;
        })
        .join("")
    : `<div class="empty-state">${icon("bookmark")}<h3>No saved roles yet.</h3><p>Tap the bookmark on a role to keep it here.</p><button class="primary-button" data-view="explore">Explore roles ${icon("arrow")}</button></div>`;
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
function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = `message ${sender}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = sender === "user" ? "You" : "Advisor · Demo";
  message.append(label, document.createTextNode(text));
  $("#chat-messages").append(message);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
}
function resetChat() {
  $("#chat-messages").replaceChildren();
  addMessage(
    "Hi! Want to explore a role, build a skill, or find an activity? Pick a question to get started.",
    "advisor",
  );
}
function replyTo(question) {
  const text = question.toLowerCase();
  const mentionedRole = Object.values(roles)
    .sort((a, b) => b.title.length - a.title.length)
    .find((role) => text.includes(role.title.toLowerCase()));
  if (mentionedRole)
    return `For ${mentionedRole.title}, try ${mentionedRole.skills.slice(0, 3).join(", ")}. Pick one skill and build a small project with it.\n\nSave the role if you’d like to come back to it.`;
  if (/skill|learn|course/.test(text))
    return `For ${roles[selectedRole].title}, start with ${roles[selectedRole].skills.slice(0, 3).join(", ")}. Choose one skill and practice it in a small project. These are example skills, not a review of your coursework.`;
  if (/experience|club|research|hackathon|engage/.test(text))
    return "Try a hackathon to build, research to investigate, or a club to collaborate. Open Activities and save one you’d like to try.";
  if (/salary|money|roi|cost|pay/.test(text))
    return "The salaries shown are examples, not current estimates or predictions. For now, explore the work and skills behind each role.";
  if (/start|path|career|direction/.test(text))
    return "Choose your major in Explore, then tap a role to see its skills. Save a role you like and pick an activity to try.";
  return "This demo has prewritten replies. Try asking about career paths, skills, or activities.";
}
function sendQuestion(question) {
  const value = question.trim().slice(0, 500);
  if (!value) return;
  showView("advisor");
  addMessage(value, "user");
  addMessage(replyTo(value), "advisor");
  $("#chat-input").value = "";
  $("#chat-input").focus({ preventScroll: true });
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
  if (button.dataset.save) {
    const id = button.dataset.save;
    const restoreDetailFocus = button.closest("#role-detail");
    if (saved.has(id)) saved.delete(id);
    else saved.add(id);
    const stored = persist("careergraph.saved", saved);
    renderDetail();
    renderSaved();
    if (restoreDetailFocus)
      $("#role-detail [data-save]").focus({ preventScroll: true });
    else if (currentView === "saved") {
      const target = $("#saved-roles button");
      if (target) target.focus({ preventScroll: true });
    }
    if (stored)
      notify(
        saved.has(id)
          ? "Role saved."
          : "Role removed.",
      );
  }
  if (button.dataset.openRole) openRole(button.dataset.openRole);
  if (button.dataset.prompt) sendQuestion(button.dataset.prompt);
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
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuestion($("#chat-input").value);
});
$("#clear-chat").addEventListener("click", resetChat);
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
renderSaved();
resetChat();
showView(pages[location.hash.slice(1)] ? location.hash.slice(1) : "discover");
