let dashboardCache = null;

function fmtTime(ms) {
  if (!ms) return 'n/a';
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}
function fmtNum(v, d = 2) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return 'n/a';
  return Number(v).toFixed(d);
}
function stageRank(sig) {
  const p = sig.pipeline || {};
  if (p.trade) return 5;
  if (p.confirm) return 4;
  if (p.zone) return 3;
  if (p.liquidity) return 2;
  if (p.collect) return 1;
  return 0;
}
function stageName(sig) {
  const p = sig.pipeline || {};
  if (p.trade) return 'trade';
  if (p.confirm) return 'confirm';
  if (p.zone) return 'zone';
  if (p.liquidity) return 'liquidity';
  if (p.collect) return 'collect';
  return 'none';
}
function isActionable(sig) {
  return stageName(sig) === 'trade' && !sig.confirm_blocked_by_session && sig.trade?.status === 'simulated';
}
function metric(label, value, cls = '', sub = '') {
  return `<div class="metric-card"><span class="metric-label">${label}</span><strong class="${cls}">${value}</strong>${sub ? `<span class="metric-sub">${sub}</span>` : ''}</div>`;
}
function pill(text, cls = 'pill-neutral') {
  return `<span class="pill ${cls}">${text}</span>`;
}
function renderTradeCard(sig) {
  const side = sig.trade?.side || (sig.bias === 'bull_confirm' ? 'long' : 'short');
  return `<article class="trade-card ${side === 'long' ? 'trade-long' : 'trade-short'}"><div class="trade-card-top"><div><div class="trade-symbol">${sig.symbol}</div><div class="trade-sub">${sig.session} · ${sig.trigger}</div></div><div class="trade-score">${sig.score ?? 'n/a'}</div></div><div class="trade-pills">${pill(side, side === 'long' ? 'pill-long' : 'pill-short')}${pill(sig.confirm_source || 'n/a')}${sig.liquidity_target?.type ? pill(sig.liquidity_target.type) : ''}</div><div class="trade-grid"><div><span class="label">Entry</span><strong>${fmtNum(sig.trade?.entry ?? sig.price, 4)}</strong></div><div><span class="label">Stop</span><strong>${fmtNum(sig.trade?.stop, 4)}</strong></div><div><span class="label">Target</span><strong>${fmtNum(sig.trade?.target, 4)}</strong></div><div><span class="label">RSI</span><strong>${fmtNum(sig.rsi_main, 2)}</strong></div></div></article>`;
}
function applyFilters(signals) {
  const symbolQ = (document.getElementById('filterSymbol')?.value || '').trim().toUpperCase();
  const minScore = Number(document.getElementById('filterScore')?.value || '0');
  const stageQ = document.getElementById('filterStage')?.value || 'all';
  const biasQ = document.getElementById('filterBias')?.value || 'all';
  const actionableQ = document.getElementById('filterActionable')?.value || 'all';
  return (signals || []).filter(sig => {
    if (symbolQ && !(sig.symbol || '').includes(symbolQ)) return false;
    if ((sig.score || 0) < minScore) return false;
    if (stageQ !== 'all' && stageName(sig) !== stageQ) return false;
    if (biasQ !== 'all' && sig.bias !== biasQ) return false;
    if (actionableQ === 'actionable' && !isActionable(sig)) return false;
    if (actionableQ === 'blocked' && !sig.confirm_blocked_by_session) return false;
    if (actionableQ === 'watch' && !String(sig.bias || '').includes('watch')) return false;
    return true;
  });
}
function applySort(signals) {
  const sortBy = document.getElementById('sortBy')?.value || 'score_desc';
  const out = [...signals];
  out.sort((a, b) => {
    if (sortBy === 'score_desc') return (b.score || 0) - (a.score || 0);
    if (sortBy === 'score_asc') return (a.score || 0) - (b.score || 0);
    if (sortBy === 'symbol_asc') return String(a.symbol || '').localeCompare(String(b.symbol || ''));
    if (sortBy === 'session_asc') return String(a.session || '').localeCompare(String(b.session || ''));
    if (sortBy === 'stage_desc') return stageRank(b) - stageRank(a);
    if (sortBy === 'updated_desc') return (b.signal_time || 0) - (a.signal_time || 0);
    return 0;
  });
  return out;
}
function renderHero(signals) {
  const hero = document.getElementById('heroMetrics');
  const actionable = signals.filter(isActionable);
  const blocked = signals.filter(s => s.confirm_blocked_by_session).length;
  const confirms = signals.filter(s => stageName(s) === 'confirm' || stageName(s) === 'trade').length;
  const maxScore = signals.length ? Math.max(...signals.map(s => s.score || 0)) : 0;
  hero.innerHTML = [
    metric('Cryptos batch', String(signals.length), signals.length ? 'positive' : ''),
    metric('Trades à placer', String(actionable.length), actionable.length ? 'positive' : ''),
    metric('Confirm / trade', String(confirms), confirms ? 'positive' : ''),
    metric('Blocked session', String(blocked), blocked ? 'negative' : ''),
    metric('Top score', String(maxScore), maxScore >= 6 ? 'positive' : ''),
  ].join('');
}
function renderStatus(signals) {
  const el = document.getElementById('statusBoard');
  const paused = document.getElementById('runtimeToggle')?.dataset.paused === '1';
  const stageCounts = { collect:0, liquidity:0, zone:0, confirm:0, trade:0 };
  signals.forEach(sig => { stageCounts[stageName(sig)] = (stageCounts[stageName(sig)] || 0) + 1; });
  el.innerHTML = [
    metric('Moteur', paused ? 'paused' : 'running', paused ? 'negative' : 'positive'),
    metric('Collect', String(stageCounts.collect || 0)),
    metric('Liquidity', String(stageCounts.liquidity || 0)),
    metric('Zone', String(stageCounts.zone || 0)),
    metric('Confirm', String(stageCounts.confirm || 0), stageCounts.confirm ? 'positive' : ''),
    metric('Trade', String(stageCounts.trade || 0), stageCounts.trade ? 'positive' : ''),
  ].join('');
}
function renderTradeNow(signals) {
  const el = document.getElementById('tradeNowBoard');
  const actionable = applySort(signals.filter(isActionable)).slice(0, 6);
  el.innerHTML = actionable.length ? actionable.map(renderTradeCard).join('') : '<div class="empty-state">Aucun trade confirmé à placer pour l’instant.</div>';
}
function renderTable(signals) {
  const tbody = document.getElementById('strategyTableBody');
  const meta = document.getElementById('tableMeta');
  const filtered = applySort(applyFilters(signals));
  if (meta) meta.textContent = `${filtered.length} ligne(s) affichée(s)`;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">Aucune crypto ne correspond aux filtres.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(sig => {
    const side = sig.trade?.side || '';
    const confirmText = sig.confirm_blocked_by_session ? 'blocked session' : (sig.confirm_source || 'n/a');
    return `<tr>
      <td><strong>${sig.symbol || 'n/a'}</strong></td>
      <td><span class="score-chip ${(sig.score||0)>=6 ? 'score-good' : (sig.score||0)>=4 ? 'score-mid' : ''}">${sig.score ?? 0}</span></td>
      <td>${pill(stageName(sig))}</td>
      <td>${pill(sig.bias || 'neutral', String(sig.bias || '').includes('bull') ? 'pill-long' : String(sig.bias || '').includes('bear') ? 'pill-short' : 'pill-neutral')}</td>
      <td>${sig.trigger || 'wait'}</td>
      <td>${sig.session || 'n/a'}</td>
      <td>${fmtNum(sig.rsi_main, 2)}</td>
      <td>${fmtNum(sig.price, 4)}</td>
      <td>${side ? pill(side, side === 'long' ? 'pill-long' : 'pill-short') : pill('watch')}</td>
      <td>${confirmText}</td>
      <td>${fmtTime(sig.signal_time)}</td>
    </tr>`;
  }).join('');
}
async function loadRuntime() {
  try {
    const res = await fetch('/api/runtime?_=' + Date.now());
    const payload = await res.json();
    const btn = document.getElementById('runtimeToggle');
    if (!btn || !payload.ok) return;
    const paused = !!payload.runtime?.paused;
    btn.textContent = paused ? 'Resume batch' : 'Pause batch';
    btn.dataset.paused = paused ? '1' : '0';
    btn.classList.toggle('paused-btn', paused);
    if (dashboardCache?.signals) renderStatus(dashboardCache.signals || []);
  } catch {}
}
async function toggleRuntime() {
  const btn = document.getElementById('runtimeToggle');
  const paused = btn?.dataset.paused === '1';
  const res = await fetch('/api/runtime', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ runtime:{ paused:!paused } }) });
  const payload = await res.json();
  if (payload.ok) { await loadRuntime(); await loadDashboard(); }
}
async function loadDashboard() {
  const res = await fetch('/data/dashboard.json?_=' + Date.now());
  const data = await res.json();
  dashboardCache = data;
  const mode = data.runtime?.mode ? ` · ${data.runtime.mode}` : '';
  document.getElementById('meta').textContent = 'Dernière génération: ' + data.generated_at + mode;
  const signals = data.signals || [];
  renderHero(signals);
  renderStatus(signals);
  renderTradeNow(signals);
  renderTable(signals);
}
function bindControls() {
  ['filterSymbol','filterScore','filterStage','filterBias','filterActionable','sortBy'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => dashboardCache && renderTable(dashboardCache.signals || []));
    el.addEventListener('change', () => dashboardCache && renderTable(dashboardCache.signals || []));
  });
  const rt = document.getElementById('runtimeToggle');
  if (rt) rt.addEventListener('click', toggleRuntime);
}
bindControls();
Promise.all([loadRuntime(), loadDashboard()]).catch(err => {
  document.getElementById('meta').textContent = 'Erreur chargement dashboard: ' + err;
});
setInterval(() => { loadRuntime(); loadDashboard(); }, 15000);
