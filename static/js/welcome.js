"use strict";
const form = document.querySelector("#entry-form");
const idInput = document.querySelector("#campus-id");
const preview = document.querySelector("#student-preview");
const error = document.querySelector("#entry-error");
const resumeInput = document.querySelector("#resume");
const skipResume = document.querySelector("#skip-resume");
const csrf = document.querySelector('meta[name="csrf-token"]').content;
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
    const title = document.createElement("strong"); title.textContent = student.major;
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
  resumeInput.value = skipResume.checked ? "" : resumeInput.value;
  document.querySelector("#resume-hint").textContent = skipResume.checked
    ? "You can upload a resume later from Resume Studio."
    : "PDF, DOCX, or TXT · Up to 5 MB. Stored on this computer. The resume page can read it here. It is not sent to an outside model.";
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
