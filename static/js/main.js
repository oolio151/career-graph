"use strict";

// Presentation fixtures only. Replace with dataset-backed API responses later.
const roles = {
  software: {
    title: "Software Engineer",
    group: "engineering",
    stage: "First chapter",
    salary: "$75k – $110k",
    description:
      "Turn ideas into useful software. Build the applications and systems people rely on every day.",
    skills: ["Python", "Data structures", "Git", "Problem solving"],
  },
  frontend: {
    title: "Frontend Developer",
    group: "engineering",
    stage: "First chapter",
    salary: "$70k – $105k",
    description:
      "Bring thoughtful digital experiences to life, connecting visual design with accessible, interactive interfaces.",
    skills: ["JavaScript", "HTML & CSS", "Accessibility", "UI development"],
  },
  analyst: {
    title: "Data Analyst",
    group: "data",
    stage: "First chapter",
    salary: "$60k – $90k",
    description:
      "Find the story in the numbers. Turn complex information into clear insights that help teams make decisions.",
    skills: ["SQL", "Python", "Visualization", "Statistics"],
  },
  senior: {
    title: "Senior Software Engineer",
    group: "engineering",
    stage: "Next chapter",
    salary: "$115k – $160k",
    description:
      "Take on larger technical challenges, shape reliable systems, and help other engineers do their best work.",
    skills: ["System design", "Architecture", "Mentoring", "Testing"],
  },
  product: {
    title: "Product Engineer",
    group: "engineering",
    stage: "Next chapter",
    salary: "$100k – $145k",
    description:
      "Connect user needs with technical possibilities. Own features from the first conversation to the finished experience.",
    skills: ["Full-stack development", "User research", "Prototyping"],
  },
  scientist: {
    title: "Data Scientist",
    group: "data",
    stage: "Next chapter",
    salary: "$95k – $140k",
    description:
      "Ask deeper questions of data, design experiments, and build models that help make sense of complex problems.",
    skills: ["Machine learning", "Statistics", "Python", "Experimentation"],
  },
  systems: {
    title: "Systems Analyst",
    group: "engineering",
    stage: "First chapter",
    salary: "$65k – $95k",
    description:
      "Understand how people and technology work together, then design better systems for the problems that matter.",
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
      "Keep people connected and organizations running through reliable infrastructure and thoughtful technical support.",
    skills: ["Networking", "Troubleshooting", "Security", "Linux"],
  },
  architect: {
    title: "Solutions Architect",
    group: "engineering",
    stage: "Next chapter",
    salary: "$110k – $155k",
    description:
      "Design the bigger picture: connect systems, translate business needs, and guide technical decisions across a team.",
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
      "Help teams turn plans into working technology by connecting the right people, priorities, and resources.",
    skills: ["Planning", "Agile methods", "Leadership", "Risk management"],
  },
};
const pathways = {
  cs: ["software", "frontend", "analyst", "senior", "product", "scientist"],
  is: ["systems", "it", "analyst", "architect", "manager", "scientist"],
};
const activities = [
  {
    id: "hackathon",
    name: "Build at a hackathon",
    type: "HANDS-ON LEARNING",
    icon: "code",
    color: "peach",
    description: "A weekend of ideas. A project you can point to.",
    connection: "Engineering pathways",
    skills: ["Prototyping", "Teamwork", "Git"],
    next: "Pick a small problem, build a working demo, and document what you learned. Your project does not need to win to be worth sharing.",
    role: "software",
  },
  {
    id: "research",
    name: "Get into research",
    type: "CURIOSITY IN ACTION",
    icon: "search",
    color: "purple",
    description: "Go deeper into a question that interests you.",
    connection: "Data & analytics pathways",
    skills: ["Python", "Analysis", "Experimentation"],
    next: "Find a research area you enjoy, read about a lab’s work, and prepare a short introduction describing what you want to learn.",
    role: "scientist",
  },
  {
    id: "community",
    name: "Find your people",
    type: "CAMPUS CONNECTIONS",
    icon: "people",
    color: "green",
    description: "Learn together. Make things. Grow your circle.",
    connection: "Skills for every pathway",
    skills: ["Communication", "Leadership", "Collaboration"],
    next: "Explore a student organization, attend an open meeting, and volunteer for a small project that gives you a chance to contribute.",
    role: "product",
  },
];
const $ = (selector) => document.querySelector(selector);
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
function readIds(key, valid) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id) => valid.includes(id)) : [],
    );
  } catch {
    return new Set();
  }
}
const saved = readIds("careergraph.saved", Object.keys(roles));
const planned = readIds(
  "careergraph.activities",
  activities.map((a) => a.id),
);
let major = "cs";
let selectedRole = "software";
let filter = "all";
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
    localStorage.setItem(key, JSON.stringify([...values]));
    return true;
  } catch {
    notify("Saved for this session. Browser storage is unavailable.");
    return false;
  }
}
const pages = {
  explore: [
    "Explore pathways",
    "Your future, <em>connected.</em>",
    "Connect what you’re learning to who you could become.",
  ],
  engagement: [
    "My engagement",
    "Small steps. <em>More possibilities.</em>",
    "Find experiences that help you grow toward your next chapter.",
  ],
  advisor: [
    "AI advisor",
    "Let’s find <em>your direction.</em>",
    "A little reflection can turn a big question into a next step.",
  ],
  saved: [
    "Saved pathways",
    "The paths that <em>caught your eye.</em>",
    "A collection of possibilities, with room to change your mind.",
  ],
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
  $("#breadcrumb-current").textContent = pages[view][0];
  $("#page-title").innerHTML = pages[view][1];
  $("#page-description").textContent = pages[view][2];
  $(".page-heading > .primary-button").hidden = view === "advisor";
  $("#sidebar").classList.remove("open");
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  $("#menu-toggle").setAttribute("aria-label", "Open navigation");
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
      return `<button class="role-node ${id === selectedRole ? "selected" : ""} ${muted ? "muted" : ""}" data-role="${id}" data-column="${i > 2 ? 1 : 0}" data-row="${i % 3}" aria-pressed="${id === selectedRole}" ${muted ? "disabled" : ""}><strong>${role.title}</strong><span><i></i>${i < 3 ? "Explore this role" : "Grow into this role"}</span></button>`;
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
    `<div class="detail-top"><span class="role-type">${role.stage.toUpperCase()}</span><button class="icon-button ${isSaved ? "bookmarked" : ""}" data-save="${selectedRole}" aria-label="${isSaved ? "Unsave" : "Save"} ${role.title}" aria-pressed="${isSaved}">${icon("bookmark")}</button></div><h3>${role.title}</h3><p class="detail-description">${role.description}</p><div class="salary"><span>Illustrative annual salary</span><strong>${role.salary}<small> / yr</small></strong><span>Example range · Not a forecast</span></div><div class="skills-block"><p class="skills-title">Skills you could build</p><div class="tags">${role.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div></div><button class="primary-button" data-prompt="How can I explore becoming a ${role.title}?">Explore this path ${icon("arrow")}</button><p class="detail-note">Your path doesn’t have to be a straight line.</p>`;
}
function renderActivities() {
  $("#experience-preview").innerHTML = activities
    .map(
      (a) =>
        `<button class="experience-card" data-activity="${a.id}"><span class="experience-top"><span class="metric-icon ${a.color}">${icon(a.icon)}</span><span>↗</span></span><span class="experience-type">${a.type}</span><h3>${a.name}</h3><p>${a.description}</p><span class="experience-bottom">${a.connection}<span>↗</span></span></button>`,
    )
    .join("");
  $("#engagement-grid").innerHTML = activities
    .map(
      (a) =>
        `<article class="experience-card" id="activity-${a.id}" tabindex="-1"><div class="experience-top"><span class="metric-icon ${a.color}">${icon(a.icon)}</span><span>↗</span></div><span class="experience-type">${a.type}</span><h3>${a.name}</h3><p>${a.description}</p><div class="tags">${a.skills.map((skill) => `<span class="tag">${skill}</span>`).join("")}</div><div class="activity-details"><h4>A place to start</h4><p>${a.next}</p><button class="inline-link" data-open-role="${a.role}">Explore ${roles[a.role].title} ↗</button></div><button class="activity-toggle" data-plan="${a.id}" aria-pressed="${planned.has(a.id)}">${planned.has(a.id) ? "✓ Added to my interests" : "+ Add to my interests"}</button></article>`,
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
    : `<div class="empty-state">${icon("bookmark")}<h3>Something will spark your curiosity.</h3><p>Save a role from the pathway map and find it here whenever you’re ready.</p><button class="primary-button" data-view="explore">Explore the possibilities ${icon("arrow")}</button></div>`;
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
  label.textContent = sender === "user" ? "YOU" : "ADVISOR · SCRIPTED PREVIEW";
  message.append(label, document.createTextNode(text));
  $("#chat-messages").append(message);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
}
function resetChat() {
  $("#chat-messages").replaceChildren();
  addMessage(
    "Welcome! Your career path can take more than one shape. This preview can help you explore roles, skills, and campus experiences.\n\nWhat would you like to think through?",
    "advisor",
  );
}
function replyTo(question) {
  const text = question.toLowerCase();
  const mentionedRole = Object.values(roles)
    .sort((a, b) => b.title.length - a.title.length)
    .find((role) => text.includes(role.title.toLowerCase()));
  if (mentionedRole)
    return `Curious about ${mentionedRole.title}? Start by exploring ${mentionedRole.skills.slice(0, 3).join(", ")}.\n\nTry a small project that lets you practice one of these skills, then reflect on which parts you enjoy. Save the role in your pathway map to come back to it.\n\nThis is a prewritten exploration prompt. Dataset-based recommendations are not connected yet.`;
  if (/skill|learn|course/.test(text))
    return `For the ${roles[selectedRole].title} role currently selected in your map, our example skills are ${roles[selectedRole].skills.join(", ")}.\n\nChoose one unfamiliar skill and a small project to practice it. A future version will compare coursework with role requirements; this preview has not analyzed your transcript.`;
  if (/experience|club|research|hackathon|engage/.test(text))
    return "You can explore three example experiences in My engagement: a hackathon for hands-on building, research for asking deeper questions, or a student organization for collaboration.\n\nChoose something you would enjoy doing consistently and add it to your interests. These are illustrative connections, not measured employment outcomes.";
  if (/salary|money|roi|cost|pay/.test(text))
    return "The salary ranges in this prototype are illustrative placeholders. They are not estimates from the track data or current salary research.\n\nA future advisor could compare degree costs and outcome distributions with explicit assumptions. For now, explore the day-to-day work and skills behind a role.";
  if (/start|path|career|direction/.test(text))
    return "Start with curiosity: choose your major in Explore pathways, select a role, and look through its example skills. Save anything that catches your attention.\n\nThen visit My engagement and choose one experience you would like to try. You can explore a direction without committing to it.";
  return "Thanks for sharing that. This scripted preview cannot yet answer open-ended questions or analyze your personal circumstances.\n\nTry asking about career paths, skills to build, or campus experiences. The future AI advisor will use the track dataset and show the records behind its suggestions.";
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
          ? "Role added to your saved pathways."
          : "Role removed from saved pathways.",
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
$("#menu-toggle").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
  $("#menu-toggle").setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#sidebar").classList.contains("open")) {
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    $("#menu-toggle").setAttribute("aria-label", "Open navigation");
    $("#menu-toggle").focus();
  }
});
document.addEventListener("click", (event) => {
  if (
    !event.target.closest("#sidebar, #menu-toggle") &&
    $("#sidebar").classList.contains("open")
  ) {
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    $("#menu-toggle").setAttribute("aria-label", "Open navigation");
  }
});
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
renderGraph();
renderActivities();
renderSaved();
resetChat();
if (pages[location.hash.slice(1)]) showView(location.hash.slice(1));
