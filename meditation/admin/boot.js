// If we already have a token, nothing to do.
(function ensureToken() {
  try {
    const existing = localStorage.getItem('decap-cms-auth');
    if (existing) return;
  } catch (_) {}

  // Listen for the GitHub OAuth popup response.
  window.addEventListener('message', (e) => {
    // Decap’s GitHub OAuth flow posts a string like "authorization:github:success:<token>"
    if (typeof e.data === 'string' && e.data.startsWith('authorization:github:success:')) {
      const token = e.data.split(':').pop();
      try {
        localStorage.setItem('decap-cms-auth', JSON.stringify({ token, provider: 'github' }));
      } catch (_) {}
      // Reload to let Decap pick up the token and initialize the editor
      location.reload();
    }
  });
})();
