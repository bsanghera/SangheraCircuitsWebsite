/* Admin boot: capture token (postMessage or hash), verify it, then init CMS inline */

const REPO = 'bsanghera/SangheraCircuitsWebsite';
const WORKER_BASE = 'https://late-cell-3508.bsanghera27.workers.dev';

// ---- 1) Capture token via postMessage (normal Decap flow)
window.addEventListener('message', (e) => {
  if (typeof e.data === 'string' && e.data.startsWith('authorization:github:success:')) {
    const token = e.data.split(':').pop();
    storeToken(token);
  }
});

// ---- 2) Capture token via URL hash (fallback)
// e.g. /meditation/admin/#/token=<access_token>
function readHashToken() {
  const h = location.hash || '';
  const m = h.match(/[#/]token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function storeToken(token) {
  if (!token) return;
  localStorage.setItem('decap-cms-auth', JSON.stringify({ token, provider: 'github' }));
  console.log('[admin] Stored GitHub token in localStorage');
  // Clean hash
  try { history.replaceState(null, '', '#/collections/entries'); } catch {}
  initFlow(); // continue
}

// ---- 3) Simple diagnostic: prove token is valid
async function diagnoseToken(token) {
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'decap-debug' }
    });
    const txt = await r.text();
    console.log('[diag] GET /user status=', r.status, 'body=', txt);
  } catch (e) {
    console.error('[diag] call to GitHub failed:', e);
  }
}

// ---- 4) Manual init so we control startup timing
window.CMS_MANUAL_INIT = true;

function inlineConfig() {
  // Same content as config.yml, but inline to avoid fetch/path issues
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
    ]
  };
}

function tryInitCMS() {
  if (!window.CMS || !window.CMS.init) {
    setTimeout(tryInitCMS, 100);
    return;
  }
  if (window.__cmsInited) return;
  window.__cmsInited = true;

  console.log('[admin] Initializing Decap CMS (inline config, no file)…');

  const cfg = inlineConfig();
  // 🔒 important: do NOT load the on-disk config.yml — prevents duplicate collections
  cfg.load_config_file = false;

  window.CMS.init({ config: cfg });

  setTimeout(() => {
    if (location.hash === '#/' || location.hash === '#') {
      location.hash = '#/collections/entries';
    }
  }, 600);
}

function initFlow() {
  tryInitCMS();

  // Optional: log token + basic GitHub call
  try {
    const stored = localStorage.getItem('decap-cms-auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) diagnoseToken(token);
    }
  } catch {}
}

// ---- 5) First-load logic
document.addEventListener('DOMContentLoaded', () => {
  // If token already present, proceed
  try {
    const existing = localStorage.getItem('decap-cms-auth');
    if (existing) {
      console.log('[admin] Found existing token, booting CMS');
      initFlow();
      return;
    }
  } catch {}

  // Try URL-hash token, then fall back to showing the login button
  const hashTok = readHashToken();
  if (hashTok) storeToken(hashTok);
  else initFlow();
});
