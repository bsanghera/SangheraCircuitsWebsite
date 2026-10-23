const API_BASE = String(window.MEDITATION_API_BASE || '').replace(/\/$/, '');
let currentUser = null;
let selectedUserId = null;

const els = {};

function apiUrl(path, userId) {
  const u = new URL(`${API_BASE}${path}`);
  if (userId && currentUser && currentUser.role === 'admin' && userId !== currentUser.id) {
    u.searchParams.set('user', userId);
  }
  u.searchParams.set('_', Date.now());
  return u.toString();
}

async function api(path, init = {}, userId = null) {
  const options = {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...(init.headers || {}) },
  };
  const r = await fetch(apiUrl(path, userId), options);
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error((data && data.error) || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return data;
}

function escapeHTML(t = '') {
  return String(t).replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'short', day:'numeric' });
}

function renderSessions(sessions) {
  if (!sessions.length) {
    els.sessionsList.innerHTML = `
      <div class="empty-state">
        <p>No sessions yet</p>
        <p style="font-size:0.9em;">Add your first session with the + button</p>
      </div>`;
    return;
  }

  const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
  els.sessionsList.innerHTML = sorted.map((s) => {
    const notesHTML = escapeHTML(s.notes || '').replace(/\n/g, '<br>');
    const dur = parseInt(s.duration, 10) || 0;
    return `
      <div class="session-card">
        <div class="session-notes">${notesHTML || '<span style="color:#6b5d4f">No notes for this session</span>'}</div>
        <div class="session-meta">
          <span class="session-duration">${dur} min</span>
          <span class="session-date">${formatDate(s.date)}</span>
        </div>
      </div>`;
  }).join('');
}

function updateStats(sessions) {
  const y = new Date().getFullYear();
  const daysThisYear = new Set(
    sessions.filter(s => new Date(`${s.date}T00:00:00`).getFullYear() === y).map(s => s.date)
  ).size;
  const totalMinutes = sessions.reduce((a, s) => a + (parseInt(s.duration, 10) || 0), 0);
  els.daysThisYear.textContent = daysThisYear;
  els.totalSessions.textContent = sessions.length;
  els.totalMinutes.textContent = totalMinutes;
}

function renderTakeaways(items) {
  els.takeawaysList.innerHTML = (items || []).map(x => `<li>${escapeHTML(x)}</li>`).join('');
}

async function loadJournal(userId) {
  const [entryData, takeawayData] = await Promise.all([
    api('/api/entries', {}, userId),
    api('/api/takeaways', {}, userId),
  ]);
  renderSessions(entryData.entries || []);
  updateStats(entryData.entries || []);
  renderTakeaways(takeawayData.items || []);
}

function showLogin() {
  els.authGate.hidden = false;
  els.journalApp.hidden = true;
}

function showJournal() {
  els.authGate.hidden = true;
  els.journalApp.hidden = false;
}

async function configureAdminSelector() {
  if (currentUser.role !== 'admin') {
    els.viewerControls.hidden = true;
    return;
  }

  const data = await api('/api/users');
  els.viewerSelect.innerHTML = (data.users || []).map((u) =>
    `<option value="${escapeHTML(u.id)}">${escapeHTML(u.displayName)}${u.id === currentUser.id ? ' (me)' : ''}</option>`
  ).join('');
  els.viewerSelect.value = currentUser.id;
  els.viewerControls.hidden = false;

  els.viewerSelect.addEventListener('change', async () => {
    selectedUserId = els.viewerSelect.value;
    await loadJournal(selectedUserId);
  });
}

async function boot() {
  Object.assign(els, {
    authGate: document.getElementById('authGate'),
    journalApp: document.getElementById('journalApp'),
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    viewerControls: document.getElementById('viewerControls'),
    viewerSelect: document.getElementById('viewerSelect'),
    takeawaysList: document.getElementById('takeawaysList'),
    sessionsList: document.getElementById('sessionsList'),
    daysThisYear: document.getElementById('daysThisYear'),
    totalSessions: document.getElementById('totalSessions'),
    totalMinutes: document.getElementById('totalMinutes'),
  });

  els.loginBtn.addEventListener('click', () => {
    window.location.assign(`${API_BASE}/auth`);
  });

  els.logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } finally {
      location.reload();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!els.journalApp.hidden && e.key && e.key.toLowerCase() === 'n') {
      window.location.href = '/meditation/admin/';
    }
  });

  try {
    currentUser = await api('/api/me');
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      return;
    }
    console.error(err);
    els.authGate.querySelector('.auth-message').textContent = 'Could not connect to the journal service.';
    showLogin();
    return;
  }

  els.userAvatar.src = currentUser.avatar_url || '';
  els.userName.textContent = currentUser.displayName || currentUser.login;
  selectedUserId = currentUser.id;
  showJournal();
  await configureAdminSelector();
  await loadJournal(selectedUserId);
}

document.addEventListener('DOMContentLoaded', boot);
