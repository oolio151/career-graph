"use strict";
let connectLoaded = false;
let connectVersion = 0;
async function loadConnect(refresh = false) {
  if (connectLoaded && !refresh) return;
  const version = ++connectVersion;
  const status = document.querySelector("#connect-status");
  const search = document.querySelector("#connect-search");
  const positions = [...document.querySelectorAll('#connect-positions input:checked')].map(el => el.value);
  if (positions.length > 10) { status.textContent = "Choose up to ten positions."; return; }
  search.disabled = true;
  status.textContent = "Finding shared backgrounds…";
  const params = new URLSearchParams();
  positions.forEach(p => params.append("position", p));
  try {
    const data = await api(`/api/connect?${params}`);
    if (version !== connectVersion) return;
    if (!connectLoaded) {
      const options = document.querySelector("#connect-positions");
      options.replaceChildren();
      data.positions.forEach(position => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox"; input.value = position;
        label.append(input, document.createTextNode(position)); options.append(label);
      });
    }
    connectLoaded = true;
    document.querySelector("#connect-method").textContent = data.method;
    status.textContent = `${data.matching_count} alumni match your interests out of ${data.cohort_count} ${data.major} bachelor’s graduates. Showing ${data.matches.length}.`;
    const results = document.querySelector("#connect-results"); results.replaceChildren();
    if (!data.matches.length) { results.textContent = "No matches. Try different positions."; return; }
    data.matches.forEach(alum => {
      const card = document.createElement("article"); card.className = "onboarding-card connect-card";
      const node = (tag, text, cls = "") => { const el = document.createElement(tag); el.textContent = text; el.className = cls; return el; };
      card.append(node("p", "SYNTHETIC ALUMNI", "eyebrow"), node("h2", alum.full_name),
        node("p", `${alum.campus_id} · Class of ${alum.graduation_year}`, "field-hint"),
        node("p", alum.positions.join(" → ") || "No jobs recorded", "field-hint"),
        node("p", alum.score === null ? "Insufficient comparison data" : `${alum.score} / 100 background similarity`, "field-hint"));
      const table = document.createElement("table");
      table.innerHTML = '<thead><tr><th>Comparison</th><th>You</th><th>Alumnus</th></tr></thead>';
      const body = document.createElement("tbody");
      alum.evidence.forEach(e => { const row = document.createElement("tr"); row.append(node("td", e.label), node("td", e.student), node("td", e.alumni)); body.append(row); });
      table.append(body); card.append(table, node("p", alum.email || "No email recorded", "connect-contact"));
      const button = node("button", "Draft introduction with Gemini", "secondary-button"); button.type = "button";
      const notice = node("p", "", "field-hint"); notice.setAttribute("role", "status");
      let savedDraft = null;
      button.addEventListener("click", () => openConnectEmail(alum, positions, savedDraft,
        value => { savedDraft = value; button.textContent = "Open email draft"; }));
      card.append(button, notice); results.append(card);
    });
  } catch (error) { status.textContent = error.message; }
  finally { search.disabled = false; }
}
document.querySelector("#connect-search").addEventListener("click", () => loadConnect(true));

const emailDialog = document.querySelector("#connect-email");
const emailSubject = document.querySelector("#connect-email-subject");
const emailBody = document.querySelector("#connect-email-body");
const emailStatus = document.querySelector("#connect-email-status");
const emailCopy = document.querySelector("#connect-email-copy");
const emailRedraft = document.querySelector("#connect-email-redraft");
const emailMail = document.querySelector("#connect-email-mail");
let emailRecipient = null;
let emailPositions = [];
let emailRequest = null;
let saveEmail = null;
let emailModel = "";
let emailReady = false;
async function openConnectEmail(alum, positions, saved, onSave, regenerate = false) {
  emailRequest?.abort();
  const controller = new AbortController(); emailRequest = controller;
  saveEmail = onSave; emailReady = Boolean(saved);
  emailRecipient = alum; emailPositions = positions;
  emailModel = saved?.model || "";
  document.querySelector("#connect-email-to").textContent =
    `${alum.full_name} <${alum.email || "No email recorded"}>`;
  emailSubject.value = saved?.subject || "";
  emailBody.value = saved?.body || "";
  emailSubject.disabled = emailBody.disabled = emailCopy.disabled = emailRedraft.disabled = emailMail.disabled = true;
  emailStatus.textContent = "Gemini is drafting your introduction…";
  if (!emailDialog.open) emailDialog.showModal();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const result = (!regenerate && saved) || await api("/api/connect/draft", {
      method: "POST", signal: controller.signal,
      headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken},
      body: JSON.stringify({alumni_id: alum.campus_id, positions})});
    if (emailRequest !== controller || !emailDialog.open) return;
    emailSubject.value = result.subject; emailBody.value = result.body; emailModel = result.model;
    emailReady = true;
    emailSubject.disabled = emailBody.disabled = emailCopy.disabled = emailRedraft.disabled = false;
    emailMail.disabled = !alum.email;
    emailMail.title = alum.email ? "Open this draft in your email app" : "No email address recorded";
    emailStatus.textContent = `Drafted by ${result.model}. Review and edit your introduction.`;
    onSave(result);
  } catch (error) {
    if (emailRequest === controller && emailDialog.open)
      emailStatus.textContent = error.name === "AbortError"
        ? "Drafting timed out. Close this window and try again."
        : `${error.message} Close this window and try again.`;
  } finally {
    clearTimeout(timeout);
    if (emailRequest === controller && emailDialog.open) {
      emailRedraft.disabled = false;
      emailSubject.disabled = emailBody.disabled = emailCopy.disabled = !emailReady;
      emailMail.disabled = !emailReady || !alum.email;
    }
  }
}
emailRedraft.addEventListener("click", () => {
  if (!emailRecipient || emailRedraft.disabled) return;
  const saved = emailReady ? {subject: emailSubject.value, body: emailBody.value, model: emailModel} : null;
  if (saved) saveEmail?.(saved);
  openConnectEmail(emailRecipient, emailPositions, saved, saveEmail, true);
});
emailMail.addEventListener("click", () => {
  if (!emailReady || !emailRecipient?.email || emailMail.disabled) return;
  const subject = emailSubject.value.replace(/[\r\n]/g, " ");
  const body = emailBody.value.replace(/\r?\n/g, "\r\n");
  window.location.href = `mailto:${encodeURIComponent(emailRecipient.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
document.querySelector("#connect-email-close").addEventListener("click", () => emailDialog.close());
emailDialog.addEventListener("close", () => {
  emailRequest?.abort(); emailRequest = null;
  if (emailReady) saveEmail?.({subject: emailSubject.value, body: emailBody.value, model: emailModel});
});
emailDialog.addEventListener("click", event => {
  if (event.target !== emailDialog) return;
  const rect = emailDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    emailDialog.close();
});
emailCopy.addEventListener("click", async () => {
  const text = `To: ${document.querySelector("#connect-email-to").textContent}\nSubject: ${emailSubject.value}\n\n${emailBody.value}`;
  try { await navigator.clipboard.writeText(text); emailStatus.textContent = "Email copied."; }
  catch { emailBody.focus(); emailBody.select(); emailStatus.textContent = "Clipboard unavailable. Copy the subject and selected body manually."; }
});
