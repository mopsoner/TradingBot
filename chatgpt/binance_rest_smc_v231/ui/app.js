let dashboardCache = null;

function fmtTime(ms) {
  if (!ms) return 'n/a';
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}
function fmtIso(iso) {
  if (!iso) return 'n/a';
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
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
function tradingViewUrl(symbol) {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`BINANCE:${symbol}`)}`;
}
function renderTradeCard(sig) {
  const side = sig.trade?.side || (sig.bias === 'bull_confirm' ? 'long' : 'short');
  return `<article class="trade-card ${side === 'long' ? 'trade-long' : 'trade-short'}"><div class="trade-card-top"><div><div class="trade-symbol">${sig.symbol}</div><div class="trade-sub">${sig.session} · ${sig.trigger}</div></div><div class="trade-score">${sig.score ?? 'n/a'}</div></div><div class="trade-pills">${pill(side, side === 'long' ? 'pill-long' : 'pill-short')}${pill(sig.confirm_source || 'n/a')}${sig.liquidity_target?.type ? pill(sig.liquidity_target.type) : ''}<a class="navbtn" href="${tradingViewUrl(sig.symbol)}" target="_blank" rel="noopener noreferrer">TradingView</a></div><div class="trade-grid"><div><span class="label">Entry</span><strong>${fmtNum(sig.trade?.entry ?? sig.price, 4)}</strong></div><div><span class="label">Stop</span><strong>${fmtNum(sig.trade?.stop, 4)}</strong></div><div><span class="label">Target</span><strong>${fmtNum(sig.trade?.target, 4)}</strong></div><div><span class="label">RSI</span><strong>${fmtNum(sig.rsi_main, 2)}</strong></div></div></article>`;
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
function renderLivePulse() {
  const el = document.getElementById('livePulse');
  const recentEl = document.getElementById('recentSymbols');
  const paused = document.getElementById('runtimeToggle')?.dataset.paused === '1';
  const monitor = dashboardCache?.live_monitor || {};
  const stageCounts = monitor.stage_counts || {};
  el.innerHTML = [
    metric('Moteur', paused ? 'paused' : 'running', paused ? 'negative' : 'positive'),
    metric('Dernier tick', monitor.last_tick_at ? fmtIso(monitor.last_tick_at) : 'n/a'),
    metric('Scannés', String(monitor.scanned_symbols ?? 0), (monitor.scanned_symbols ?? 0) > 0 ? 'positive' : 'negative'),
    metric('Wait / collect', String((stageCounts.collect || 0) + (stageCounts.none || 0))),
    metric('Watch / zone', String((stageCounts.liquidity || 0) + (stageCounts.zone || 0))),
    metric('Confirm', String(stageCounts.confirm || 0), (stageCounts.confirm || 0) > 0 ? 'positive' : ''),
    metric('Trade', String(stageCounts.trade || 0), (stageCounts.trade || 0) > 0 ? 'positive' : ''),
    metric('Blocked', String(monitor.blocked_count ?? 0), (monitor.blocked_count ?? 0) > 0 ? 'negative' : ''),
  ].join('');
  const recent = Array.isArray(monitor.recent_symbols) ? monitor.recent_symbols : [];
  recentEl.innerHTML = recent.length ? recent.map(s => `<span class="badge neutral">${s}</span>`).join(' ') : '<span class="hint">Aucun symbole traité</span>';
}
function renderTradeNow(signals) {
  const el = document.getElementById('tradeNowBoard');
  const actionable = applySort(signals.filter(isActionable)).slice(0, 6);
  el.innerHTML = actionable.length ? actionable.map(renderTradeCard).join('') : '<div class="empty-state">Aucun trade confirmé à placer pour l’instant.</div>';
}
function renderLiveRuns(runs) {
  const el = document.getElementById('liveRuns');
  if (!el) return;
  if (!runs.length) {
    el.innerHTML = '<div class="empty-state">Aucun run live enregistré.</div>';
    return;
  }
  el.innerHTML = runs.slice(0, 8).map(run => `
    <article class="row-card">
      <div class="row-main">
        <div>
          <div class="symbol">${run.run_id}</div>
          <div class="subline">${fmtIso(run.started_at)} → ${fmtIso(run.completed_at)}</div>
        </div>
        <div class="trade-pills">${pill(run.runtime_mode || 'n/a')}${pill(`batch ${run.batch_count || 0}`)}${pill(`scan ${run.scanned_count || 0}`)}</div>
      </div>
      <div class="row-grid">
        <div><span class="label">Wait</span><strong>${run.wait_count ?? 0}</strong></div>
        <div><span class="label">Watch</span><strong>${run.watch_count ?? 0}</strong></div>
        <div><span class="label">Confirm</span><strong class="positive">${run.confirm_count ?? 0}</strong></div>
        <div><span class="label">Trade</span><strong class="positive">${run.trade_count ?? 0}</strong></div>
        <div><span class="label">Blocked</span><strong class="negative">${run.blocked_count ?? 0}</strong></div>
        <div><span class="label">Errors</span><strong class="${(run.error_count || 0) > 0 ? 'negative' : ''}">${run.error_count ?? 0}</strong></div>
      </div>
    </article>`).join('');
}
function renderSystemHealth(health) {
  const el = document.getElementById('systemHealth');
  if (!el || !health) return;
  el.innerHTML = [
    metric('Runner', health.runner_detected ? 'yes' : 'no', health.runner_detected ? 'positive' : 'negative'),
    metric('Runtime', health.runtime?.paused ? 'paused' : 'running', health.runtime?.paused ? 'negative' : 'positive'),
    metric('Signals DB', health.db_ok ? 'ok' : 'bad', health.db_ok ? 'positive' : 'negative'),
    metric('OHLC DB', health.ohlc_ok ? 'ok' : 'bad', health.ohlc_ok ? 'positive' : 'negative'),
    metric('Dashboard', health.dashboard_generated_at ? fmtIso(health.dashboard_generated_at) : 'n/a'),
    metric('Processes', String(health.process_count ?? 0), (health.process_count ?? 0) > 0 ? 'positive' : 'negative'),
  ].join('');
}
function renderTable(signals) {
  const tbody = document.getElementById('strategyTableBody');
  const meta = document.getElementById('tableMeta');
  const filtered = applySort(applyFilters(signals));
  if (meta) meta.textContent = `${filtered.length} ligne(s) affichée(s)`;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-cell">Aucune crypto ne correspond aux filtres.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(sig => {
    const side = sig.trade?.side || '';
    const confirmText = sig.confirm_blocked_by_session ? 'blocked session' : (sig.confirm_source || 'n/a');
    return `<tr>
      <td><strong>${sig.symbol || 'n/a'}</strong></td>
      <td><a class="navbtn" href="${tradingViewUrl(sig.symbol || '')}" target="_blank" rel="noopener noreferrer">TV</a></td>
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
    if (dashboardCache?.signals) renderLivePulse();
  } catch {}
}
async function toggleRuntime() {
  const btn = document.getElementById('runtimeToggle');
  const paused = btn?.dataset.paused === '1';
  const res = await fetch('/api/runtime', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ runtime:{ paused:!paused } }) });
  const payload = await res.json();
  if (payload.ok) { await loadRuntime(); await loadDashboard(); }
}
async function loadLiveRuns() {
  const res = await fetch('/api/live-runs?limit=20&_=' + Date.now());
  const payload = await res.json();
  renderLiveRuns(Array.isArray(payload.runs) ? payload.runs : []);
}
async function loadSystemHealth() {
  const res = await fetch('/api/system-health?_=' + Date.now());
  const payload = await res.json();
  renderSystemHealth(payload.health || null);
}
async function loadDashboard() {
  const res = await fetch('/data/dashboard.json?_=' + Date.now());
  const data = await res.json();
  dashboardCache = data;
  const mode = data.runtime?.mode ? ` · ${data.runtime.mode}` : '';
  document.getElementById('meta').textContent = 'Dernière génération: ' + data.generated_at + mode;
  const signals = data.signals || [];
  renderHero(signals);
  renderLivePulse();
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
Promise.all([loadRuntime(), loadDashboard(), loadLiveRuns(), loadSystemHealth()]).catch(err => {
  document.getElementById('meta').textContent = 'Erreur chargement dashboard: ' + err;
});
setInterval(() => { loadRuntime(); loadDashboard(); loadLiveRuns(); loadSystemHealth(); }, 15000);
