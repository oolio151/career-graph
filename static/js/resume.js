"use strict";

const resumeEscape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]),
  );

const resumeCsrf = document.querySelector('meta[name="csrf-token"]').content;
let resumeLoaded = false;
let engineLabel = "Resume chat";
const resumeStudentId = document.body.dataset.studentId;

async function resumeApi(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (response.status === 401) {
    location.assign("/");
    throw new Error("Your session ended.");
  }
  if (!response.ok) throw new Error(data.error || "Could not load this information. Please try again.");
  return data;
}

async function loadEngineLabel() {
  try {
    const config = await resumeApi("/api/resume/chat/config");
    engineLabel = config.engine === "gemini" ? `Gemini · ${config.model}` : "On-device rules";
    const note = config.engine === "gemini"
      ? "Replies come from Google Gemini, grounded in synthetic alumni records on this server. Not a promise about hiring."
      : "No API key set, so replies come from on-device rules over synthetic alumni records. Not a promise about hiring.";
    document.querySelector("#advisor-engine").textContent = engineLabel;
    document.querySelector("#advisor-engine-dot").classList.add(config.engine === "gemini" ? "live" : "offline");
    document.querySelector("#resume-chat-note").textContent = note;
  } catch {
    document.querySelector("#advisor-engine").textContent = "On-device rules";
    document.querySelector("#advisor-engine-dot").classList.add("offline");
  }
}

function resumeMessage(text, sender, suggestion, engine) {
  const log = document.querySelector("#resume-messages");
  const message = document.createElement("div");
  message.className = `message ${sender === "user" ? "user" : "advisor"}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = sender === "user" ? "You" : engine || engineLabel;
  const body = document.createElement("p");
  body.textContent = text;
  message.append(label, body);
  if (suggestion) {
    const line = document.createElement("p");
    line.className = "resume-suggestion";
    line.textContent = suggestion;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "secondary-button";
    const sheet = document.querySelector("#resume-sheet");
    action.textContent = sheet ? "Add to resume" : "Copy line";
    action.addEventListener("click", async () => {
      if (sheet) {
        const paragraph = document.createElement("p");
        paragraph.textContent = suggestion;
        sheet.append(paragraph);
        paragraph.scrollIntoView({ block: "nearest" });
        action.textContent = "Added";
        action.disabled = true;
        return;
      }
      try {
        await navigator.clipboard.writeText(suggestion);
        action.textContent = "Copied";
      } catch {
        action.textContent = "Select the line above";
      }
    });
    message.append(line, action);
  }
  log.append(message);
  log.scrollTop = log.scrollHeight;
  return message;
}

function showPending() {
  const log = document.querySelector("#resume-messages");
  const pending = document.createElement("div");
  pending.className = "message advisor pending";
  pending.id = "resume-pending";
  pending.innerHTML = '<span class="message-label"></span><span class="pending-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Advisor is writing a reply</span>';
  pending.querySelector(".message-label").textContent = engineLabel;
  log.append(pending);
  log.scrollTop = log.scrollHeight;
}

function clearPending() {
  document.querySelector("#resume-pending")?.remove();
}

function renderResumeFile(preview) {
  document.querySelector("#resume-filename").textContent = preview.filename;
  const canvas = document.querySelector("#resume-canvas");
  const note = document.querySelector("#resume-file-note");
  if (preview.extension === ".pdf") {
    note.textContent = "Original PDF. The chat reads any words it can extract from the file.";
    const src = `/api/resume/view/${encodeURIComponent(preview.filename)}`;
    canvas.innerHTML = `<iframe class="resume-frame" title="${resumeEscape(preview.filename)}" src="${src}"></iframe>`;
    return;
  }
  note.textContent = "Click the page to edit. This copy stays in the browser until you leave.";
  const paragraphs = preview.paragraphs.length ? preview.paragraphs : ["This file has no readable text yet."];
  canvas.innerHTML = `<article class="resume-sheet" id="resume-sheet" contenteditable="true" spellcheck="true" aria-label="Editable resume text">${paragraphs.map((line) => `<p>${resumeEscape(line)}</p>`).join("")}</article>`;
}

function showResumeUpload() {
  document.querySelector("#resume-upload-prompt").hidden = false;
  document.querySelector("#resume-canvas").hidden = true;
  document.querySelector("#resume-filename").textContent = "No resume uploaded";
  document.querySelector("#resume-file-note").textContent = "Upload a file below to open Resume Studio.";
  document.querySelector(".resume-stage-bar a").hidden = true;
}

async function loadResume() {
  if (resumeLoaded) return;
  resumeLoaded = true;
  await loadEngineLabel();
  try {
    const session = await resumeApi("/api/session");
    if (!session.resume || !session.resume.filename) {
      showResumeUpload();
      resumeMessage("Upload a resume to preview it and ask for suggestions.", "advisor");
      return;
    }
    const preview = await resumeApi("/api/resume/preview");
    renderResumeFile(preview);
    resumeMessage(
      preview.extension === ".pdf"
        ? `${preview.filename} is on the right. Ask what to add, or how it compares with first jobs in your major.`
        : `${preview.filename} is on the right. Click the page to edit it, or ask what to add.`,
      "advisor",
    );
  } catch (error) {
    resumeLoaded = false;
    document.querySelector("#resume-file-note").textContent = error.message || "Could not open the resume.";
  }
}

document.querySelector("#resume-upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = document.querySelector("#resume-upload-file").files[0];
  const status = document.querySelector("#resume-upload-status");
  const button = form.querySelector("button");
  if (!file || !file.size || file.size > 5 * 1024 * 1024) {
    status.textContent = "Choose a nonempty resume smaller than 5 MB.";
    return;
  }
  const body = new FormData();
  body.set("campus_id", resumeStudentId);
  body.set("resume", file);
  button.disabled = true;
  status.textContent = "Uploading…";
  try {
    const data = await resumeApi("/api/enroll", { method: "POST", headers: { "X-CSRF-Token": resumeCsrf }, body });
    status.textContent = "Resume uploaded.";
    form.reset();
    document.querySelector("#resume-upload-prompt").hidden = true;
    document.querySelector("#resume-canvas").hidden = false;
    document.querySelector(".resume-stage-bar a").hidden = false;
    resumeLoaded = false;
    await loadResume();
  } catch (error) {
    status.textContent = error.message || "Upload failed. Try again.";
  } finally {
    button.disabled = false;
  }
});

async function sendResumeChat(question) {
  const value = question.trim().slice(0, 500);
  if (!value) return;
  resumeMessage(value, "user");
  document.querySelector("#resume-chat-input").value = "";
  const button = document.querySelector("#resume-chat-form button");
  button.disabled = true;
  showPending();
  try {
    const data = await resumeApi("/api/resume/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": resumeCsrf },
      body: JSON.stringify({ message: value }),
    });
    clearPending();
    const engine = data.source === "gemini" ? `Gemini · ${data.model}` : "On-device rules";
    resumeMessage(data.reply, "advisor", data.suggestion, engine);
    if (data.note) {
      const note = document.querySelector("#resume-chat-note");
      note.textContent = `${data.note} Answered by on-device rules instead.`;
    }
  } catch (error) {
    clearPending();
    resumeMessage(error.message || "Could not answer that. Try again.", "advisor");
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#resume-chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendResumeChat(document.querySelector("#resume-chat-input").value);
});
document.querySelectorAll("[data-resume-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendResumeChat(button.dataset.resumePrompt));
});

if (location.hash === "#resume") loadResume();
