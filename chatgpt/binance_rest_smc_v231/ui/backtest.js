let currentBacktestRunId = 'latest';
let backtestTradesCache = [];
let backtestReportCache = null;

function fmtTime(ms) { if (!ms) return 'n/a'; try { return new Date(ms).toLocaleString(); } catch { return String(ms); } }
function fmtNum(v, d = 2) { if (v == null || v === '' || Number.isNaN(Number(v))) return 'n/a'; return Number(v).toFixed(d); }
function resultClass(value) { if (value == null || value === '' || Number.isNaN(Number(value))) return ''; return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutraltext'; }
function metric(label, value, cls = '') { return `<div class="metric-card"><span class="metric-label">${label}</span><strong class="${cls}">${value}</strong></div>`; }
function renderTradeRow(t) {
  const ret = t.return_pct ?? t.unrealized_return_pct;
  const rVal = t.r_multiple ?? t.unrealized_r_multiple;
  return `<article class="row-card"><div class="row-main"><div><div class="symbol">${t.symbol} · ${t.side} · ${t.status}</div><div class="subline">${fmtTime(t.entry_signal_time)} · ${t.entry_session} · ${t.entry_signal_bias}</div></div></div><div class="row-grid"><div><span class="label">Entry</span><strong>${fmtNum(t.entry_price, 4)}</strong></div><div><span class="label">Exit</span><strong>${fmtNum(t.exit_price ?? t.mark_price, 4)}</strong></div><div><span class="label">Stop</span><strong>${fmtNum(t.stop_price, 4)}</strong></div><div><span class="label">Target</span><strong>${fmtNum(t.target_price, 4)}</strong></div><div><span class="label">Return %</span><strong class="${resultClass(ret)}">${fmtNum(ret, 4)}</strong></div><div><span class="label">R</span><strong class="${resultClass(rVal)}">${fmtNum(rVal, 4)}</strong></div></div></article>`;
}
async function loadCachedSymbols() {
  const res = await fetch('/api/cached-symbols?_=' + Date.now());
  const payload = await res.json();
  const select = document.getElementById('cachedSymbolSelect');
  if (!select) return;
  if (!payload.ok || !Array.isArray(payload.symbols) || !payload.symbols.length) { select.innerHTML = '<option value="">Aucune crypto en cache</option>'; return; }
  select.innerHTML = payload.symbols.map(s => `<option value="${s}">${s}</option>`).join('');
}
async function loadBacktestRuns() {
  const res = await fetch('/api/backtest-runs?_=' + Date.now());
  const payload = await res.json();
  const select = document.getElementById('backtestHistorySelect');
  const meta = document.getElementById('backtestHistoryMeta');
  let html = '<option value="latest">Dernier backtest</option>';
  const runs = Array.isArray(payload.runs) ? payload.runs : [];
  for (const run of runs) html += `<option value="${run.run_id}">${run.symbol || '?'} · ${run.interval || '?'} · ${run.created_at || run.run_id}</option>`;
  select.innerHTML = html;
  if (meta) meta.textContent = runs.length ? `${runs.length} run(s) sauvegardé(s)` : 'Aucun historique sauvegardé';
}
function renderBacktest() {
  const metrics = document.getElementById('backtestMetrics');
  const tradesEl = document.getElementById('backtestTrades');
  if (!backtestReportCache) {
    metrics.innerHTML = '<div class="empty-state">Aucun rapport backtest.</div>';
    tradesEl.innerHTML = '<div class="empty-state">Aucun trade backtest.</div>';
    return;
  }
  const report = backtestReportCache;
  document.getElementById('backtestMeta').textContent = `Run chargé: ${report.run_id || 'latest'} · ${report.symbol || ''}`;
  metrics.innerHTML = [
    metric('Symbol', report.symbol || 'n/a'), metric('Closed', report.closed_trades ?? 0), metric('Open', report.open_trades ?? 0),
    metric('Winrate', `${report.winrate_pct ?? 0}%`, resultClass(report.winrate_pct)), metric('Avg', `${report.average_return_pct ?? 0}%`, resultClass(report.average_return_pct)),
    metric('Median', `${report.median_return_pct ?? 0}%`, resultClass(report.median_return_pct)), metric('PF', report.profit_factor ?? 'n/a'),
    metric('Cum.', `${report.cumulative_return_pct ?? 0}%`, resultClass(report.cumulative_return_pct)), metric('Avg R', report.average_r_multiple ?? 'n/a', resultClass(report.average_r_multiple)), metric('Total R', report.total_r ?? 'n/a', resultClass(report.total_r))
  ].join('');
  const symbolQ = (document.getElementById('tradeFilterSymbol')?.value || '').trim().toUpperCase();
  const sideQ = document.getElementById('tradeFilterSide')?.value || 'all';
  const statusQ = document.getElementById('tradeFilterStatus')?.value || 'all';
  const minRRaw = document.getElementById('tradeFilterMinR')?.value || '';
  const minR = minRRaw === '' ? null : Number(minRRaw);
  const filtered = backtestTradesCache.filter(t => {
    if (symbolQ && !(t.symbol || '').includes(symbolQ)) return false;
    if (sideQ !== 'all' && t.side !== sideQ) return false;
    if (statusQ !== 'all' && t.status !== statusQ) return false;
    const rValue = t.r_multiple ?? t.unrealized_r_multiple;
    if (minR !== null && (rValue == null || Number(rValue) < minR)) return false;
    return true;
  });
  tradesEl.innerHTML = filtered.length ? filtered.map(renderTradeRow).join('') : '<div class="empty-state">Aucun trade selon les filtres.</div>';
}
async function loadBacktest(runId = 'latest') {
  currentBacktestRunId = runId;
  if (runId === 'latest') {
    const [reportRes, tradesRes] = await Promise.all([fetch('/api/backtest_report?_=' + Date.now()), fetch('/data/backtest_trades.json?_=' + Date.now()).catch(() => null)]);
    const payload = await reportRes.json();
    backtestReportCache = payload.report || null;
    backtestTradesCache = tradesRes ? await tradesRes.json() : [];
    renderBacktest();
    return;
  }
  const res = await fetch(`/api/backtest-run?run_id=${encodeURIComponent(runId)}&_=${Date.now()}`);
  const payload = await res.json();
  backtestReportCache = payload.report || null;
  backtestTradesCache = payload.trades || [];
  renderBacktest();
}
async function runQuickBacktest() {
  const select = document.getElementById('cachedSymbolSelect');
  const meta = document.getElementById('backtestRunMeta');
  const symbol = select?.value;
  if (!symbol) { meta.textContent = 'Choisis une crypto en cache.'; return; }
  meta.textContent = `Lancement du backtest sur ${symbol}...`;
  const res = await fetch('/api/run-backtest', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ symbol }) });
  const payload = await res.json();
  if (!payload.ok) { meta.textContent = `Erreur: ${payload.error || 'backtest failed'}`; return; }
  meta.textContent = `Backtest lancé sur ${payload.symbol} (pid ${payload.pid}). Recharge dans quelques secondes.`;
  setTimeout(() => { loadBacktestRuns(); loadBacktest('latest'); }, 3500);
}
function bindControls() {
  const runBtn = document.getElementById('runBacktestBtn'); if (runBtn) runBtn.addEventListener('click', runQuickBacktest);
  const histBtn = document.getElementById('loadBacktestHistoryBtn'); if (histBtn) histBtn.addEventListener('click', () => loadBacktest(document.getElementById('backtestHistorySelect')?.value || 'latest'));
  ['tradeFilterSymbol','tradeFilterSide','tradeFilterMinR','tradeFilterStatus'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', renderBacktest); el.addEventListener('change', renderBacktest);
  });
}
bindControls();
Promise.all([loadCachedSymbols(), loadBacktestRuns(), loadBacktest('latest')]).catch(err => {
  document.getElementById('backtestMeta').textContent = 'Erreur backtest: ' + err;
});
