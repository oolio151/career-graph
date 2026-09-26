"use strict";
const $ = (selector) => document.querySelector(selector);
const profile = JSON.parse($("#initial-profile").textContent || "null");
let choices = [],
  configured = false,
  busy = false,
  operation = 0,
  controller = null,
  lastResult = null;
const profileMajor = profile?.major === "Information Systems" ? "is" : "cs";
const query = new URLSearchParams(location.search);
$("#resume-major").value = ["cs", "is"].includes(query.get("major"))
  ? query.get("major")
  : profileMajor;

function status(message, error = false) {
  $("#resume-status").textContent = message;
  $("#resume-status").classList.toggle("error", error);
}
function updateSubmit() {
  $("#resume-submit").disabled =
    busy || !configured || !$("#resume-role").value;
}
function setBusy(value, message = "") {
  busy = value;
  $("#resume-fields").disabled = value;
  $("#resume-major").disabled = Boolean($("#resume-include-profile")?.checked);
  $("#resume-pending").hidden = !value;
  $("#resume-pending-label").textContent = message;
  updateSubmit();
}
function invalidate() {
  lastResult = null;
  $("#resume-results").hidden = true;
  $("#resume-review-copy").replaceChildren();
  $("#resume-lines").replaceChildren();
  $("#resume-character-count").textContent =
    `${$("#resume-text").value.length.toLocaleString()} / 16,000`;
}
function renderRoles(preferred = "") {
  const roles = choices.filter((role) =>
    role.majors.includes($("#resume-major").value),
  );
  $("#resume-role").replaceChildren(new Option("Choose a career role", ""));
  roles.forEach((role) =>
    $("#resume-role").add(
      new Option(`${role.title} · ${role.family}`, role.id),
    ),
  );
  $("#resume-role").disabled = !roles.length;
  if (roles.some((role) => role.id === preferred))
    $("#resume-role").value = preferred;
  updateSubmit();
}
async function responseJSON(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.error || `Request failed (${response.status}). Please try again.`,
    );
  return body;
}
async function loadOptions() {
  $("#resume-retry-options").hidden = true;
  status("Loading available career pathways…");
  const setupController = new AbortController();
  const timeout = setTimeout(() => setupController.abort(), 30000);
  try {
    const [options, provider] = await Promise.all([
      fetch("/api/options", { signal: setupController.signal }).then(
        responseJSON,
      ),
      fetch("/api/advisor/status", { signal: setupController.signal }).then(
        responseJSON,
      ),
    ]);
    choices = options.roles;
    configured = provider.configured;
    $("#resume-provider").textContent = configured
      ? "GEMINI · DATASET CONTEXT"
      : "GEMINI NOT CONFIGURED";
    renderRoles(query.get("role"));
    status(
      configured
        ? "Choose a pathway, then upload or paste your resume."
        : "Resume review requires a Gemini key and model configured on the server.",
      !configured,
    );
  } catch (error) {
    status(
      error.name === "AbortError"
        ? "Loading pathways timed out. Please retry."
        : error.message,
      true,
    );
    $("#resume-provider").textContent = "SETUP UNAVAILABLE";
    $("#resume-retry-options").hidden = false;
  } finally {
    clearTimeout(timeout);
  }
}
async function runRequest(path, options, message) {
  const version = ++operation;
  controller?.abort();
  const activeController = new AbortController();
  controller = activeController;
  const timeout = setTimeout(() => activeController.abort(), path === '/api/resume/review' ? 90000 : 60000);
  setBusy(true, message);
  status("");
  try {
    const result = await fetch(path, {
      ...options,
      signal: activeController.signal,
    }).then(responseJSON);
    return version === operation ? result : null;
  } catch (error) {
    if (version === operation)
      status(
        error.name === "AbortError"
          ? "The request timed out. Your text is still here; try again."
          : error.message,
        true,
      );
    return null;
  } finally {
    clearTimeout(timeout);
    if (version === operation) setBusy(false);
  }
}
async function upload(file) {
  if (!file || busy) return;
  if (
    !/\.(pdf|docx|txt)$/i.test(file.name) ||
    file.size > 2 * 1024 * 1024 ||
    !file.size
  ) {
    status("Choose a nonempty PDF, DOCX, or TXT file under 2 MB.", true);
    return;
  }
  invalidate();
  const body = new FormData();
  body.append("resume", file);
  const result = await runRequest(
    "/api/resume/extract",
    { method: "POST", body },
    "Reading your resume…",
  );
  $("#resume-file").value = "";
  if (result) {
    $("#resume-text").value = result.text;
    invalidate();
    status(
      "Text extracted. Check it for accuracy before sending it to Gemini.",
    );
    $("#resume-text").focus();
  }
}
function addTags(target, values, empty) {
  const container = $(target);
  container.replaceChildren();
  if (!values.length) {
    container.textContent = empty;
    return;
  }
  values.forEach((value) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = value;
    container.append(tag);
  });
}
function element(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function showResult(result) {
  lastResult = result;
  const matches = result.matches;
  $("#resume-review-copy").textContent = result.review;
  $("#resume-result-context").textContent =
    `${result.role.title} · ${result.model} · Synthetic career snapshot ${result.snapshot}`;
  addTags(
    "#resume-mentioned",
    matches.resume_skill_mentions,
    "No literal role-skill matches found.",
  );
  addTags(
    "#resume-unmentioned",
    matches.role_skills_not_mentioned,
    "All recorded role-skill names were mentioned.",
  );
  $("#resume-cohort").textContent =
    `${matches.cohort} ${matches.cohort_count} alumni in this cohort; ${matches.matching_count} share at least one detected skill.`;
  $("#resume-method").textContent = matches.method;
  $("#resume-alumni").replaceChildren();
  if (!matches.examples.length)
    $("#resume-alumni").append(
      element(
        "p",
        "No alumni in this cohort share the detected role-skill mentions. No matches have been inferred.",
        "resume-hint",
      ),
    );
  matches.examples.forEach((alum) => {
    const card = element("article", "", "resume-panel");
    card.append(
      element("span", "SYNTHETIC ALUMNI EXAMPLE", "role-type"),
      element("h3", alum.campus_id),
      element(
        "p",
        `${alum.track} · Class of ${alum.graduation_year}`,
        "resume-hint",
      ),
      element("h4", `${alum.shared_count} shared skill mentions`),
      element("p", alum.shared_skills.join(" · "), "resume-hint"),
      element(
        "p",
        `Supporting completed courses: ${alum.course_ids.join(", ")}`,
        "resume-hint",
      ),
      element("h4", "Observed career history"),
    );
    const history = document.createElement("ol");
    alum.pathway.forEach((job) =>
      history.append(element("li", `${job.role} · ${job.start}`)),
    );
    card.append(
      history,
      element("h4", "Activities, shown separately"),
      element(
        "p",
        alum.activities.join(" · ") || "No activities recorded.",
        "resume-hint",
      ),
      element(
        "p",
        `Sources: ${alum.source_ids.map((id) => `[${id}]`).join(" ")}`,
        "resume-hint",
      ),
    );
    $("#resume-alumni").append(card);
  });
  $("#resume-sources").replaceChildren();
  result.sources.forEach((source) =>
    $("#resume-sources").append(
      element(
        "li",
        `[${source.id}] ${source.file} · ${source.count} records/participants. ${source.scope} Example IDs: ${source.record_ids.join(", ") || "None"}`,
      ),
    ),
  );
  $("#resume-lines").replaceChildren();
  result.resume_lines.forEach((line) =>
    $("#resume-lines").append(element("li", `[${line.id}] ${line.text}`)),
  );
  $("#resume-results").hidden = false;
  $("#resume-results-title").focus();
  $("#resume-results").scrollIntoView({ block: "start" });
  status(
    "Review ready. Check suggestions against your actual experience before using them.",
  );
}
$("#resume-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !configured || !$("#resume-form").reportValidity()) return;
  const text = $("#resume-text").value.replace(/\x00/g, "").trim();
  if (text.length < 80 || text.length > 16000) {
    status("Use between 80 and 16,000 characters of resume text.", true);
    return;
  }
  invalidate();
  const result = await runRequest(
    "/api/resume/review",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        major: $("#resume-major").value,
        role: $("#resume-role").value,
        include_profile: Boolean($("#resume-include-profile")?.checked),
      }),
    },
    "Gemini is reviewing your resume and comparing pathway evidence…",
  );
  if (result) showResult(result);
});
$("#resume-file").addEventListener("change", (event) =>
  upload(event.target.files[0]),
);
$("#resume-dropzone").addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!busy) $("#resume-dropzone").classList.add("dragging");
});
$("#resume-dropzone").addEventListener("dragleave", () =>
  $("#resume-dropzone").classList.remove("dragging"),
);
$("#resume-dropzone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("#resume-dropzone").classList.remove("dragging");
  if (event.dataTransfer.files.length !== 1) {
    status("Drop one resume at a time.", true);
    return;
  }
  upload(event.dataTransfer.files[0]);
});
$("#resume-text").addEventListener("input", invalidate);
$("#resume-major").addEventListener("change", () => {
  invalidate();
  renderRoles();
});
$("#resume-role").addEventListener("change", () => {
  invalidate();
  updateSubmit();
});
$("#resume-include-profile")?.addEventListener("change", () => {
  if ($("#resume-include-profile").checked) {
    $("#resume-major").value = profileMajor;
    renderRoles($("#resume-role").value);
  }
  $("#resume-major").disabled = $("#resume-include-profile").checked;
  invalidate();
});
$("#resume-clear").addEventListener("click", () => {
  ++operation;
  controller?.abort();
  $("#resume-form").reset();
  $("#resume-major").value = profileMajor;
  setBusy(false);
  renderRoles();
  invalidate();
  status("Resume text and review cleared.");
});
$("#resume-retry-options").addEventListener("click", loadOptions);
$("#resume-copy").addEventListener("click", async () => {
  if (!lastResult) return;
  try {
    await navigator.clipboard.writeText(lastResult.review);
    status("Review copied.");
  } catch {
    status(
      "Clipboard access is unavailable. Select the review text to copy it, or download the notes.",
      true,
    );
  }
});
$("#resume-download").addEventListener("click", () => {
  if (!lastResult) return;
  const content = `${lastResult.role.title} — Resume review\nSynthetic career evidence, ${lastResult.snapshot}\n\n${lastResult.review}\n\nSource context\n${lastResult.sources.map((s) => `[${s.id}] ${s.file}: ${s.scope} Examples: ${s.record_ids.join(", ")}`).join("\n")}`;
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "careergraph-resume-review.txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
loadOptions();
