const API = `${window.location.origin}/api`;

// ─── Navigation ────────────────────────────────────────────────
function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  document.getElementById('breadcrumb').textContent =
    { dashboard: 'Dashboard', competitions: 'Competitions', timeline: 'Timeline', milestones: 'Tasks' }[name];
  if (name === 'dashboard') loadDashboard();
  else if (name === 'competitions') loadCompetitions();
  else if (name === 'timeline') loadTimeline();
  else if (name === 'milestones') loadAllMilestones();
}

// Sidebar toggle for mobile
document.getElementById('menuToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ─── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Drawer/Modal Helpers ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.drawer-overlay, .modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ─── Stats ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch(`${API}/stats`);
    const d = await r.json();
    document.getElementById('statTotal').textContent = d.total_competitions;
    document.getElementById('statUpcoming').textContent = d.status_counts.upcoming || 0;
    document.getElementById('statActive').textContent = d.status_counts.active || 0;
    document.getElementById('statCompleted').textContent = d.status_counts.completed || 0;
    document.getElementById('statMilestones').textContent =
      `${d.completed_milestones}/${d.total_milestones}`;
  } catch {}
}

// ─── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
  await loadStats();
  try {

    const ms = await fetch(`${API}/milestones`).then(r => r.json());
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = ms.filter(m => !m.is_completed && m.due_date >= today).slice(0, 5);
    const el = document.getElementById('upcomingMilestones');
    el.innerHTML = upcoming.length
      ? upcoming.map(m => renderMilestoneItem(m, true, 'dash')).join('')
      : '<div class="empty-state small"><p>No upcoming tasks</p></div>';
  } catch { }
}

// ─── Competitions ──────────────────────────────────────────────
async function loadCompetitions() {
  const status = document.getElementById('filterStatus').value;
  const category = document.getElementById('filterCategory').value;
  let url = `${API}/competitions?`;
  if (status) url += `status=${status}&`;
  if (category) url += `category=${category}`;
  try {
    const comps = await fetch(url).then(r => r.json());
    const el = document.getElementById('competitionsList');
    el.innerHTML = comps.length ? comps.map(c => renderCompItem(c, 'all')).join('') : emptyState('No competitions found');
  } catch { showToast('Failed to load competitions', 'error'); }
}

function renderCompItem(c, prefix) {
  const statusBadge = `<span class="badge badge-status-${c.status}">${c.status}</span>`;
  const catBadge = `<span class="badge badge-cat">${c.category}</span>`;

  return `
  <div class="comp-item" id="comp-item-${prefix}-${c.id}">
    <div class="comp-header" onclick="toggleAccordion(${c.id}, '${prefix}')">
      <div class="comp-header-left">
        <div class="comp-name">${escHtml(c.name)}</div>
        <div class="comp-badges">${catBadge} ${statusBadge}</div>
      </div>
      <div class="comp-dates-row">
        ${formatDate(c.start_date)} — ${formatDate(c.end_date)}
      </div>
      <div class="expand-icon">▼</div>
    </div>
    <div class="comp-details" id="comp-details-${prefix}-${c.id}">
      <div class="detail-grid">
        <div class="detail-block"><h4>Location</h4><p>${escHtml(c.location || 'Not specified')}</p></div>
        <div class="detail-block"><h4>Prize</h4><p>${escHtml(c.prize || 'No reward')}</p></div>
        <div class="detail-block"><h4>Team Size</h4><p>${c.team_size} members</p></div>
      </div>
      <div class="detail-block">
        <h4>Description</h4>
        <p style="font-weight:400;margin-top:4px">${escHtml(c.description || 'No description provided.')}</p>
      </div>

      <div class="detail-block" style="margin-top:24px">
        <h4>Tasks</h4>
        <div class="add-ms-bar" style="display:flex;gap:8px;margin-bottom:12px;margin-top:8px">
          <input type="text" id="quickMsTitle-${prefix}-${c.id}" class="form-input" placeholder="Title" style="flex:1" />
          <input type="date" id="quickMsDue-${prefix}-${c.id}" class="form-input" style="width:140px" />
          <button class="btn btn-primary" style="padding:8px 16px" onclick="quickAddMilestone(${c.id}, '${prefix}')">Add</button>
        </div>
        <div id="ms-list-${prefix}-${c.id}" class="milestone-list">
           <!-- Loaded on expand -->
           <p style="font-size:12px;color:var(--text-muted)">Click to load tasks...</p>
        </div>
      </div>

      <div class="comp-actions">
        <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" onclick="openEditCompetition(${c.id})">Edit</button>
        <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px;color:var(--danger)" onclick="deleteCompetition(${c.id})">Delete</button>
      </div>
    </div>
  </div>`;
}

async function toggleAccordion(id, prefix) {
  const item = document.getElementById(`comp-item-${prefix}-${id}`);
  const wasOpen = item.classList.contains('open');

  // Close others? (Optional)
  // document.querySelectorAll('.comp-item').forEach(el => el.classList.remove('open'));

  if (!wasOpen) {
    item.classList.add('open');
    loadCompMilestones(id, prefix);
  } else {
    item.classList.remove('open');
  }
}

async function loadCompMilestones(compId, prefix) {
  try {
    const c = await fetch(`${API}/competitions/${compId}`).then(r => r.json());
    const ms = c.milestones || [];
    const el = document.getElementById(`ms-list-${prefix}-${compId}`);
    el.innerHTML = ms.length
      ? ms.map(m => renderMilestoneItem(m, false, compId, prefix)).join('')
      : '<p style="font-size:13px;color:var(--text-muted)">No tasks yet.</p>';
  } catch {}
}

function emptyState(msg) {
  return `<div class="empty-state"><p>${msg}</p><button class="btn btn-primary" onclick="openAddCompetitionModal()">+ Add Competition</button></div>`;
}

// ─── Add / Edit Competition ────────────────────────────────────
function openAddCompetitionModal() {
  document.getElementById('compModalTitle').textContent = 'Add Competition';
  document.getElementById('competitionForm').reset();
  document.getElementById('compId').value = '';
  document.getElementById('compSubmitBtn').textContent = 'Save Competition';
  openModal('competitionModal');
}

async function openEditCompetition(id) {
  try {
    const c = await fetch(`${API}/competitions/${id}`).then(r => r.json());
    document.getElementById('compModalTitle').textContent = 'Edit Competition';
    document.getElementById('compId').value = c.id;
    document.getElementById('compName').value = c.name;
    document.getElementById('compCategory').value = c.category;
    document.getElementById('compStatus').value = c.status;
    document.getElementById('compStart').value = c.start_date;
    document.getElementById('compEnd').value = c.end_date;
    document.getElementById('compLocation').value = c.location || '';
    document.getElementById('compPrize').value = c.prize || '';
    document.getElementById('compTeam').value = c.team_size || 1;
    document.getElementById('compDesc').value = c.description || '';
    document.getElementById('compSubmitBtn').textContent = 'Update Competition';
    openModal('competitionModal');
  } catch { showToast('Failed to load competition', 'error'); }
}

async function saveCompetition(e) {
  e.preventDefault();
  const id = document.getElementById('compId').value;
  const payload = {
    name: document.getElementById('compName').value,
    category: document.getElementById('compCategory').value,
    status: document.getElementById('compStatus').value,
    start_date: document.getElementById('compStart').value,
    end_date: document.getElementById('compEnd').value,
    location: document.getElementById('compLocation').value || null,
    prize: document.getElementById('compPrize').value || null,
    team_size: parseInt(document.getElementById('compTeam').value) || 1,
    description: document.getElementById('compDesc').value || null,
  };
  try {
    const url = id ? `${API}/competitions/${id}` : `${API}/competitions`;
    const method = id ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    closeModal('competitionModal');
    showToast(id ? 'Competition updated!' : 'Competition added!');
    loadDashboard(); loadCompetitions();
  } catch { showToast('Error saving competition', 'error'); }
}

async function deleteCompetition(id) {
  event.stopPropagation();
  if (!confirm('Delete this competition?')) return;
  try {
    await fetch(`${API}/competitions/${id}`, { method: 'DELETE' });
    showToast('Competition deleted');
    loadDashboard(); loadCompetitions();
  } catch { showToast('Error deleting', 'error'); }
}

// ─── Tasks ────────────────────────────────────────────────
function renderMilestoneItem(m, compact = false, compId = null, prefix = '') {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !m.is_completed && m.due_date < today;
  const reloadFn = compId ? `loadCompMilestones(${compId}, '${prefix}')` : `loadAllMilestones()`;
  return `
  <div class="milestone-item ${m.is_completed ? 'done' : ''}" id="ms-${m.id}">
    <div class="milestone-check ${m.is_completed ? 'checked' : ''}"
      onclick="toggleMilestone(${m.id}, ${m.is_completed ? 0 : 1}, '${reloadFn}')">
      ${m.is_completed ? '✓' : ''}
    </div>
    <div class="milestone-info">
      <div class="milestone-title">${escHtml(m.title)}</div>
    </div>
    <div class="milestone-due ${overdue ? 'overdue' : ''}">${formatDate(m.due_date)}</div>
    <button class="ms-del-btn" style="background:none;border:none;cursor:pointer;opacity:0.5" onclick="deleteMilestone(${m.id}, '${reloadFn}')">✕</button>
  </div>`;
}

async function quickAddMilestone(compId, prefix) {
  const title = document.getElementById(`quickMsTitle-${prefix}-${compId}`).value.trim();
  const due = document.getElementById(`quickMsDue-${prefix}-${compId}`).value;
  if (!title || !due) { showToast('Enter title and date', 'error'); return; }
  try {
    await fetch(`${API}/milestones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competition_id: compId, title, due_date: due })
    });
    showToast('Task added!');
    loadCompMilestones(compId, prefix);
    loadStats();
  } catch { showToast('Error adding task', 'error'); }
}

async function toggleMilestone(id, val, reloadFn) {
  event.stopPropagation();
  try {
    await fetch(`${API}/milestones/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: val === 1 })
    });
    if (reloadFn.includes('(')) {
       const [fn, argList] = reloadFn.split('(');
       const args = argList.replace(')', '').split(',').map(s => s.trim().replace(/'/g, ''));
       window[fn](...args);
    } else {
       window[reloadFn]();
    }
    loadStats();
  } catch { showToast('Error updating task', 'error'); }
}

async function deleteMilestone(id, reloadFn) {
  event.stopPropagation();
  if (!confirm('Delete task?')) return;
  try {
    await fetch(`${API}/milestones/${id}`, { method: 'DELETE' });
    showToast('Task deleted');
    if (reloadFn.includes('(')) {
       const [fn, argList] = reloadFn.split('(');
       const args = argList.replace(')', '').split(',').map(s => s.trim().replace(/'/g, ''));
       window[fn](...args);
    } else {
       window[reloadFn]();
    }
    loadStats();
  } catch { showToast('Error deleting', 'error'); }
}

async function loadAllMilestones() {
  try {
    const ms = await fetch(`${API}/milestones`).then(r => r.json());
    const el = document.getElementById('allMilestonesList');
    if (!ms.length) { el.innerHTML = '<p>No tasks yet</p>'; return; }
    // Fetch comp names
    const comps = await fetch(`${API}/competitions`).then(r => r.json());
    const compMap = Object.fromEntries(comps.map(c => [c.id, c.name]));
    el.innerHTML = ms.map(m => `
      <div style="margin-bottom:12px">
        <span style="font-size:11px;font-weight:700;color:var(--primary)">${escHtml(compMap[m.competition_id])}</span>
        ${renderMilestoneItem(m, false)}
      </div>`).join('');
  } catch { }
}

async function loadTimeline() {
  try {
    const comps = await fetch(`${API}/competitions`).then(r => r.json());
    const el = document.getElementById('timelineContainer');
    const sorted = [...comps].sort((a, b) => a.start_date.localeCompare(b.start_date));
    el.innerHTML = sorted.map(c => `
      <div class="timeline-card">
        <div class="timeline-date-side">${formatDate(c.start_date)}</div>
        <div class="timeline-info">
          <h3 style="font-family:var(--font-serif)">${escHtml(c.name)}</h3>
          <p style="font-size:13px">${escHtml(c.category)} — ${c.status}</p>
        </div>
      </div>`).join('');
  } catch { }
}

// ─── Helpers ───────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Coach notes chat ──────────────────────────────────────────
const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatTyping = document.getElementById('chatTyping');
const chatSendBtn = document.getElementById('chatSendBtn');
let chatLoadedOnce = false;

function setChatOpen(open) {
  if (!chatPanel || !chatFab) return;
  chatPanel.classList.toggle('open', open);
  chatPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  chatFab.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && !chatLoadedOnce) {
    chatLoadedOnce = true;
    loadChatMessages();
  }
  if (open && chatInput) setTimeout(() => chatInput.focus(), 200);
}

chatFab?.addEventListener('click', () => {
  if (!chatPanel) return;
  setChatOpen(!chatPanel.classList.contains('open'));
});
chatClose?.addEventListener('click', () => setChatOpen(false));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && chatPanel?.classList.contains('open')) setChatOpen(false);
});

function formatChatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function loadChatMessages() {
  if (!chatMessages) return;
  try {
    const rows = await fetch(`${API}/chat/messages`).then(r => r.json());
    if (!rows.length) {
      chatMessages.innerHTML =
        '<p class="chat-empty">No messages yet. Ask the coach for prep ideas, a timeline, or feedback on your plan.</p>';
      return;
    }
    chatMessages.innerHTML = rows
      .map((m) => {
        const role = String(m.role || 'user').toLowerCase();
        const bubbleClass =
          role === 'assistant' ? 'chat-bubble chat-bubble-assistant' : 'chat-bubble chat-bubble-user';
        const who = role === 'assistant' ? 'Coach' : 'You';
        return `
      <div class="${bubbleClass}" data-id="${m.id}">
        <span class="chat-bubble-who">${who}</span>
        ${escHtml(m.body).replace(/\n/g, '<br>')}
        <span class="chat-bubble-meta">${formatChatTime(m.created_at)}</span>
      </div>`;
      })
      .join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch {
    chatMessages.innerHTML =
      '<p class="chat-empty">Could not load chat. Open the app via the server URL (e.g. http://localhost:8000) and ensure the backend is running.</p>';
  }
}

chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatSendBtn?.click();
  }
});

chatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = chatInput.value.trim();
  if (!body) return;
  if (chatTyping) chatTyping.hidden = false;
  if (chatSendBtn) chatSendBtn.disabled = true;
  try {
    const r = await fetch(`${API}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!r.ok) {
      const errText = await r.text();
      let detail = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(errText);
        if (j.detail != null) {
          detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        }
      } catch {
        if (errText) detail = errText.slice(0, 300);
      }
      throw new Error(detail);
    }
    chatInput.value = '';
    chatLoadedOnce = true;
    await loadChatMessages();
  } catch (err) {
    const msg = err instanceof Error && err.message ? err.message : 'Could not reach AI coach.';
    showToast(msg.length > 240 ? `${msg.slice(0, 240)}…` : msg, 'error');
  } finally {
    if (chatTyping) chatTyping.hidden = true;
    if (chatSendBtn) chatSendBtn.disabled = false;
  }
});

document.querySelectorAll('.nav-item').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    if (el.id === 'nav-coach') {
      document.getElementById('sidebar')?.classList.remove('open');
      setChatOpen(true);
      return;
    }
    switchPage(el.dataset.page);
  });
});

loadDashboard();
