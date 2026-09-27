"use strict";

const resumeEscape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]),
  );

const resumeCsrf = document.querySelector('meta[name="csrf-token"]').content;
let resumeLoaded = false;
const resumeStudentId = document.body.dataset.studentId;
let resumePreview = null;
let originalResumeText = "";
let draftResumeText = "";
let activeResumeView = "draft";
let latexSource = "";
let renderedPdfUrl = "";

const latexEscape = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .replace(/\\/g, "\\textbackslash{}")
  .replace(/([#$%&_{}])/g, "\\$1")
  .replace(/\^/g, "\\textasciicircum{}")
  .replace(/~/g, "\\textasciitilde{}");

function draftToLatex(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = latexEscape(lines.shift() || "Your Name");
  const contact = latexEscape(lines.shift() || "email@example.com | linkedin.com/in/you | github.com/you");
  const sectionNames = new Set(["Education", "Experience", "Projects", "Technical Skills", "Leadership", "Skills", "Research"]);
  let body = "";
  let listOpen = false;
  for (const raw of lines) {
    const normalized = raw.replace(/:$/, "");
    if (sectionNames.has(normalized)) {
      if (listOpen) body += "\\resumeItemListEnd\n";
      body += `\n\\section{${latexEscape(normalized)}}\n\\resumeItemListStart\n`;
      listOpen = true;
    } else {
      if (!listOpen) { body += "\\section{Profile}\n\\resumeItemListStart\n"; listOpen = true; }
      body += `  \\resumeItem{${latexEscape(raw)}}\n`;
    }
  }
  if (listOpen) body += "\\resumeItemListEnd\n";
  return `\\documentclass[letterpaper,11pt]{article}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}
\\raggedbottom
\\raggedright
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=0.18in]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}
\\begin{document}
\\begin{center}
  \\textbf{\\Huge \\scshape ${name}} \\\\ \\vspace{2pt}
  \\small ${contact}
\\end{center}
${body}
\\end{document}
`;
}

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

function resumeMessage(text, sender, suggestion, ai = false) {
  const log = document.querySelector("#resume-messages");
  const message = document.createElement("div");
  message.className = `message ${sender === "user" ? "user" : "advisor"}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = sender === "user" ? "You" : (ai ? "Gemini · grounded" : "Resume chat");
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
    action.textContent = "Apply change";
    action.addEventListener("click", () => {
      const existing = currentDraft();
      draftResumeText = `${existing.trimEnd()}${existing.trim() ? "\n" : ""}${suggestion}`;
      if (activeResumeView !== "draft") setResumeView("draft");
      const editor = document.querySelector("#resume-draft");
      editor.value = draftResumeText;
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
      updateChangeCount();
      action.textContent = "Applied";
      action.disabled = true;
    });
    message.append(line, action);
  }
  log.append(message);
  log.scrollTop = log.scrollHeight;
}

function currentDraft() {
  return document.querySelector("#resume-draft")?.value ?? draftResumeText;
}

function diffLines(before, after) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { changes.push(["same", a[i]]); i++; j++; }
    else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) { changes.push(["add", b[j++]]); }
    else { changes.push(["remove", a[i++]]); }
  }
  return changes;
}

function updateChangeCount() {
  draftResumeText = currentDraft();
  const count = diffLines(originalResumeText, draftResumeText).filter(([type]) => type !== "same").length;
  document.querySelector("#resume-change-count").textContent = count;
}

function renderResumeView() {
  const canvas = document.querySelector("#resume-canvas");
  const note = document.querySelector("#resume-file-note");
  if (activeResumeView === "draft") {
    note.textContent = "Your editable working copy. AI changes are applied only when you approve them.";
    canvas.innerHTML = `<textarea class="resume-draft" id="resume-draft" spellcheck="true" aria-label="Editable resume draft">${resumeEscape(draftResumeText)}</textarea>`;
    document.querySelector("#resume-draft").addEventListener("input", updateChangeCount);
  } else if (activeResumeView === "changes") {
    note.textContent = "Review every line changed from the uploaded resume.";
    const rows = diffLines(originalResumeText, draftResumeText).map(([type, line]) =>
      `<div class="diff-line ${type}"><span aria-hidden="true">${type === "add" ? "+" : type === "remove" ? "−" : " "}</span><code>${resumeEscape(line || " ")}</code></div>`).join("");
    canvas.innerHTML = `<div class="resume-diff" aria-label="Resume changes">${rows}</div>`;
  } else if (activeResumeView === "latex") {
    note.textContent = "Edit the LaTeX source, then render a fresh PDF preview.";
    canvas.innerHTML = `<textarea class="latex-editor" id="latex-editor" spellcheck="false" aria-label="LaTeX resume source">${resumeEscape(latexSource)}</textarea>`;
    document.querySelector("#latex-editor").addEventListener("input", (event) => { latexSource = event.target.value; });
  } else if (activeResumeView === "preview") {
    note.textContent = renderedPdfUrl ? "Rendered from the current LaTeX source." : "Render the LaTeX source to create a PDF preview.";
    canvas.innerHTML = renderedPdfUrl
      ? `<iframe class="resume-frame" title="Rendered resume PDF" src="${renderedPdfUrl}"></iframe>`
      : `<div class="render-empty"><strong>No rendered PDF yet.</strong><p>Select LaTeX to edit the source, then choose Render PDF.</p></div>`;
  } else if (resumePreview.extension === ".pdf") {
    note.textContent = "Your untouched uploaded PDF.";
    canvas.innerHTML = `<iframe class="resume-frame" title="${resumeEscape(resumePreview.filename)}" src="/api/resume/view/${encodeURIComponent(resumePreview.filename)}"></iframe>`;
  } else {
    note.textContent = "Your untouched uploaded text.";
    canvas.innerHTML = `<pre class="resume-original">${resumeEscape(originalResumeText)}</pre>`;
  }
}

function setResumeView(view) {
  if (activeResumeView === "draft") draftResumeText = currentDraft();
  if (activeResumeView === "latex") latexSource = document.querySelector("#latex-editor")?.value ?? latexSource;
  activeResumeView = view;
  document.querySelectorAll("[data-resume-view]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.resumeView === view));
  });
  renderResumeView();
  updateChangeCount();
}

function renderResumeFile(preview) {
  resumePreview = preview;
  originalResumeText = preview.text || preview.paragraphs.join("\n");
  draftResumeText = originalResumeText;
  latexSource = draftToLatex(draftResumeText);
  document.querySelector("#resume-filename").textContent = preview.filename;
  activeResumeView = "draft";
  setResumeView("draft");
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
      `${preview.filename} is now an editable draft. Ask for improvements, apply the ones you want, then review Changes.`,
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
  try {
    const data = await resumeApi("/api/resume/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": resumeCsrf },
      body: JSON.stringify({ message: value, draft: currentDraft() }),
    });
    resumeMessage(data.reply, "advisor", data.suggestion, data.ai);
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
document.querySelectorAll("[data-resume-view]").forEach((button) => {
  button.addEventListener("click", () => setResumeView(button.dataset.resumeView));
});
document.querySelector("#download-draft").addEventListener("click", () => {
  draftResumeText = currentDraft();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([draftResumeText], { type: "text/plain;charset=utf-8" }));
  link.download = `${(resumePreview?.filename || "resume").replace(/\.[^.]+$/, "")}-draft.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
});
document.querySelector("#render-latex").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (activeResumeView === "draft") {
    draftResumeText = currentDraft();
    latexSource = draftToLatex(draftResumeText);
  } else if (activeResumeView === "latex") {
    latexSource = document.querySelector("#latex-editor").value;
  }
  button.disabled = true;
  button.textContent = "Rendering…";
  try {
    const response = await fetch("/api/resume/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": resumeCsrf },
      body: JSON.stringify({ source: latexSource }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Could not render this LaTeX source.");
    }
    if (renderedPdfUrl) URL.revokeObjectURL(renderedPdfUrl);
    renderedPdfUrl = URL.createObjectURL(await response.blob());
    setResumeView("preview");
  } catch (error) {
    resumeMessage(error.message || "Could not render this LaTeX source.", "advisor");
  } finally {
    button.disabled = false;
    button.textContent = "Render PDF";
  }
});

if (location.hash === "#resume") loadResume();
