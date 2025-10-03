/* Boot & diagnostics: capture token, init CMS (inline config), then probe backend */

const REPO = 'bsanghera/SangheraCircuitsWebsite';
const WORKER_BASE = 'https://late-cell-3508.bsanghera27.workers.dev';

window.CMS_MANUAL_INIT = true;

// ---- token capture (postMessage and hash fallback)
window.addEventListener('message', (e) => {
  if (typeof e.data === 'string' && e.data.startsWith('authorization:github:success:')) {
    const token = e.data.split(':').pop();
    storeToken(token);
  }
});
function readHashToken() {
  const h = location.hash || '';
  const m = h.match(/[#/]token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function storeToken(token) {
  if (!token) return;
  localStorage.setItem('decap-cms-auth', JSON.stringify({ token, provider: 'github' }));
  console.log('[admin] Stored GitHub token in localStorage');
  try { history.replaceState(null, '', '#/collections/entries'); } catch {}
  initFlow();
}

// ---- inline config (to avoid config.yml fetch issues)
function inlineConfig() {
  return {
    backend: {
      name: 'github',
      repo: REPO,
      branch: 'main',
      base_url: WORKER_BASE,
      auth_endpoint: '/auth'
    },
    media_folder: 'meditation/uploads',
    public_folder: '/meditation/uploads',
    collections: [
      {
        name: 'entries',
        label: 'Meditation Entries',
        folder: 'meditation/data/entries',
        create: true,
        extension: 'json',
        format: 'json',
        slug: '{{year}}-{{month}}-{{day}}',
        identifier_field: 'date',
        summary: "{{date | date('MMM D, YYYY')}} — {{duration}} min",
        fields: [
          { label: 'Date', name: 'date', widget: 'date' },
          { label: 'Duration (min)', name: 'duration', widget: 'number', value_type: 'int', min: 1 },
          { label: 'Notes', name: 'notes', widget: 'text', required: false }
        ]
      },
      {
        name: 'takeaways',
        label: 'Key Takeaways',
        files: [
          {
            label: 'Takeaways',
            name: 'takeaways',
            file: 'meditation/data/takeaways.json',
            fields: [
              { label: 'Items', name: 'items', widget: 'list',
                field: { label: 'Takeaway', name: 'item', widget: 'string' } }
            ]
          }
        ]
      },
      {
        name: 'entries_index',
        label: 'Entries Index',
        files: [
          {
            label: 'Index',
            name: 'index',
            file: 'meditation/data/entries/index.json',
            fields: [
              { label: 'Files', name: 'files', widget: 'list',
                field: { label: 'Filename (YYYY-MM-DD.json)', name: 'file', widget: 'string' } }
            ]
          }
        ]
      }
    ],
    load_config_file: false
  };
}

// ---- init & probe
function tryInitCMS() {
  if (!window.CMS || !window.CMS.init) return setTimeout(tryInitCMS, 100);
  if (window.__cmsInited) return;
  window.__cmsInited = true;

  console.log('[admin] Initializing Decap CMS (inline config, no file)…');
  window.CMS.init({ config: inlineConfig() });

  // after core loads, run probes
  setTimeout(runDiagnostics, 800);
}

async function runDiagnostics() {
  try {
    const backend = window.CMS && window.CMS.getBackend && window.CMS.getBackend();
    if (!backend) {
      console.warn('[diag] CMS backend not ready yet'); 
      return setTimeout(runDiagnostics, 400);
    }

    // 1) Is Decap logged in?
    const status = await backend.status();
    console.log('[diag] backend.status() =>', status);

    // 2) Try a simple GitHub API call with the same token (should be 200)
    const raw = localStorage.getItem('decap-cms-auth');
    const token = raw ? JSON.parse(raw).token : null;
    if (token) {
      const r = await fetch('https://api.github.com/repos/' + REPO, {
        headers: { Authorization: `token ${token}`, 'User-Agent': 'decap-debug' }
      });
      console.log('[diag] GET /repos status=', r.status);
      if (!r.ok) console.warn('[diag] /repos error body=', await r.text());
    } else {
      console.warn('[diag] no token in storage?');
    }

    // 3) Use Decap backend to list your content folder (this is what the UI does)
    const entriesList = await backend.listFiles('meditation/data/entries');
    console.log('[diag] listFiles(entries) count=', entriesList.length);

    // 4) Read the index and takeaways via the backend
    const idx = await backend.readFile('meditation/data/entries/index.json');
    console.log('[diag] readFile(index.json) len=', idx && idx.data ? idx.data.length : 0);

    const tk = await backend.readFile('meditation/data/takeaways.json');
    console.log('[diag] readFile(takeaways.json) len=', tk && tk.data ? tk.data.length : 0);

    // If we got here without errors, push to entries collection route (in case router stuck)
    if (location.hash === '#/' || location.hash === '#') {
      location.hash = '#/collections/entries';
    }
  } catch (err) {
    console.error('[diag] threw error:', err);
  }
}

// ---- flow
function initFlow() {
  tryInitCMS();
  // also log current user (direct GitHub)
  try {
    const stored = localStorage.getItem('decap-cms-auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) {
        fetch('https://api.github.com/user', { headers: { Authorization: `token ${token}` } })
          .then(r => r.text())
          .then(t => console.log('[diag] /user again ->', t.slice(0, 120) + '…'))
          .catch(e => console.error('[diag] /user failed', e));
      }
    }
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  const existing = localStorage.getItem('decap-cms-auth');
  if (existing) {
    console.log('[admin] Found existing token, booting CMS');
    initFlow();
    return;
  }
  const hashTok = readHashToken();
  if (hashTok) storeToken(hashTok);
  else initFlow();
});
