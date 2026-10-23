const API_BASE = String(window.MEDITATION_API_BASE || '').replace(/\/$/, '');
let currentUser = null;
let selectedUserId = null;
let loadedEntries = [];

const els = {
  authGate: document.getElementById('authGate'),
  editorApp: document.getElementById('editorApp'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  userBadge: document.getElementById('userBadge'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
  viewerControls: document.getElementById('viewerControls'),
  viewerSelect: document.getElementById('viewerSelect'),
  entryForm: document.getElementById('entryForm'),
  entryDate: document.getElementById('entryDate'),
  entryDuration: document.getElementById('entryDuration'),
  entryNotes: document.getElementById('entryNotes'),
  entriesList: document.getElementById('entriesList'),
  takeawaysText: document.getElementById('takeawaysText'),
  saveTakeawaysBtn: document.getElementById('saveTakeawaysBtn'),
  toast: document.getElementById('toast'),
  tabs: document.querySelectorAll('.tab'),
  tabpanels: document.querySelectorAll('.tabpanel'),
};

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  setTimeout(() => { els.toast.hidden = true; }, 2200);
}

function apiUrl(path, userId) {
  const u = new URL(`${API_BASE}${path}`);
  if (userId && currentUser && currentUser.role === 'admin' && userId !== currentUser.id) {
    u.searchParams.set('user', userId);
  }
  if (path !== '/api/logout') u.searchParams.set('_', Date.now());
  return u.toString();
}

async function api(path, init = {}, userId = null) {
  const r = await fetch(apiUrl(path, userId), {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...(init.headers || {}) },
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error((data && data.error) || `Request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  return data;
}

function esc(value = '') {
  return String(value).replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
}

function showLogin() {
  els.authGate.hidden = false;
  els.editorApp.hidden = true;
}

function showEditor() {
  els.authGate.hidden = true;
  els.editorApp.hidden = false;
}

function renderEntriesList(entries) {
  loadedEntries = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!loadedEntries.length) {
    els.entriesList.innerHTML = '<div class="muted">No entries yet.</div>';
    return;
  }
  els.entriesList.innerHTML = loadedEntries.map((entry) => `
    <div class="item">
      <div>
        <strong>${esc(entry.date)}</strong>
        <div class="meta">${parseInt(entry.duration, 10) || 0} min</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost" type="button" data-edit="${esc(entry.date)}">Edit</button>
        <button class="btn btn-ghost danger" type="button" data-delete="${esc(entry.date)}">Delete</button>
      </div>
    </div>`).join('');
}

async function loadAll() {
  const [entriesData, takeawaysData] = await Promise.all([
    api('/api/entries', {}, selectedUserId),
    api('/api/takeaways', {}, selectedUserId),
  ]);
  renderEntriesList(entriesData.entries || []);
  els.takeawaysText.value = (takeawaysData.items || []).join('\n');
  els.entryForm.reset();
  els.entryForm.dataset.originalDate = '';
}

async function configureAdminSelector() {
  if (currentUser.role !== 'admin') {
    els.viewerControls.hidden = true;
    return;
  }
  const data = await api('/api/users');
  els.viewerSelect.innerHTML = (data.users || []).map((u) =>
    `<option value="${esc(u.id)}">${esc(u.displayName)}${u.id === currentUser.id ? ' (me)' : ''}</option>`
  ).join('');
  els.viewerSelect.value = currentUser.id;
  els.viewerControls.hidden = false;
  els.viewerSelect.addEventListener('change', async () => {
    selectedUserId = els.viewerSelect.value;
    await loadAll();
  });
}

els.entriesList.addEventListener('click', async (e) => {
  const editDate = e.target && e.target.getAttribute('data-edit');
  const deleteDate = e.target && e.target.getAttribute('data-delete');

  if (editDate) {
    const entry = loadedEntries.find((x) => x.date === editDate);
    if (!entry) return;
    els.entryDate.value = entry.date || '';
    els.entryDuration.value = entry.duration || '';
    els.entryNotes.value = entry.notes || '';
    els.entryForm.dataset.originalDate = entry.date || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Loaded ${entry.date}`);
  }

  if (deleteDate) {
    if (!confirm(`Delete the ${deleteDate} entry?`)) return;
    try {
      await api(`/api/entries/${encodeURIComponent(deleteDate)}`, { method: 'DELETE' }, selectedUserId);
      await loadAll();
      toast('Entry deleted');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Delete failed');
    }
  }
});

els.entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = els.entryDate.value;
  const duration = parseInt(els.entryDuration.value, 10) || 0;
  const notes = els.entryNotes.value || '';

  if (!date || duration < 1) {
    toast('Date and duration required.');
    return;
  }

  const originalDate = els.entryForm.dataset.originalDate || '';
  if (originalDate && originalDate !== date) {
    toast('To change an entry date, delete the old entry and save a new one.');
    return;
  }

  try {
    await api('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, duration, notes }),
    }, selectedUserId);
    await loadAll();
    toast('Entry saved!');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Save failed');
  }
});

els.saveTakeawaysBtn.addEventListener('click', async () => {
  const items = els.takeawaysText.value.split('\n').map(s => s.trim()).filter(Boolean);
  try {
    await api('/api/takeaways', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }, selectedUserId);
    toast('Takeaways saved!');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Save failed');
  }
});

els.tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    els.tabpanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  });
});

els.loginBtn.addEventListener('click', () => {
  window.location.assign(`${API_BASE}/auth`);
});

els.logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    window.location.href = '/meditation/';
  }
});

(async function boot() {
  try {
    currentUser = await api('/api/me');
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      return;
    }
    console.error(err);
    showLogin();
    return;
  }

  els.userAvatar.src = currentUser.avatar_url || '';
  els.userName.textContent = currentUser.displayName || currentUser.login;
  els.userBadge.hidden = false;
  selectedUserId = currentUser.id;
  showEditor();
  await configureAdminSelector();
  await loadAll();
})();
