"use strict";

const $ = (selector) => document.querySelector(selector);
let currentView = "discover";
let toastTimer;
function notify(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
const pages = {
  discover: ["Discover", "Your next chapter starts here.", "Explore paths taken by alumni in your major."],
  resume: ["Resume", "Shape the resume.", "The file you uploaded, with a chat beside it."],
  connect: ["Connect", "Find a shared starting point.", "Meet alumni with a similar background and careers that interest you."],
};
function showView(view) {
  if (view === "engagement") view = "connect";
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
  if (view === "connect") loadConnect();
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0 });
  $("#main").focus({ preventScroll: true });
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (button) showView(button.dataset.view);
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
document.addEventListener("DOMContentLoaded", () => showView(location.hash.slice(1) || "discover"));
