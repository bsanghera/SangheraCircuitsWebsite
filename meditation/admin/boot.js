/* Meditation Admin Boot — capture token + manual init + nudge router */

// 1) Capture OAuth popup message and persist the token for Decap
window.addEventListener('message', (e) => {
  if (typeof e.data === 'string' && e.data.startsWith('authorization:github:success:')) {
    const token = e.data.split(':').pop();
    try {
      localStorage.setItem('decap-cms-auth', JSON.stringify({ token, provider: 'github' }));
      console.log('[admin] Stored GitHub token in localStorage');
    } catch (_) {}
    // After storing, try initializing (in case CMS is already loaded)
    tryInitCMS();
  }
});

// 2) Tell Decap we will initialize manually
window.CMS_MANUAL_INIT = true;

// 3) Poll for the CMS global, then initialize with the on-disk config.yml
function tryInitCMS() {
  if (!window.CMS || !window.CMS.init) {
    setTimeout(tryInitCMS, 100);
    return;
  }

  // Avoid double init
  if (window.__cmsInited) return;
  window.__cmsInited = true;

  console.log('[admin] Initializing Decap CMS…');
  // Let Decap fetch /meditation/admin/config.yml itself
  window.CMS.init({ config: { load_config_file: true } });

  // Once the app bootstraps, nudge the router if needed
  const kickRouter = () => {
    try {
      // If stuck at "#/", push to collections
      if (location.hash === '#/' || location.hash === '#') {
        location.hash = '#/collections/entries';
      }
    } catch (_) {}
  };

  // Give the SPA a moment to load, then nudge
  setTimeout(kickRouter, 600);
  setTimeout(kickRouter, 1500);
}

// 4) Also try to init on load (covers case where token already exists)
document.addEventListener('DOMContentLoaded', () => {
  // If token already present (previous login), init immediately
  try {
    const existing = localStorage.getItem('decap-cms-auth');
    if (existing) {
      console.log('[admin] Found existing token, booting CMS');
      tryInitCMS();
      return;
    }
  } catch (_) {}

  // Even without a token, initialize so the Login button appears
  tryInitCMS();
});
