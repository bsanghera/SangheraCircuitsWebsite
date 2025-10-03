async function loadJSON(path){
  const r = await fetch(path + '?nocache=' + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("Fetch failed: " + path);
  return r.json();
}

async function loadEntries() {
  try {
    const idx = await loadJSON("/meditation/data/entries/index.json");
    const files = (idx && Array.isArray(idx.files)) ? idx.files : [];
    const entries = [];
    for (const file of files) {
      try {
        const data = await loadJSON("/meditation/data/entries/" + file);
        entries.push(data);
      } catch (e) {
        console.error("Failed to load", file, e);
      }
    }
    return entries;
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function init() {
  try {
    const takeaways = await loadJSON("/meditation/data/takeaways.json").then(d => d.items || []);
    fillTakeaways(takeaways);
  } catch (e) {
    console.error(e);
  }
  const sessions = await loadEntries();
  renderSessions(sessions);
  updateStats(sessions);
}

function fillTakeaways(items){
  const ul = document.getElementById('takeawaysList');
  ul.innerHTML = (items || []).map(x => `<li>${escapeHTML(x)}</li>`).join("");
}

function escapeHTML(t=''){
  return t.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function formatDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function renderSessions(sessions){
  const container = document.getElementById('sessionsList');
  if (!sessions.length){
    container.innerHTML = `
      <div class="empty-state">
        <p>No sessions yet</p>
        <p style="font-size: 0.9em;">Add your first session in the admin</p>
      </div>`;
    return;
  }
  const sorted = [...sessions].sort((a,b)=> new Date(b.date) - new Date(a.date));
  container.innerHTML = sorted.map(s => `
    <div class="session-card">
      <div class="session-header">
        <div class="session-date">${formatDate(s.date)}</div>
        <div class="session-duration">${parseInt(s.duration,10) || 0} min</div>
      </div>
      <div class="session-notes">${escapeHTML(s.notes || '').replace(/\n/g,'<br>')}</div>
    </div>
  `).join('');
}

function updateStats(sessions){
  const y = new Date().getFullYear();
  const daysThisYear = new Set(
    sessions.filter(s => new Date(s.date + 'T00:00:00').getFullYear() === y)
            .map(s => s.date)
  ).size;
  const totalMinutes = sessions.reduce((a, s) => a + (parseInt(s.duration,10)||0), 0);
  document.getElementById('daysThisYear').textContent = daysThisYear;
  document.getElementById('totalSessions').textContent = sessions.length;
  document.getElementById('totalMinutes').textContent = totalMinutes;
}

document.addEventListener('DOMContentLoaded', init);
