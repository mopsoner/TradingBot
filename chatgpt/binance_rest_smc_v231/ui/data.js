function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function fmtTime(ms) {
  if (!ms) return 'n/a';
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}
async function loadDataFiles() {
  const res = await fetch('/api/data-files?_=' + Date.now());
  const payload = await res.json();
  const el = document.getElementById('dataFiles');
  if (!payload.ok || !Array.isArray(payload.files)) {
    document.getElementById('dataMeta').textContent = 'Erreur chargement data';
    el.innerHTML = '<div class="stat-pill wide"><span class="k">Data</span><strong>Erreur chargement</strong></div>';
    return;
  }
  document.getElementById('dataMeta').textContent = `${payload.files.length} fichier(s) JSON`;
  if (!payload.files.length) {
    el.innerHTML = '<div class="stat-pill wide"><span class="k">Data</span><strong>Aucun JSON trouvé</strong></div>';
    return;
  }
  el.innerHTML = payload.files.map(f => `
    <article class="signal small-card">
      <div class="topline">
        <div>
          <div class="symbol">${f.name}</div>
          <div class="subline">${fmtSize(f.size)} · ${fmtTime(f.mtime)}</div>
        </div>
        <a class="navbtn" href="${f.url}" download>Download</a>
      </div>
      <div class="actions">
        <a class="navbtn" href="${f.url}" target="_blank">Open</a>
      </div>
    </article>
  `).join('');
}
loadDataFiles().catch(err => {
  document.getElementById('dataMeta').textContent = 'Erreur chargement data: ' + err;
});
