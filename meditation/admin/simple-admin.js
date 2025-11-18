/* Minimal GitHub-backed admin. Uses token from your OAuth Worker. */

const REPO = window.ADMIN_REPO;                // "owner/repo"
const BRANCH = "main";
const BASE = "meditation/data";
const OAUTH_BASE = window.OAUTH_BASE;

const els = {
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  userBadge: document.getElementById('userBadge'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
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
/* --- Listen for token from the OAuth popup (Worker posts this) --- */
window.addEventListener('message', (e) => {
  // String format: "authorization:github:success:<token>"
  if (typeof e.data === 'string' && e.data.startsWith('authorization:github:success:')) {
    const token = e.data.split(':').pop();
    if (token) {
      localStorage.setItem('gh_token', token);
      afterLogin(); // proceed to load UI
    }
  }
  // Object formats (belt & suspenders, in case Worker sends object)
  if (e.data && typeof e.data === 'object') {
    if (e.data.token) {
      localStorage.setItem('gh_token', e.data.token);
      afterLogin();
    }
    if (e.data.type === 'authorization:github' && e.data.status === 'success' && e.data.token) {
      localStorage.setItem('gh_token', e.data.token);
      afterLogin();
    }
  }
});

function toast(msg) {
  els.toast.textContent = msg; els.toast.hidden = false;
  setTimeout(()=> els.toast.hidden = true, 2200);
}

function getToken() {
  const m = location.hash.match(/[#/]token=([^&]+)/);
  const hashTok = m ? decodeURIComponent(m[1]) : null;
  if (hashTok) {
    localStorage.setItem('gh_token', hashTok);
    history.replaceState(null,'','#/');
  }
  return localStorage.getItem('gh_token');
}

function setAuthedUI(user) {
  els.loginBtn.hidden = true;
  els.userBadge.hidden = false;
  els.userAvatar.src = user.avatar_url;
  els.userName.textContent = user.login;
}
function setLoggedOutUI() {
  els.loginBtn.hidden = false;
  els.userBadge.hidden = true;
}

async function gh(path, init={}) {
  const token = getToken();
  if (!token) throw new Error('No token');
  const headers = Object.assign({
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'meditation-admin'
  }, init.headers||{});
  const r = await fetch(`https://api.github.com${path}`, Object.assign({}, init, { headers }));
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub ${r.status} ${r.statusText}: ${t}`);
  }
  return r;
}
async function getUser() {
  const r = await gh('/user'); return r.json();
}

/* ----- Repo Helpers (GET/PUT contents) ----- */
async function getFile(path) {
  const r = await gh(`/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`);
  return r.json(); // { content, encoding, sha, ... }
}
async function putFile(path, content, sha, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  const r = await gh(`/repos/${REPO}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  return r.json();
}

/* ----- Entries Index helpers ----- */
async function loadIndex() {
  try {
    const j = await getFile(`${BASE}/entries/index.json`);
    const txt = atob(j.content);
    const data = JSON.parse(decodeURIComponent(escape(txt)));
    return { list: Array.isArray(data.files) ? data.files : [], sha: j.sha };
  } catch (e) {
    // create an empty index if missing
    return { list: [], sha: null };
  }
}
async function saveIndex(files, sha) {
  const json = JSON.stringify({ files }, null, 2) + "\n";
  return putFile(`${BASE}/entries/index.json`, json, sha, "Update entries index");
}

/* ----- Takeaways ----- */
async function loadTakeaways() {
  const j = await getFile(`${BASE}/takeaways.json`);
  const txt = atob(j.content);
  const data = JSON.parse(decodeURIComponent(escape(txt)));
  return { items: data.items || [], sha: j.sha };
}
async function saveTakeaways(items, sha) {
  const json = JSON.stringify({ items }, null, 2) + "\n";
  return putFile(`${BASE}/takeaways.json`, json, sha, "Update takeaways");
}

/* ----- Entries list ----- */
function renderEntriesList(files) {
  if (!files.length) {
    els.entriesList.innerHTML = `<div class="muted">No entries yet.</div>`;
    return;
  }
  els.entriesList.innerHTML = files.map(f => {
    const d = f.replace('.json','');
    return `<div class="item">
      <div><strong>${d}</strong><div class="meta">${BASE}/entries/${f}</div></div>
      <div>
        <button class="btn btn-ghost" data-edit="${f}">Edit</button>
      </div>
    </div>`;
  }).join('');
}

/* ----- Load everything after login ----- */
async function loadAll() {
  // load entries index
  const idx = await loadIndex();
  renderEntriesList(idx.list);

  // load takeaways
  try {
    const tk = await loadTakeaways();
    els.takeawaysText.value = (tk.items || []).join("\n");
    els.takeawaysText.dataset.sha = tk.sha || "";
  } catch {
    // if missing, leave blank
    els.takeawaysText.value = "";
    els.takeawaysText.dataset.sha = "";
  }

  // wire edit buttons
  els.entriesList.addEventListener('click', async (e) => {
    const f = e.target && e.target.getAttribute('data-edit');
    if (!f) return;
    try {
      const j = await getFile(`${BASE}/entries/${f}`);
      const txt = atob(j.content);
      const data = JSON.parse(decodeURIComponent(escape(txt)));
      els.entryDate.value = data.date || f.replace('.json','');
      els.entryDuration.value = data.duration || '';
      els.entryNotes.value = data.notes || '';
      els.entryForm.dataset.sha = j.sha;
      toast(`Loaded ${f}`);
    } catch (err) {
      console.error(err); toast('Failed to load entry');
    }
  });

  // keep index sha around
  els.entriesList.dataset.indexSha = idx.sha || "";
  els.entriesList.dataset.files = JSON.stringify(idx.list);
}

/* ----- Save Entry ----- */
els.entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const date = els.entryDate.value;
  const dur = parseInt(els.entryDuration.value, 10) || 0;
  const notes = els.entryNotes.value || "";

  if (!date || dur < 1) { toast("Date and duration required."); return; }

  const file = `${date}.json`;
  const path = `${BASE}/entries/${file}`;
  const content = JSON.stringify({ date, duration: dur, notes }, null, 2) + "\n";
  const sha = els.entryForm.dataset.sha || null;

  try {
    await putFile(path, content, sha || undefined, sha ? `Update ${file}` : `Add ${file}`);
    // ensure index includes the file
    const current = JSON.parse(els.entriesList.dataset.files || "[]");
    if (!current.includes(file)) current.push(file);
    current.sort(); // keep sorted
    const indexSha = els.entriesList.dataset.indexSha || null;
    await saveIndex(current, indexSha || undefined);

    // reset state
    els.entryForm.dataset.sha = "";
    els.entriesList.dataset.files = JSON.stringify(current);
    await loadAll();
    toast("Entry saved!");
  } catch (err) {
    console.error(err);
    toast("Save failed (see console).");
  }
});

/* ----- Save Takeaways ----- */
els.saveTakeawaysBtn.addEventListener('click', async () => {
  const items = els.takeawaysText.value.split("\n").map(s => s.trim()).filter(Boolean);
  try {
    await saveTakeaways(items, els.takeawaysText.dataset.sha || undefined);
    toast("Takeaways saved!");
  } catch (err) {
    console.error(err);
    toast("Save failed (see console).");
  }
});

/* ----- Tabs ----- */
els.tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    els.tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    els.tabpanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  });
});

/* ----- Auth buttons ----- */
els.loginBtn.addEventListener('click', () => {
  const w = window.open(`${OAUTH_BASE}/auth`, 'ghoauth', 'width=900,height=700');
  // Fallback: listen for hash-callback after popup posts the token & redirects
  const timer = setInterval(() => {
    const tok = getToken();
    if (tok) { clearInterval(timer); afterLogin(); }
  }, 400);
});
els.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('gh_token');
  setLoggedOutUI();
});

/* ----- Boot ----- */
async function afterLogin() {
  try {
    const user = await getUser();
    setAuthedUI(user);
    await loadAll();
  } catch (err) {
    console.error(err);
    toast("Auth failed—try logging in again.");
    setLoggedOutUI();
  }
}

(async function boot() {
  // preferred: read token from hash (popup redirect) or from localStorage
  getToken();
  const tok = localStorage.getItem('gh_token');
  if (tok) { await afterLogin(); } else { setLoggedOutUI(); }
})();
