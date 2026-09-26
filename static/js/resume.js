"use strict";

const resumeEscape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]),
  );

const resumeCsrf = document.querySelector('meta[name="csrf-token"]').content;
let resumeLoaded = false;

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

function resumeMessage(text, sender, suggestion) {
  const log = document.querySelector("#resume-messages");
  const message = document.createElement("div");
  message.className = `message ${sender === "user" ? "user" : "advisor"}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = sender === "user" ? "You" : "Resume chat";
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

async function loadResume() {
  if (resumeLoaded) return;
  resumeLoaded = true;
  try {
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

async function sendResumeChat(question) {
  const value = question.trim().slice(0, 500);
  if (!value) return;
  resumeMessage(value, "user");
  document.querySelector("#resume-chat-input").value = "";
  const button = document.querySelector("#resume-chat-form button");
  button.disabled = true;
  try {
    const data = await resumeApi("/api/resume/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": resumeCsrf },
      body: JSON.stringify({ message: value }),
    });
    resumeMessage(data.reply, "advisor", data.suggestion);
  } catch (error) {
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
