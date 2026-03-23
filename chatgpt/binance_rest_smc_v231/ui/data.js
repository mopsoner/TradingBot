function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function fmtTime(ms) {
  if (!ms) return 'n/a';
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}
function fmtIso(iso) { if (!iso) return 'n/a'; try { return new Date(iso).toLocaleString(); } catch { return String(iso); } }
function metric(label, value, cls = '') { return `<div class="metric-card"><span class="metric-label">${label}</span><strong class="${cls}">${value}</strong></div>`; }
async function loadDataFiles() {
  const res = await fetch('/api/data-files?_=' + Date.now());
  const payload = await res.json();
  const el = document.getElementById('dataFiles');
  if (!payload.ok || !Array.isArray(payload.files)) {
    el.innerHTML = '<div class="empty-state">Erreur chargement fichiers.</div>';
    return;
  }
  if (!payload.files.length) {
    el.innerHTML = '<div class="empty-state">Aucun fichier trouvé</div>';
    return;
  }
  el.innerHTML = payload.files.map(f => `
    <article class="row-card">
      <div class="row-main">
        <div>
          <div class="symbol">${f.name}</div>
          <div class="subline">${fmtSize(f.size)} · ${fmtTime(f.mtime)}</div>
        </div>
        <div class="trade-pills"><a class="navbtn" href="${f.url}" download>Télécharger</a><a class="navbtn" href="${f.url}" target="_blank">Ouvrir</a></div>
      </div>
    </article>
  `).join('');
}
async function loadSystemHealth() {
  const res = await fetch('/api/system-health?_=' + Date.now());
  const payload = await res.json();
  const h = payload.health || {};
  document.getElementById('systemHealth').innerHTML = [
    metric('Runner', h.runner_detected ? 'yes' : 'no', h.runner_detected ? 'positive' : 'negative'),
    metric('Runtime', h.runtime?.paused ? 'paused' : 'running', h.runtime?.paused ? 'negative' : 'positive'),
    metric('Signals DB', h.db_ok ? 'ok' : 'bad', h.db_ok ? 'positive' : 'negative'),
    metric('OHLC DB', h.ohlc_ok ? 'ok' : 'bad', h.ohlc_ok ? 'positive' : 'negative'),
    metric('Dashboard', h.dashboard_generated_at ? fmtIso(h.dashboard_generated_at) : 'n/a'),
    metric('Processes', String(h.process_count ?? 0)),
  ].join('');
}
async function loadCoverage() {
  const res = await fetch('/api/data-coverage?_=' + Date.now());
  const payload = await res.json();
  const coverage = payload.coverage || { rows: [], symbols: [], intervals: [] };
  document.getElementById('coverageSummary').innerHTML = [
    metric('Symbols', String((coverage.symbols || []).length)),
    metric('Intervals', String((coverage.intervals || []).length)),
    metric('Rows', String((coverage.rows || []).length)),
  ].join('');
  const tbody = document.getElementById('coverageRows');
  const rows = Array.isArray(coverage.rows) ? coverage.rows : [];
  document.getElementById('dataMeta').textContent = `${rows.length} couverture(s) · ${(coverage.symbols || []).length} symbole(s)`;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Aucune couverture.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `<tr><td><strong>${r.symbol}</strong></td><td>${r.interval}</td><td>${r.count}</td><td>${fmtTime(r.first_open_time)}</td><td>${fmtTime(r.last_close_time)}</td></tr>`).join('');
}
Promise.all([loadSystemHealth(), loadCoverage(), loadDataFiles()]).catch(err => {
  document.getElementById('dataMeta').textContent = 'Erreur chargement data: ' + err;
});
