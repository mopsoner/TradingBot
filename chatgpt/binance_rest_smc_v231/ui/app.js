let currentBacktestRunId = 'latest';
let liveConfirmedSignalsCache = [];
let dashboardCache = null;
let processesCache = [];
let backtestReportCache = null;

function fmtTime(ms) {
  if (!ms) return 'n/a';
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}
function fmtNum(v, d = 2) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return 'n/a';
  return Number(v).toFixed(d);
}
function resultClass(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '';
  return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutraltext';
}
function isConfirmed(sig) {
  return sig && (sig.trigger !== 'wait' || sig.bias === 'bull_confirm' || sig.bias === 'bear_confirm');
}
function isWatch(sig) {
  return sig && /watch/.test(sig.bias || '') && (sig.score || 0) >= 5;
}
function isActionable(sig) {
  return isConfirmed(sig) && !sig.confirm_blocked_by_session && sig.trade && sig.trade.status === 'simulated';
}
function todayStartTs() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function renderMetricCard(label, value, sub = '', cls = '') {
  return `<div class="metric-card"><span class="metric-label">${label}</span><strong class="${cls}">${value}</strong>${sub ? `<span class="metric-sub">${sub}</span>` : ''}</div>`;
}
function renderCompactSignal(sig, mode = 'live') {
  const side = sig.trade?.side || (sig.bias === 'bull_confirm' ? 'long' : sig.bias === 'bear_confirm' ? 'short' : 'watch');
  const confirmSource = sig.confirm_source || 'n/a';
  const blocked = sig.confirm_blocked_by_session ? '<span class="pill pill-warn">blocked session</span>' : '';
  const line2 = mode === 'history'
    ? `${fmtTime(sig.signal_time)} · ${sig.session || 'n/a'}`
    : `${sig.session || 'n/a'} · ${sig.state || 'n/a'}`;
  return `
    <article class="trade-card ${side === 'long' ? 'trade-long' : side === 'short' ? 'trade-short' : ''}">
      <div class="trade-card-top">
        <div>
          <div class="trade-symbol">${sig.symbol || 'n/a'}</div>
          <div class="trade-sub">${line2}</div>
        </div>
        <div class="trade-score">${sig.score ?? 'n/a'}</div>
      </div>
      <div class="trade-pills">
        <span class="pill ${side === 'long' ? 'pill-long' : side === 'short' ? 'pill-short' : 'pill-neutral'}">${side}</span>
        <span class="pill pill-neutral">${sig.trigger || 'wait'}</span>
        <span class="pill pill-neutral">${confirmSource}</span>
        ${blocked}
      </div>
      <div class="trade-grid">
        <div><span class="label">Price</span><strong>${fmtNum(sig.price, 4)}</strong></div>
        <div><span class="label">RSI</span><strong>${fmtNum(sig.rsi_main, 2)}</strong></div>
        <div><span class="label">Entry</span><strong>${fmtNum(sig.trade?.entry ?? sig.price, 4)}</strong></div>
        <div><span class="label">Stop</span><strong>${fmtNum(sig.trade?.stop, 4)}</strong></div>
        <div><span class="label">Target</span><strong>${fmtNum(sig.trade?.target, 4)}</strong></div>
        <div><span class="label">Liquidity</span><strong>${sig.liquidity_target?.type || 'n/a'}</strong></div>
      </div>
    </article>`;
}
function renderMonitorCard(sig, showPipeline = true) {
  const p = sig.pipeline || {};
  const liq = sig.liquidity_target || {};
  const scoreClass = sig.score >= 6 ? 'score score-high' : sig.score >= 4 ? 'score score-mid' : 'score';
  const confirmSource = sig.confirm_source ? `<span class="pill pill-neutral">${sig.confirm_source}</span>` : '';
  const blocked = sig.confirm_blocked_by_session ? `<span class="pill pill-warn">blocked session</span>` : '';
  return `
    <article class="signal-card">
      <div class="topline">
        <div>
          <div class="symbol">${sig.symbol}</div>
          <div class="subline">${sig.session} · ${sig.bias}</div>
        </div>
        <div class="${scoreClass}">${sig.score ?? 'n/a'}</div>
      </div>
      <div class="trade-pills compact-pills">
        <span class="pill pill-neutral">${sig.trigger}</span>
        ${confirmSource}
        ${blocked}
      </div>
      <div class="price-row">
        <div><div class="label">Prix</div><div class="price">${fmtNum(sig.price, 4)}</div></div>
        <div><div class="label">RSI</div><div class="value">${fmtNum(sig.rsi_main, 2)}</div></div>
      </div>
      <div class="mini-grid">
        <div><span class="label">Signal time</span><strong>${fmtTime(sig.signal_time)}</strong></div>
        <div><span class="label">Interval</span><strong>${sig.signal_interval ?? 'n/a'}</strong></div>
        <div><span class="label">State</span><strong>${sig.state}</strong></div>
        <div><span class="label">TP zone</span><strong>${sig.tp_zone ? 'yes' : 'no'}</strong></div>
      </div>
      <div class="liquidity-box">
        <span class="label">Liquidity target</span>
        <strong>${liq.type || 'n/a'} ${liq.level ?? ''}</strong>
        <div class="subline">${liq.reason || ''}</div>
      </div>
      ${showPipeline ? `<div class="pipeline">
        <span class="badge ${p.collect ? 'ok' : 'wait'}">collect</span>
        <span class="badge ${p.liquidity ? 'ok' : 'wait'}">liquidity</span>
        <span class="badge ${p.zone ? 'ok' : 'wait'}">zone</span>
        <span class="badge ${p.confirm ? 'ok' : 'wait'}">confirm</span>
        <span class="badge ${p.trade ? 'ok' : 'wait'}">trade</span>
      </div>` : ''}
    </article>`;
}
function renderProcessCard(p) {
  return `<article class="mini-card"><div class="topline"><div><div class="symbol">PID ${p.pid}</div><div class="subline">${p.etime}</div></div><button class="stopbtn" data-pid="${p.pid}">Stop</button></div><div class="liquidity-box"><span class="label">Commande</span><strong class="cmdline">${p.cmd}</strong></div></article>`;
}
function renderBacktestTradeRow(t) {
  const ret = t.return_pct ?? t.unrealized_return_pct;
  const rVal = t.r_multiple ?? t.unrealized_r_multiple;
  return `
    <article class="row-card">
      <div class="row-main">
        <div>
          <div class="symbol">${t.symbol} · ${t.side} · ${t.status}</div>
          <div class="subline">${fmtTime(t.entry_signal_time)} · ${t.entry_session} · ${t.entry_signal_bias}</div>
        </div>
        <div class="trade-pills compact-pills">
          <span class="pill ${t.side === 'long' ? 'pill-long' : 'pill-short'}">${t.side}</span>
          <span class="pill pill-neutral">${t.exit_reason ?? 'open'}</span>
        </div>
      </div>
      <div class="row-grid">
        <div><span class="label">Entry</span><strong>${fmtNum(t.entry_price, 4)}</strong></div>
        <div><span class="label">Exit</span><strong>${fmtNum(t.exit_price ?? t.mark_price, 4)}</strong></div>
        <div><span class="label">Stop</span><strong>${fmtNum(t.stop_price, 4)}</strong></div>
        <div><span class="label">Target</span><strong>${fmtNum(t.target_price, 4)}</strong></div>
        <div><span class="label">Return %</span><strong class="${resultClass(ret)}">${fmtNum(ret, 4)}</strong></div>
        <div><span class="label">R</span><strong class="${resultClass(rVal)}">${fmtNum(rVal, 4)}</strong></div>
      </div>
    </article>`;
}
function renderHero() {
  const el = document.getElementById('heroMetrics');
  if (!el || !dashboardCache) return;
  const signals = dashboardCache.signals || [];
  const actionable = signals.filter(isActionable);
  const watches = signals.filter(isWatch);
  const confirms = liveConfirmedSignalsCache.length;
  const top = [...signals].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  el.innerHTML = [
    renderMetricCard('Trades now', actionable.length, actionable[0] ? `${actionable[0].symbol} en tête` : 'aucune entrée active', actionable.length ? 'positive' : ''),
    renderMetricCard('Watchlist', watches.length, watches[0] ? `${watches[0].symbol} à surveiller` : 'aucun setup mûr', watches.length ? '' : 'neutraltext'),
    renderMetricCard('Confirmations live', confirms, 'historique confirmé stocké', confirms ? 'positive' : ''),
    renderMetricCard('Top score', top ? String(top.score ?? 'n/a') : 'n/a', top ? `${top.symbol} · ${top.bias}` : 'aucun signal'),
  ].join('');
}
function renderStatusBoard() {
  const el = document.getElementById('statusBoard');
  if (!el) return;
  const paused = document.getElementById('runtimeToggle')?.dataset.paused === '1';
  const signals = dashboardCache?.signals || [];
  const actionable = signals.filter(isActionable).length;
  const blocked = signals.filter(s => s.confirm_blocked_by_session).length;
  const coverage = dashboardCache?.stats?.batch_count || 0;
  const rows = [
    ['Moteur', paused ? 'paused' : 'running', paused ? 'negative' : 'positive'],
    ['Processus', String(processesCache.length), processesCache.length >= 2 ? 'positive' : 'negative'],
    ['Batch live', String(coverage), coverage ? 'positive' : 'negative'],
    ['Actionnables', String(actionable), actionable ? 'positive' : 'neutraltext'],
    ['Blocked session', String(blocked), blocked ? 'negative' : 'neutraltext'],
    ['Backtest trades', String(backtestReportCache?.closed_trades ?? 0), Number(backtestReportCache?.closed_trades ?? 0) > 0 ? 'positive' : 'neutraltext'],
  ];
  el.innerHTML = rows.map(([k, v, cls]) => renderMetricCard(k, v, '', cls)).join('');
}
function renderStrategyRadar() {
  const el = document.getElementById('strategyRadar');
  if (!el || !dashboardCache) return;
  const signals = dashboardCache.signals || [];
  const confirms = signals.filter(isConfirmed);
  const watches = signals.filter(isWatch);
  const bulls = confirms.filter(s => s.bias === 'bull_confirm').length;
  const bears = confirms.filter(s => s.bias === 'bear_confirm').length;
  const rows = [
    ['Confirm actifs', String(confirms.length), '', confirms.length ? 'positive' : 'neutraltext'],
    ['Watch actifs', String(watches.length), '', watches.length ? '' : 'neutraltext'],
    ['Long bias', String(bulls), '', bulls ? 'positive' : 'neutraltext'],
    ['Short bias', String(bears), '', bears ? 'negative' : 'neutraltext'],
  ];
  el.innerHTML = rows.map(([a,b,c,d]) => renderMetricCard(a,b,c,d)).join('');
}
function renderDecisionBoards() {
  const tradeNowEl = document.getElementById('tradeNowBoard');
  const watchEl = document.getElementById('watchSignals');
  if (!tradeNowEl || !watchEl) return;
  const signals = dashboardCache?.signals || [];
  const actionable = signals.filter(isActionable).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,8);
  const watches = signals.filter(isWatch).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,6);
  tradeNowEl.innerHTML = actionable.length ? actionable.map(s => renderCompactSignal(s)).join('') : '<div class="empty-state">Aucun trade confirmé à placer dans la fenêtre active.</div>';
  watchEl.innerHTML = watches.length ? watches.map(s => renderCompactSignal(s)).join('') : '<div class="empty-state">Aucun setup proche d’une confirmation.</div>';
}
function renderSessionPulse() {
  const el = document.getElementById('sessionPulse');
  if (!el) return;
  const sessions = { asia:0, london:0, london_open:0, new_york:0, off_session:0 };
  (dashboardCache?.signals || []).forEach(sig => {
    const s = (sig.session || 'off_session').toLowerCase();
    if (sessions[s] != null) sessions[s] += 1; else sessions.off_session += 1;
  });
  el.innerHTML = Object.entries(sessions).map(([k,v]) => renderMetricCard(k, String(v))).join('');
}
function renderConfirmedToday() {
  const el = document.getElementById('confirmedToday');
  if (!el) return;
  const start = todayStartTs();
  const todaySignals = liveConfirmedSignalsCache.filter(s => s.signal_time && s.signal_time >= start);
  const bulls = todaySignals.filter(s => s.bias === 'bull_confirm').length;
  const bears = todaySignals.filter(s => s.bias === 'bear_confirm').length;
  const soft = todaySignals.filter(s => String(s.trigger || '').includes('_soft')).length;
  const hard = todaySignals.filter(s => String(s.trigger || '').includes('break_') && !String(s.trigger || '').includes('_soft')).length;
  el.innerHTML = [
    renderMetricCard('Total', String(todaySignals.length), '', todaySignals.length ? 'positive' : 'neutraltext'),
    renderMetricCard('Bull', String(bulls), '', bulls ? 'positive' : 'neutraltext'),
    renderMetricCard('Bear', String(bears), '', bears ? 'negative' : 'neutraltext'),
    renderMetricCard('Soft', String(soft)),
    renderMetricCard('Hard', String(hard)),
    renderMetricCard('Symbols', String(new Set(todaySignals.map(s => s.symbol)).size)),
  ].join('');
}
function renderLiveConfirmedSignals() {
  const container = document.getElementById('liveConfirmedSignals');
  const meta = document.getElementById('liveConfirmedMeta');
  if (!container) return;
  const symbolQ = (document.getElementById('liveConfirmedFilterSymbol')?.value || '').trim().toUpperCase();
  const biasQ = document.getElementById('liveConfirmedFilterBias')?.value || 'all';
  const triggerQ = document.getElementById('liveConfirmedFilterTrigger')?.value || 'all';
  const filtered = liveConfirmedSignalsCache.filter(sig => {
    if (symbolQ && !(sig.symbol || '').includes(symbolQ)) return false;
    if (biasQ !== 'all' && sig.bias !== biasQ) return false;
    if (triggerQ !== 'all' && sig.trigger !== triggerQ) return false;
    return true;
  });
  if (meta) meta.textContent = `${filtered.length} confirmation(s)`;
  container.innerHTML = filtered.length ? filtered.map(sig => renderCompactSignal(sig, 'history')).join('') : '<div class="empty-state">Aucune confirmation disponible.</div>';
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
    renderStatusBoard();
  } catch {}
}
async function toggleRuntime() {
  const btn = document.getElementById('runtimeToggle');
  const paused = btn?.dataset.paused === '1';
  const res = await fetch('/api/runtime', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ runtime:{ paused:!paused } }) });
  const payload = await res.json();
  if (payload.ok) { await loadRuntime(); await loadDashboard(); }
}
async function stopProcess(pid) {
  const res = await fetch('/api/processes/stop', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ pid }) });
  await res.json();
  await loadProcesses();
}
async function loadProcesses() {
  try {
    const res = await fetch('/api/processes?_=' + Date.now());
    const payload = await res.json();
    const el = document.getElementById('processes');
    if (!el) return;
    if (!payload.ok || !Array.isArray(payload.processes)) {
      el.innerHTML = '<div class="empty-state">Erreur chargement processus.</div>';
      return;
    }
    processesCache = payload.processes;
    renderStatusBoard();
    el.innerHTML = payload.processes.length ? payload.processes.map(renderProcessCard).join('') : '<div class="empty-state">Aucun processus trouvé.</div>';
    el.querySelectorAll('.stopbtn').forEach(btn => btn.addEventListener('click', () => stopProcess(Number(btn.dataset.pid))));
  } catch (err) {
    document.getElementById('processes').innerHTML = `<div class="empty-state">Erreur: ${err}</div>`;
  }
}
async function loadCachedSymbols() {
  try {
    const res = await fetch('/api/cached-symbols?_=' + Date.now());
    const payload = await res.json();
    const select = document.getElementById('cachedSymbolSelect');
    if (!select) return;
    if (!payload.ok || !Array.isArray(payload.symbols) || !payload.symbols.length) {
      select.innerHTML = '<option value="">Aucune crypto en cache</option>';
      return;
    }
    select.innerHTML = payload.symbols.map(s => `<option value="${s}">${s}</option>`).join('');
  } catch {
    const select = document.getElementById('cachedSymbolSelect');
    if (select) select.innerHTML = '<option value="">Erreur chargement cache</option>';
  }
}
async function loadBacktestRuns() {
  try {
    const res = await fetch('/api/backtest-runs?_=' + Date.now());
    const payload = await res.json();
    const select = document.getElementById('backtestHistorySelect');
    const meta = document.getElementById('backtestHistoryMeta');
    if (!select) return;
    let html = '<option value="latest">Dernier backtest</option>';
    const runs = Array.isArray(payload.runs) ? payload.runs : [];
    for (const run of runs) html += `<option value="${run.run_id}">${run.symbol || '?'} · ${run.interval || '?'} · ${run.created_at || run.run_id}</option>`;
    select.innerHTML = html;
    if (meta) meta.textContent = runs.length ? `${runs.length} run(s) sauvegardé(s)` : 'Aucun historique sauvegardé';
  } catch (err) {
    const meta = document.getElementById('backtestHistoryMeta');
    if (meta) meta.textContent = `Erreur historique: ${err}`;
  }
}
async function runQuickBacktest() {
  const select = document.getElementById('cachedSymbolSelect');
  const meta = document.getElementById('backtestRunMeta');
  const symbol = select?.value;
  if (!symbol) { if (meta) meta.textContent = 'Choisis une crypto en cache.'; return; }
  if (meta) meta.textContent = `Lancement du backtest sur ${symbol}...`;
  const res = await fetch('/api/run-backtest', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ symbol }) });
  const payload = await res.json();
  if (!payload.ok) { if (meta) meta.textContent = `Erreur: ${payload.error || 'backtest failed'}`; return; }
  currentBacktestRunId = 'latest';
  if (meta) meta.textContent = `Backtest lancé sur ${payload.symbol} (pid ${payload.pid}). Recharge dans quelques secondes.`;
  setTimeout(() => { loadBacktestRuns(); loadBacktest('latest'); loadProcesses(); }, 3500);
}
async function loadSelectedBacktest() {
  const select = document.getElementById('backtestHistorySelect');
  currentBacktestRunId = select?.value || 'latest';
  await loadBacktest(currentBacktestRunId);
}
function renderBacktest(report, trades) {
  backtestReportCache = report;
  renderStatusBoard();
  const el = document.getElementById('backtest');
  const items = [
    ['Symbol', report.symbol], ['Closed', report.closed_trades], ['Open', report.open_trades], ['Winrate', `${report.winrate_pct}%`],
    ['Avg', `${report.average_return_pct}%`], ['Median', `${report.median_return_pct}%`], ['Best', `${report.best_trade_pct}%`], ['Worst', `${report.worst_trade_pct}%`],
    ['PF', report.profit_factor ?? 'n/a'], ['Cum.', `${report.cumulative_return_pct}%`], ['Avg R', report.average_r_multiple ?? 'n/a'], ['Total R', report.total_r ?? 'n/a']
  ];
  el.innerHTML = items.map(([k,v]) => renderMetricCard(k, String(v), '', resultClass(v))).join('');
  const tradesContainer = document.getElementById('backtestTrades');
  const symbolQ = (document.getElementById('tradeFilterSymbol')?.value || '').trim().toUpperCase();
  const sideQ = document.getElementById('tradeFilterSide')?.value || 'all';
  const statusQ = document.getElementById('tradeFilterStatus')?.value || 'all';
  const minRRaw = document.getElementById('tradeFilterMinR')?.value || '';
  const minR = minRRaw === '' ? null : Number(minRRaw);
  const filteredTrades = (Array.isArray(trades) ? trades : []).filter(t => {
    if (symbolQ && !(t.symbol || '').includes(symbolQ)) return false;
    if (sideQ !== 'all' && t.side !== sideQ) return false;
    if (statusQ !== 'all' && t.status !== statusQ) return false;
    const rValue = t.r_multiple ?? t.unrealized_r_multiple;
    if (minR !== null && (rValue == null || Number(rValue) < minR)) return false;
    return true;
  });
  tradesContainer.innerHTML = filteredTrades.length ? filteredTrades.slice(0, 120).map(renderBacktestTradeRow).join('') : '<div class="empty-state">Aucun trade dans ce replay.</div>';
}
async function loadBacktest(runId = 'latest') {
  try {
    if (runId === 'latest') {
      const [reportRes, tradesRes] = await Promise.all([fetch('/api/backtest_report?_=' + Date.now()), fetch('/data/backtest_trades.json?_=' + Date.now()).catch(() => null)]);
      const payload = await reportRes.json();
      const report = payload.report;
      if (!report) {
        document.getElementById('backtest').innerHTML = '<div class="empty-state">Aucun rapport backtest.</div>';
        document.getElementById('backtestTrades').innerHTML = '<div class="empty-state">Aucun trade backtest.</div>';
        return;
      }
      const trades = tradesRes ? await tradesRes.json() : [];
      renderBacktest(report, trades);
      return;
    }
    const res = await fetch(`/api/backtest-run?run_id=${encodeURIComponent(runId)}&_=${Date.now()}`);
    const payload = await res.json();
    if (!payload.ok) throw new Error(payload.error || 'run load failed');
    renderBacktest(payload.report, payload.trades || []);
  } catch (err) {
    document.getElementById('backtest').innerHTML = `<div class="empty-state">Erreur backtest: ${err}</div>`;
  }
}
async function loadLiveConfirmedSignals() {
  const limit = Number(document.getElementById('liveConfirmedLimit')?.value || '100');
  try {
    const res = await fetch(`/api/live-confirmed-signals?limit=${encodeURIComponent(limit)}&_=${Date.now()}`);
    const payload = await res.json();
    liveConfirmedSignalsCache = Array.isArray(payload.signals) ? payload.signals : [];
    renderLiveConfirmedSignals();
    renderConfirmedToday();
    renderHero();
    renderStatusBoard();
  } catch (err) {
    const container = document.getElementById('liveConfirmedSignals');
    const meta = document.getElementById('liveConfirmedMeta');
    if (meta) meta.textContent = `Erreur historique live: ${err}`;
    if (container) container.innerHTML = '<div class="empty-state">Erreur chargement confirmations.</div>';
  }
}
async function loadDashboard() {
  const res = await fetch('/data/dashboard.json?_=' + Date.now());
  const data = await res.json();
  dashboardCache = data;
  const mode = data.runtime?.mode ? ` · ${data.runtime.mode}` : '';
  document.getElementById('meta').textContent = 'Dernière génération: ' + data.generated_at + mode;
  document.getElementById('batchMeta').textContent = `${data.batch_symbols?.length || 0} symbole(s)`;
  const q = (document.getElementById('filterSymbol')?.value || '').trim().toUpperCase();
  const bias = document.getElementById('filterBias')?.value || 'all';
  const minScore = Number(document.getElementById('filterScore')?.value || '0');
  const showTopOnly = document.getElementById('toggleTopOnly')?.checked || false;
  const showPipeline = document.getElementById('togglePipeline')?.checked ?? true;
  const sourceSignals = showTopOnly ? (data.top_signals || []) : (data.signals || []);
  const filtered = sourceSignals.filter(sig => {
    if (q && !sig.symbol.includes(q)) return false;
    if (bias !== 'all' && sig.bias !== bias) return false;
    if ((sig.score || 0) < minScore) return false;
    return true;
  });
  document.getElementById('top').innerHTML = (data.top_signals || []).length ? (data.top_signals || []).map(sig => renderMonitorCard(sig, showPipeline)).join('') : '<div class="empty-state">Aucun top signal.</div>';
  document.getElementById('batch').innerHTML = data.batch_symbols?.length ? data.batch_symbols.map(s => `<span class="badge neutral">${s}</span>`).join(' ') : '<span class="badge neutral">batch vide</span>';
  document.getElementById('signals').innerHTML = filtered.length ? filtered.map(sig => renderMonitorCard(sig, showPipeline)).join('') : '<div class="empty-state">Aucun signal dans le batch.</div>';
  renderHero();
  renderStrategyRadar();
  renderDecisionBoards();
  renderSessionPulse();
  renderStatusBoard();
}
function bindControls() {
  ['filterSymbol','filterBias','filterScore','toggleTopOnly','togglePipeline','tradeFilterSymbol','tradeFilterSide','tradeFilterMinR','tradeFilterStatus'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', () => { if (id.startsWith('tradeFilter')) loadBacktest(currentBacktestRunId); else loadDashboard(); });
    el.addEventListener('change', () => { if (id.startsWith('tradeFilter')) loadBacktest(currentBacktestRunId); else loadDashboard(); });
  });
  ['liveConfirmedFilterSymbol','liveConfirmedFilterBias','liveConfirmedFilterTrigger'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('input', renderLiveConfirmedSignals);
    el.addEventListener('change', renderLiveConfirmedSignals);
  });
  const liveLimit = document.getElementById('liveConfirmedLimit'); if (liveLimit) liveLimit.addEventListener('change', loadLiveConfirmedSignals);
  const rt = document.getElementById('runtimeToggle'); if (rt) rt.addEventListener('click', toggleRuntime);
  const backtestBtn = document.getElementById('runBacktestBtn'); if (backtestBtn) backtestBtn.addEventListener('click', runQuickBacktest);
  const historyBtn = document.getElementById('loadBacktestHistoryBtn'); if (historyBtn) historyBtn.addEventListener('click', loadSelectedBacktest);
}
bindControls();
Promise.all([loadRuntime(), loadProcesses(), loadCachedSymbols(), loadBacktestRuns(), loadDashboard(), loadBacktest('latest'), loadLiveConfirmedSignals()]).catch(err => {
  document.getElementById('meta').textContent = 'Erreur chargement dashboard: ' + err;
});
setInterval(() => {
  loadRuntime();
  loadProcesses();
  loadDashboard();
  loadLiveConfirmedSignals();
  if (currentBacktestRunId === 'latest') loadBacktest('latest');
}, 15000);
