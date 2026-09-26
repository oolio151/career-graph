"use strict";
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const tags = (values, cls = '') => values.map(value => `<span class="tag ${cls}">${esc(value)}</span>`).join('');
const money = value => value == null ? 'Unavailable' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
let options, graph, detail, recommendations, engagementData;
let roles = {}, saved = new Set(), planned = new Set();
let major = 'cs', selectedRole = '', student = '', family = 'all', season = 'Spring';
let currentView = 'explore', workspaceVersion = 0, detailVersion = 0, chatVersion = 0, toastTimer;
let chatBusy = false;
const pages = {
  explore:['Explore pathways','Your future, <em>connected.</em>','Connect what you’re learning to who you could become.'],
  engagement:['My engagement','Small steps. <em>More possibilities.</em>','Explore the experiences recorded along alumni career paths.'],
  advisor:['AI advisor','Let’s find <em>your direction.</em>','Explore courses, skills, and activities with answers from the dataset.'],
  saved:['Saved pathways','The paths that <em>caught your eye.</em>','A collection of possibilities, with room to change your mind.']
};
function notify(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}
function readIds(key, valid) {
  try { const values = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(values) ? values.filter(v => valid.includes(v)) : []); }
  catch { return new Set(); }
}
function persist(key, values) {
  try { localStorage.setItem(key, JSON.stringify([...values])); }
  catch { notify('Saved for this session. Browser storage is unavailable.'); }
}
async function api(path, params = {}, body) {
  const url = `/api/${path}${Object.keys(params).length ? '?' + new URLSearchParams(params) : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {signal:controller.signal, ...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  } finally { clearTimeout(timeout); }
}
function setStatus(message, error = false) {
  $('#data-status').textContent = message; $('#data-status').classList.toggle('error', error); $('#retry-data').hidden = !error;
}
function showView(view) {
  if (!pages[view]) return;
  currentView = view;
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== `view-${view}`; });
  document.querySelectorAll('.nav-item').forEach(el => {
    const active = el.dataset.view === view; el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  $('#breadcrumb-current').textContent = pages[view][0]; $('#page-title').innerHTML = pages[view][1]; $('#page-description').textContent = pages[view][2];
  $('.page-heading > .primary-button').hidden = view === 'advisor';
  $('#sidebar').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false');
  if (view === 'saved') renderSaved();
  history.replaceState(null,'',`#${view}`); window.scrollTo({top:0}); $('#main').focus({preventScroll:true});
}
async function initialize() {
  setStatus('Loading the dataset…');
  try {
    options = await api('options'); roles = Object.fromEntries(options.roles.map(r => [r.id,r]));
    saved = readIds('careergraph.saved', Object.keys(roles));
    planned = readIds('careergraph.activities', options.activity_types.map(a => a.id));
    $('#family').innerHTML = '<option value="all">All pathways</option>' + options.families.map(f => `<option>${esc(f)}</option>`).join('');
    renderSaved(); await loadWorkspace(true);
  } catch (error) { setStatus(`Could not load data: ${error.message}`, true); }
}
async function loadWorkspace(reloadStudents = false) {
  const version = ++workspaceVersion; ++detailVersion;
  setStatus('Loading observed career connections…');
  $('#role-detail').innerHTML = '<p class="data-note">Loading role details…</p>';
  $('#course-results').replaceChildren(); $('#experience-preview').replaceChildren(); $('#engagement-grid').replaceChildren();
  $('#alumni-examples').replaceChildren(); $('#engagement-context').textContent = '';
  $('#role-select').disabled = true; $('#student').disabled = true;
  try {
    const [result, profiles] = await Promise.all([
      api('pathways', {major, family, ...(selectedRole ? {focus:selectedRole} : {})}),
      reloadStudents ? api('students', {major}) : Promise.resolve(null)
    ]);
    if (version !== workspaceVersion) return;
    graph = result;
    if (profiles) {
      $('#student').innerHTML = '<option value="">Explore without a student</option>' + profiles.students.map(s => `<option value="${esc(s.campus_id)}">${esc(s.campus_id)} · ${esc(s.class_level)} · ${esc(s.track)}</option>`).join('');
      if (!profiles.students.some(s => s.campus_id === student)) student = '';
      $('#student').value = student;
    }
    const available = options.roles.filter(r => graph.available_roles.includes(r.id));
    if (!graph.available_roles.includes(selectedRole)) selectedRole = graph.nodes[0]?.id || available[0]?.id || '';
    $('#role-select').innerHTML = available.map(r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('') || '<option value="">No matching roles</option>';
    $('#role-select').value = selectedRole;
    $('#profile-label').textContent = student || (major === 'cs' ? 'Computer Science' : 'Information Systems');
    $('#role-count').textContent = graph.role_count;
    renderGraph();
    setStatus(`${major === 'cs' ? 'Computer Science' : 'Information Systems'} · ${graph.cohort_count} bachelor’s alumni · ${graph.employed_count} with job records · Synthetic dataset`);
    if (selectedRole) await loadDetails();
    else { $('#role-detail').innerHTML = '<p class="data-note">No roles match this family and major.</p>'; $('#activity-count').textContent = '0'; }
  } catch (error) {
    if (version === workspaceVersion) setStatus(`Could not load pathways: ${error.message}`, true);
  } finally {
    if (version === workspaceVersion) { $('#role-select').disabled = false; $('#student').disabled = false; }
  }
}
function renderGraph() {
  if (!graph) return;
  $('#degree-name').innerHTML = major === 'cs' ? 'Computer<br>Science' : 'Information<br>Systems';
  $('#role-nodes').innerHTML = graph.nodes.map(n => `<button class="role-node ${n.id === selectedRole ? 'selected' : ''}" data-role="${esc(n.id)}" data-column="${n.column}" data-row="${n.row}" aria-pressed="${n.id === selectedRole}"><strong>${esc(n.title)}</strong><span><i></i>${n.count} alumni · ${n.column ? 'later role' : 'first job'}</span></button>`).join('');
  const positions = Object.fromEntries(graph.nodes.map(n => [n.id,{x:n.column ? 560 : 264, y:[80,184,288][n.row], width:n.column ? 224 : 193}]));
  $('.graph-edges').innerHTML = graph.edges.map(e => {
    const source = e.source === 'degree' ? {x:176,y:184,width:0} : positions[e.source];
    const target = positions[e.target]; if (!source || !target) return '';
    const x = source.x + source.width, middle = (x + target.x)/2;
    return `<path class="edge" d="M${x} ${source.y} C${middle} ${source.y} ${middle} ${target.y} ${target.x} ${target.y}"><title>${esc(e.source === 'degree' ? 'Degree' : roles[e.source].title)} → ${esc(roles[e.target].title)}: ${e.count} alumni</title></path>`;
  }).join('');
  let evidence = $('.graph-evidence');
  if (!evidence) { evidence = document.createElement('div'); evidence.className = 'graph-evidence'; $('.graph-footer').append(evidence); }
  evidence.innerHTML = `${esc(graph.note)}${!graph.nodes.some(n => n.id === selectedRole) && selectedRole ? '<br>The selected role is outside this six-node overview; its details are shown alongside.' : ''}<details><summary>Connection counts and example records</summary><ul>${graph.edges.map(e => `<li>${esc(e.source === 'degree' ? 'Degree' : roles[e.source].title)} → ${esc(roles[e.target].title)}: ${e.count} alumni. Examples: ${esc(e.examples.join(', '))}</li>`).join('')}</ul></details>`;
}
async function loadDetails(region = '', year = '') {
  if (!selectedRole) return;
  const version = ++detailVersion;
  const context = {major, role:selectedRole, student, season};
  $('#role-detail').setAttribute('aria-busy','true');
  try {
    const results = await Promise.allSettled([
      api(`roles/${encodeURIComponent(context.role)}`, {major:context.major,region,year}),
      api('engagement', {major:context.major,role:context.role,student:context.student}),
      context.student ? api(`students/${encodeURIComponent(context.student)}/recommendations`, {role:context.role,season:context.season}) : Promise.resolve(null)
    ]);
    if (version !== detailVersion) return;
    const [roleResult, activityResult, courseResult] = results;
    if (roleResult.status === 'fulfilled') { detail = roleResult.value; renderDetail(region, year); }
    else { detail = null; $('#role-detail').innerHTML = `<p class="data-note">${esc(roleResult.reason.message)}</p><button class="inline-link" data-retry-detail>Retry details ↗</button>`; }
    if (activityResult.status === 'fulfilled') { engagementData = activityResult.value; renderActivities(); }
    else { engagementData = null; $('#engagement-grid').innerHTML = `<p class="data-note">${esc(activityResult.reason.message)}</p>`; $('#experience-preview').replaceChildren(); }
    if (courseResult.status === 'fulfilled') { recommendations = courseResult.value; renderCourses(); }
    else { $('#course-results').innerHTML = `<p class="data-note">${esc(courseResult.reason.message)}</p>`; }
  } finally { if (version === detailVersion) $('#role-detail').setAttribute('aria-busy','false'); }
}
function renderDetail(region = '', year = '') {
  if (!detail) return;
  const d = detail, sal = d.salary;
  $('#role-detail').innerHTML = `<div class="detail-top"><span class="role-type">${esc(d.family)}</span><button class="icon-button ${saved.has(d.id) ? 'bookmarked' : ''}" data-save="${esc(d.id)}" aria-label="${saved.has(d.id) ? 'Unsave' : 'Save'} ${esc(d.title)}" aria-pressed="${saved.has(d.id)}">${icon('bookmark')}</button></div><h3>${esc(d.title)}</h3><p class="detail-description">${d.record_count} job records · ${d.alumni_count} unique bachelor’s alumni in this major.</p><div class="salary-filters"><label>Region<select id="salary-region"><option value="">All regions</option>${options.regions.map(r => `<option${r === region ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label><label>Start year<select id="salary-year"><option value="">Latest available</option>${options.years.map(y => `<option value="${y}"${String(y) === String(year) ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div><div class="salary"><span>Median annual base salary</span><strong>${money(sal.median)}</strong><span>${sal.year || 'No matching year'} · ${sal.count} job records</span><span>${sal.count ? `Middle 50%: ${money(sal.p25)}–${money(sal.p75)}` : 'No records for these filters'}</span></div><p class="data-note">${esc(sal.note)}</p><div class="skills-block"><p class="skills-title">Skills across all years for this major</p><div class="tags">${d.skills.map(s => `<span class="tag" title="${s.count} of ${d.record_count} records">${esc(s.name)} · ${s.percent}%</span>`).join('') || '<p>No matching records.</p>'}</div></div><details class="course-detail"><summary>Observed previous and next roles</summary><strong>Previous roles</strong>${d.previous_roles.map(r => `<button class="inline-link" data-open-role="${esc(r.id)}">${esc(r.title)} · ${r.count} alumni ↗</button>`).join('') || '<p>No earlier roles recorded.</p>'}<strong>Next roles</strong>${d.next_roles.map(r => `<button class="inline-link" data-open-role="${esc(r.id)}">${esc(r.title)} · ${r.count} alumni ↗</button>`).join('') || '<p>No later roles recorded.</p>'}</details><button class="primary-button" data-prompt="How can I explore becoming a ${esc(d.title)}?">Explore this path ${icon('arrow')}</button>`;
}
function renderCourses() {
  if (!recommendations) {
    $('#course-summary').textContent = 'Select a student profile above to compare coursework, skill gaps, and prerequisites.';
    $('#course-results').innerHTML = detail ? `<div class="course-grid">${detail.courses.slice(0,3).map(c => `<article class="course-card"><span class="role-type">${esc(c.id)}</span><h3>${esc(c.title)}</h3><div class="tags">${tags(c.skills)}</div><p>Catalog skill overlap with this role. Eligibility has not been checked without a student profile.</p></article>`).join('')}</div>` : '';
    return;
  }
  const r = recommendations, c = r.coverage;
  $('#course-summary').textContent = c.total ? `${r.student.campus_id}: completed coursework covers ${c.covered} of ${c.total} target skills (${c.percent}%). ${r.in_progress_skills.length} more are in progress.` : 'No role skill records for this student’s major.';
  const card = course => `<article class="course-card"><span class="role-type">${esc(course.id)} · ${course.credits} credits</span><h3>${esc(course.title)}</h3><div class="tags">${tags(course.additional_skills)}</div><p>Adds ${course.additional_skills.length} new skills beyond the other suggestions. Typically offered in ${esc(r.season)}.</p><p>Prerequisites: ${esc(course.prerequisites.map(group => group.join(' or ')).join('; ') || 'None listed')}. Listed prerequisites have earned course credit.</p></article>`;
  $('#course-results').innerHTML = `<div class="coverage-tags"><p class="data-note">Completed / In progress / Missing</p>${tags(r.covered_skills,'covered')}${tags(r.in_progress_skills,'in-progress')}${tags(r.missing_skills,'missing')}</div><div class="course-grid">${r.suggestions.map(card).join('') || '<p class="data-note">No additional course currently meets the prerequisite and season filters for uncovered skills. Consider another season or review the constraints below.</p>'}</div><p class="data-note">${esc(r.note)}</p><details class="course-detail"><summary>Your relevant coursework (${r.courses.length})</summary>${r.courses.map(x => `<p><strong>${esc(x.id)} · ${esc(x.title)}</strong> — ${esc(x.status.replaceAll('_',' '))}<br>${esc(x.skills.join(', '))}</p>`).join('') || '<p>No relevant coursework recorded.</p>'}</details><details class="course-detail"><summary>Courses with prerequisite or season constraints (${r.blocked_courses.length})</summary>${r.blocked_courses.map(x => `<p><strong>${esc(x.id)} · ${esc(x.title)}</strong><br>${x.missing_prerequisites.length ? `Prerequisite courses without earned credit: ${esc(x.missing_prerequisites.join('; '))}. ` : ''}Typically offered: ${esc(x.seasons.join(', '))}.<br>Skills: ${esc(x.new_skills.join(', '))}</p>`).join('') || '<p>No additional constraints to display.</p>'}</details>`;
}
function renderActivities() {
  if (!engagementData) return;
  const e = engagementData;
  $('#activity-count').textContent = e.activities.filter(a => a.count > 0).length;
  $('#engagement-context').textContent = `${roles[e.role_id].title} · ${e.cohort_count} alumni. ${e.note}`;
  $('#experience-preview').innerHTML = e.activities.filter(a => a.count > 0).slice(0,3).map(a => `<button class="experience-card" data-activity="${esc(a.id)}"><span class="experience-top"><span class="metric-icon green">${icon('people')}</span><span>↗</span></span><span class="experience-type">OBSERVED AMONG ALUMNI</span><h3>${esc(a.name)}</h3><p>${a.count} of ${e.cohort_count} alumni · ${a.percent}%</p><span class="experience-bottom">Explore the evidence ↗</span></button>`).join('') || '<p class="data-note">No activity records match this role and major.</p>';
  $('#engagement-grid').innerHTML = e.activities.map(a => `<article class="experience-card" id="activity-${esc(a.id)}" tabindex="-1"><span class="metric-icon green">${icon('people')}</span><span class="experience-type">ALUMNI ACTIVITY PATTERN</span><h3>${esc(a.name)}</h3><p>${a.count} of ${e.cohort_count} alumni${a.percent == null ? '' : ` · ${a.percent}%`} participated at least once.</p><p>${student ? `${a.student_count} in your experience records.` : 'Choose a student to compare your experiences.'}</p><div class="activity-details"><h4>Examples in this cohort</h4><ul>${a.examples.map(x => `<li>${esc(x.name)} · ${x.count} alumni</li>`).join('') || '<li>No examples recorded.</li>'}</ul><button class="inline-link" data-open-role="${esc(e.role_id)}">Explore ${esc(roles[e.role_id].title)} ↗</button></div><button class="activity-toggle" data-plan="${esc(a.id)}" aria-pressed="${planned.has(a.id)}">${planned.has(a.id) ? '✓ Added to my interests' : '+ Add to my interests'}</button></article>`).join('');
  $('#alumni-examples').innerHTML = e.examples.map(a => `<article><h3>${esc(a.campus_id)} · Class of ${esc(a.year)}</h3><p>${esc(a.track)}</p><p>${esc(a.activities.join(' · '))}</p><ol>${a.jobs.map(j => `<li>${esc(j.title)}<br>${esc(j.start)}</li>`).join('')}</ol></article>`).join('') || '<p>No example pathways.</p>';
}
function renderSaved() {
  $('#saved-count').textContent = saved.size;
  $('#saved-roles').innerHTML = saved.size ? [...saved].filter(id => roles[id]).map(id => `<article class="saved-card"><span class="metric-icon green">${icon('case')}</span><h3>${esc(roles[id].title)}</h3><p>${esc(roles[id].family)}</p><div class="saved-card-actions"><button class="inline-link" data-open-role="${esc(id)}">Explore role ↗</button><button class="icon-button bookmarked" data-save="${esc(id)}" aria-label="Unsave ${esc(roles[id].title)}">${icon('bookmark')}</button></div></article>`).join('') : `<div class="empty-state">${icon('bookmark')}<h3>Something will spark your curiosity.</h3><p>Save a role from the map or role selector and return here.</p><button class="primary-button" data-view="explore">Explore the possibilities ${icon('arrow')}</button></div>`;
}
async function openRole(id) {
  if (!roles[id]) return;
  selectedRole = id; family = 'all'; $('#family').value = 'all';
  const supported = roles[id].majors || [];
  let changedMajor = false;
  if (supported.length && !supported.includes(major)) { major = supported[0]; $('#major').value = major; student = ''; changedMajor = true; }
  showView('explore'); await loadWorkspace(changedMajor);
}
function addMessage(text, sender, sources = []) {
  const message = document.createElement('div'); message.className = `message ${sender}`;
  const label = document.createElement('span'); label.className = 'message-label'; label.textContent = sender === 'user' ? 'YOU' : 'ADVISOR · DATASET ANSWER';
  message.append(label, document.createTextNode(text));
  if (sources.length) {
    const sourceBlock = document.createElement('details'); sourceBlock.className = 'sources';
    sourceBlock.innerHTML = `<summary>Supporting dataset records</summary><ul>${sources.map(s => `<li>${esc(s.file)} · ${s.count} records/participants. Example IDs: ${esc(s.record_ids.join(', ') || 'None')}</li>`).join('')}</ul>`;
    message.append(sourceBlock);
  }
  $('#chat-messages').append(message); $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
}
function resetChat() {
  ++chatVersion; chatBusy = false; $('#chat-form button').disabled = false; $('#chat-messages').replaceChildren();
  addMessage('Ask about skills, courses, alumni experiences, or salaries for the selected role. Answers use the supplied synthetic data. This is a dataset advisor, not a live generative AI model.','advisor');
}
async function sendQuestion(question) {
  const value = question.trim().slice(0,500); if (!value || chatBusy) return;
  if (!selectedRole) { notify('Choose a career role first.'); return; }
  showView('advisor'); addMessage(value,'user'); $('#chat-input').value = '';
  const version = ++chatVersion; chatBusy = true; $('#chat-form button').disabled = true;
  try {
    const result = await api('advisor', {}, {question:value, major, role:selectedRole, student, season});
    if (version === chatVersion) addMessage(result.answer,'advisor',result.sources);
  } catch (error) { if (version === chatVersion) addMessage(`Could not retrieve an answer: ${error.message}. Please try again.`,'advisor'); }
  finally { if (version === chatVersion) { chatBusy = false; $('#chat-form button').disabled = false; } }
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.view) showView(button.dataset.view);
  if (button.dataset.role) { selectedRole = button.dataset.role; $('#role-select').value = selectedRole; renderGraph(); loadDetails(); }
  if (button.dataset.openRole) openRole(button.dataset.openRole);
  if (button.dataset.save && roles[button.dataset.save]) {
    const id = button.dataset.save; saved.has(id) ? saved.delete(id) : saved.add(id); persist('careergraph.saved',saved); renderSaved();
    if (detail && detail.id === id) renderDetail($('#salary-region')?.value || '', $('#salary-year')?.value || '');
    notify(saved.has(id) ? 'Role saved.' : 'Role removed.');
  }
  if (button.dataset.plan) { const id = button.dataset.plan; planned.has(id) ? planned.delete(id) : planned.add(id); persist('careergraph.activities',planned); renderActivities(); }
  if (button.dataset.activity) { showView('engagement'); document.getElementById(`activity-${button.dataset.activity}`)?.focus(); }
  if (button.dataset.prompt) sendQuestion(button.dataset.prompt);
  if (button.hasAttribute('data-retry-detail')) loadDetails();
});
document.addEventListener('change', event => {
  if (event.target.id === 'salary-region' || event.target.id === 'salary-year') loadDetails($('#salary-region').value, $('#salary-year').value);
});
$('#major').addEventListener('change', event => { major = event.target.value; student = ''; selectedRole = ''; loadWorkspace(true); });
$('#family').addEventListener('change', event => { family = event.target.value; selectedRole = ''; loadWorkspace(); });
$('#role-select').addEventListener('change', event => { selectedRole = event.target.value; loadWorkspace(); });
$('#student').addEventListener('change', event => { student = event.target.value; $('#profile-label').textContent = student || 'Explore by major'; loadDetails(); });
$('#season').addEventListener('change', event => { season = event.target.value; loadDetails(); });
$('#reset-graph').addEventListener('click', () => { family = 'all'; selectedRole = ''; $('#family').value = 'all'; loadWorkspace(); $('.graph-scroll').scrollLeft = 0; });
$('#retry-data').addEventListener('click', () => options ? loadWorkspace(true) : initialize());
$('#chat-form').addEventListener('submit', event => { event.preventDefault(); sendQuestion($('#chat-input').value); });
$('#clear-chat').addEventListener('click', resetChat);
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
resetChat();
if (pages[location.hash.slice(1)]) showView(location.hash.slice(1));
initialize();
