"use strict";
const resumeCsrf = document.querySelector('meta[name="csrf-token"]').content;
const resumeStudentId = document.body.dataset.studentId;
let resumeRoleEdited = false;
let resumeLoaded = false, resumeLines = [], originalLines = [], undoEdits = [], resumeRevision = 0;
let draftPdf = '', reviewPdf = '', originalPdf = '', resumeView = 'original', resumeBusy = false;
const resumeEl = id => document.getElementById(id);
async function resumeApi(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 401) { location.assign('/'); throw new Error('Your session ended.'); }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'The request failed. Please try again.');
  }
  return response;
}
const resumePost = data => ({method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': resumeCsrf}, body: JSON.stringify(data)});
function resumeLock(value) {
  resumeBusy = value;
  document.querySelectorAll('#resume-chat-form button, [data-resume-prompt], #resume-line-save, #resume-line-ask, #resume-upload-form button, .resume-edit-accept').forEach(el => el.disabled = value || !resumeLines.length);
  resumeEl('resume-upload-form').querySelector('button').disabled = value;
  resumeEl('resume-undo').disabled = value || !undoEdits.length;
}
function resumeFrame(url, title) {
  const frame = document.createElement('iframe'); frame.className = 'resume-frame'; frame.src = url; frame.title = title; return frame;
}
function renderResumeView() {
  const canvas = resumeEl('resume-canvas'); canvas.replaceChildren();
  canvas.classList.toggle('resume-comparison', resumeView === 'changes');
  if (resumeView === 'changes') {
    for (const [url, title] of [[originalPdf, 'Original PDF'], [reviewPdf, 'Updated PDF']]) {
      const panel = document.createElement('section'); const heading = document.createElement('h3'); heading.textContent = title;
      panel.append(heading, resumeFrame(url, title)); canvas.append(panel);
    }
  } else if (resumeView === 'draft' ? draftPdf : originalPdf) canvas.append(resumeFrame(resumeView === 'draft' ? draftPdf : originalPdf, resumeView === 'draft' ? 'Updated PDF' : 'Original PDF'));
  document.querySelectorAll('[data-resume-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.resumeView === resumeView)));
}
function lineTools() {
  const select = resumeEl('resume-line'); const selected = Math.min(Number(select.value) || 0, resumeLines.length - 1);
  select.replaceChildren(...resumeLines.map((line, i) => new Option(`${i + 1}: ${line.slice(0, 110) || '(blank)'}`, i)));
  select.value = selected; resumeEl('resume-line-text').value = resumeLines[selected] || '';
}
async function buildPdfs(lines) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 100000);
  try {
    const response = await resumeApi('/api/resume/render', {...resumePost({lines, format: 'pdf'}), signal: controller.signal});
    const pdf = await response.blob();
    return [URL.createObjectURL(pdf), URL.createObjectURL(pdf)];
  } finally { clearTimeout(timeout); }
}
async function replaceLine(index, before, after, revision) {
  if (resumeBusy) return;
  if (resumeLines[index] !== before) {
    resumeMessage('The draft has changed since this proposal. Ask for a fresh edit to that line.'); return;
  }
  const next = [...resumeLines]; next.splice(index, 1, ...after.split('\n'));
  if (next.every(line => !line.trim())) { resumeMessage('Keep at least one readable resume line.'); return; }
  resumeLock(true); resumeEl('resume-file-note').textContent = 'Preparing updated LaTeX source…';
  try {
    const urls = await buildPdfs(next);
    undoEdits.push([...resumeLines]); if (undoEdits.length > 20) undoEdits.shift();
    resumeLines = next; commitPdf(urls);
    return true;
  } catch (error) { resumeEl('resume-file-note').textContent = 'The draft is unchanged. Try the edit again.'; resumeMessage(`The change was not applied. ${error.message}`); }
  finally { resumeLock(false); }
}
function commitPdf(urls) {
  if (draftPdf) URL.revokeObjectURL(draftPdf); if (reviewPdf) URL.revokeObjectURL(reviewPdf);
  [draftPdf, reviewPdf] = urls; resumeRevision++;
  const changed = resumeLines.filter((line, i) => line !== originalLines[i]).length;
  resumeEl('resume-change-count').textContent = changed;
  resumeEl('resume-file-note').textContent = 'Compiled LaTeX preview. Your downloaded source preserves the original formatting.';
  resumeEl('download-draft').disabled = false;
  document.querySelectorAll('[data-resume-view]').forEach(el => el.disabled = false);
  lineTools(); resumeView = 'draft'; renderResumeView();
}
function resumeMessage(text, sender = 'advisor', edits = [], model = '') {
  const box = document.createElement('div'); box.className = `message ${sender}`;
  const label = document.createElement('span'); label.className = 'message-label'; label.textContent = sender === 'user' ? 'You' : model ? `Gemini · ${model}` : 'Resume studio';
  const body = document.createElement('p'); body.textContent = text; box.append(label, body);
  const revision = resumeRevision;
  edits.forEach(edit => {
    const proposal = document.createElement('section'); proposal.className = 'resume-proposal';
    for (const [heading, value] of [[`Line ${edit.line} · Current`, edit.before], ['Proposed', edit.after || '(Remove this line)'], ['Why', edit.reason]]) {
      const title = document.createElement('strong'); title.textContent = heading;
      const copy = document.createElement('p'); copy.textContent = value; proposal.append(title, copy);
    }
    const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'secondary-button resume-edit-accept'; accept.textContent = `Replace line ${edit.line}`;
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'inline-link'; dismiss.textContent = 'Dismiss';
    accept.addEventListener('click', async () => {
      if (await replaceLine(edit.line - 1, edit.before, edit.after, revision)) {
        accept.remove(); dismiss.remove(); const done = document.createElement('p'); done.textContent = 'Applied to source'; proposal.append(done);
      }
    });
    dismiss.addEventListener('click', () => proposal.remove()); proposal.append(accept, dismiss); box.append(proposal);
  });
  resumeEl('resume-messages').append(box); resumeEl('resume-messages').scrollTop = resumeEl('resume-messages').scrollHeight;
  return box;
}
async function loadResume() {
  if (resumeLoaded) return;
  resumeLoaded = true; resumeLock(true);
  try {
    const session = await (await resumeApi('/api/session')).json();
    if (!session.resume?.filename) throw new Error('Upload your LaTeX source to begin.');
    const data = await (await resumeApi('/api/resume/editor')).json();
    resumeLines = data.lines; originalLines = [...data.lines]; undoEdits = []; resumeRevision++;
    try {
      const response = await resumeApi('/api/resume/render', {...resumePost({lines: originalLines, changed: [], format: 'pdf'})});
      originalPdf = URL.createObjectURL(await response.blob());
    } catch (error) {
      originalPdf = ''; resumeMessage(`PDF preview unavailable: ${error.message}`);
    }
    resumeView = 'original'; renderResumeView();
    resumeEl('resume-filename').textContent = data.filename;
    resumeEl('resume-upload-prompt').hidden = true; resumeEl('resume-line-tools').hidden = false;
    resumeEl('resume-file-note').textContent = originalPdf ? 'Compiled LaTeX preview. Accepted edits change only the selected source lines.' : 'PDF compilation failed. See the error in the conversation; source editing is available.';
    lineTools();
    resumeMessage('What would you like to strengthen? We can discuss a section first, or select a source line under “Review extracted lines” to focus on its wording.');
  } catch (error) {
    resumeLoaded = false; resumeEl('resume-upload-prompt').hidden = false;
    resumeEl('resume-upload-status').textContent = error.message;
  } finally { resumeLock(false); }
}
async function sendResumeChat(question) {
  if (resumeBusy || !resumeLines.length || !question.trim()) return;
  const message = question.trim().slice(0, 1000); resumeMessage(message, 'user'); resumeEl('resume-chat-input').value = '';
  resumeLock(true);
  const pending = resumeMessage('Thinking through your resume…'); pending.classList.add('pending');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 100000);
  try {
    const data = await (await resumeApi('/api/resume/editor/chat', {...resumePost({message, lines: resumeLines}), signal: controller.signal})).json();
    resumeMessage(data.reply, 'advisor', data.edits, data.model);
  } catch (error) { resumeMessage(error.name === 'AbortError' ? 'The reply timed out. Please try again.' : error.message); }
  finally { pending.remove(); clearTimeout(timeout); resumeLock(false); }
}
resumeEl('resume-chat-form').addEventListener('submit', event => { event.preventDefault(); sendResumeChat(resumeEl('resume-chat-input').value); });
resumeEl('resume-target-role').addEventListener('input', () => { resumeRoleEdited = true; });
function syncDiscoverRole() {
  const role = window.gritDiscoverTargetRole || '';
  const input = resumeEl('resume-target-role');
  if (role && !resumeRoleEdited) input.value = role;
  resumeEl('resume-target-question').textContent = role
    ? `Discover selected “${role}”. Discuss focused changes for this role while keeping your LaTeX template.`
    : 'Enter a role to discuss focused edits to your existing resume.';
}
syncDiscoverRole();
window.addEventListener('hashchange', () => { if (location.hash === '#resume') syncDiscoverRole(); });
resumeEl('resume-generate-form').addEventListener('submit', event => {
  event.preventDefault();
  const role = resumeEl('resume-target-role').value.trim();
  if (role) sendResumeChat(`Help tailor my current LaTeX resume for a ${role} role. Ask me about missing details first, then propose relevant edits to existing lines. Preserve my document commands and formatting.`);
});
document.querySelectorAll('[data-resume-prompt]').forEach(el => el.addEventListener('click', () => sendResumeChat(el.dataset.resumePrompt)));
document.querySelectorAll('[data-resume-view]').forEach(el => el.addEventListener('click', () => { if (!originalPdf) return; resumeView = el.dataset.resumeView; renderResumeView(); }));
resumeEl('resume-line').addEventListener('change', () => { resumeEl('resume-line-text').value = resumeLines[Number(resumeEl('resume-line').value)]; });
resumeEl('resume-line-save').addEventListener('click', () => { const i = Number(resumeEl('resume-line').value); replaceLine(i, resumeLines[i], resumeEl('resume-line-text').value, resumeRevision); });
resumeEl('resume-line-ask').addEventListener('click', () => sendResumeChat(`Help me improve line ${Number(resumeEl('resume-line').value) + 1}. Ask for any details you need before rewriting it.`));
resumeEl('resume-undo').addEventListener('click', async () => {
  if (resumeBusy || !undoEdits.length) return; resumeLock(true);
  try { const previous = undoEdits.at(-1); const urls = await buildPdfs(previous); resumeLines = undoEdits.pop(); commitPdf(urls); }
  catch (error) { resumeMessage(error.message); }
  finally { resumeLock(false); }
});
resumeEl('download-draft').addEventListener('click', async () => {
  if (!resumeLines.length) return;
  try {
    const response = await resumeApi('/api/resume/render', {...resumePost({lines: resumeLines, changed: [], format: 'source'})});
    const link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = 'resume-updated.tex'; link.click();
  } catch (error) { resumeMessage(error.message); }
});
resumeEl('resume-upload-form').addEventListener('submit', async event => {
  event.preventDefault(); if (resumeBusy) return;
  const file = resumeEl('resume-upload-file').files[0];
  if (!file || !/\.tex$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) { resumeEl('resume-upload-status').textContent = 'Choose a LaTeX .tex file under 5 MB.'; return; }
  resumeLock(true);
  try {
    const form = new FormData(); form.set('resume', file); form.set('campus_id', resumeStudentId);
    await resumeApi('/api/enroll', {method: 'POST', headers: {'X-CSRF-Token': resumeCsrf}, body: form});
    // Clear all previous document state so old proposals cannot modify a replacement.
    location.hash = 'resume'; location.reload();
  } catch (error) { resumeEl('resume-upload-status').textContent = error.message; }
  finally { resumeLock(false); }
});
window.addEventListener('pagehide', () => { if (draftPdf) URL.revokeObjectURL(draftPdf); if (reviewPdf) URL.revokeObjectURL(reviewPdf); });
if (location.hash === '#resume') loadResume();
