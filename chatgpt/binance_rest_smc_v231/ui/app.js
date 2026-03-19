let currentBacktestRunId = 'latest';

function fmtTime(ms) {
  if (!ms) return 'n/a';
  try { return new Date(ms).toLocaleString(); } catch { return String(ms); }
}
function resultClass(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '';
  return Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : 'neutraltext';
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
  } catch {}
}
async function toggleRuntime() {
  const btn = document.getElementById('runtimeToggle');
  const paused = btn?.dataset.paused === '1';
  const res = await fetch('/api/runtime', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runtime: { paused: !paused } })
  });
  const payload = await res.json();
  if (payload.ok) { await loadRuntime(); await loadDashboard(); }
}
async function stopProcess(pid) {
  const res = await fetch('/api/processes/stop', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid })
  });
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
      el.innerHTML = '<div class="stat-pill wide"><span class="k">Processus</span><strong>Erreur chargement</strong></div>';
      return;
    }
    if (!payload.processes.length) {
      el.innerHTML = '<div class="stat-pill wide"><span class="k">Processus</span><strong>Aucun processus trouvé</strong></div>';
      return;
    }
    el.innerHTML = payload.processes.map(p => `
      <article class="signal small-card">
        <div class="topline">
          <div>
            <div class="symbol">PID ${p.pid}</div>
            <div class="subline">${p.etime}</div>
          </div>
          <button class="stopbtn" data-pid="${p.pid}">Stop</button>
        </div>
        <div class="liquidity-box">
          <span class="label">Commande</span>
          <strong class="cmdline">${p.cmd}</strong>
        </div>
      </article>
    `).join('');
    el.querySelectorAll('.stopbtn').forEach(btn => btn.addEventListener('click', () => stopProcess(Number(btn.dataset.pid))));
  } catch (err) {
    document.getElementById('processes').innerHTML = `<div class="stat-pill wide"><span class="k">Processus</span><strong>Erreur: ${err}</strong></div>`;
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
    for (const run of runs) {
      const label = `${run.symbol || '?'} · ${run.interval || '?'} · ${run.created_at || run.run_id}`;
      html += `<option value="${run.run_id}">${label}</option>`;
    }
    select.innerHTML = html;
    if (meta) meta.textContent = runs.length ? `${runs.length} backtest(s) sauvegardé(s)` : 'Aucun historique sauvegardé';
  } catch (err) {
    const meta = document.getElementById('backtestHistoryMeta');
    if (meta) meta.textContent = `Erreur historique: ${err}`;
  }
}
async function runQuickBacktest() {
  const select = document.getElementById('cachedSymbolSelect');
  const meta = document.getElementById('backtestRunMeta');
  const symbol = select?.value;
  if (!symbol) {
    if (meta) meta.textContent = 'Choisis une crypto en cache.';
    return;
  }
  if (meta) meta.textContent = `Lancement du backtest sur ${symbol}...`;
  const res = await fetch('/api/run-backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol })
  });
  const payload = await res.json();
  if (!payload.ok) {
    if (meta) meta.textContent = `Erreur: ${payload.error || 'backtest failed'}`;
    return;
  }
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
  const el = document.getElementById('backtest');
  const items = [
    ['Run', report.run_id || 'latest'], ['Symbol', report.symbol], ['Interval', report.interval], ['Closed', report.closed_trades], ['Open', report.open_trades],
    ['Winrate', `${report.winrate_pct}%`], ['Avg', `${report.average_return_pct}%`], ['Median', `${report.median_return_pct}%`],
    ['Best', `${report.best_trade_pct}%`], ['Worst', `${report.worst_trade_pct}%`], ['PF', report.profit_factor ?? 'n/a'],
    ['Cum.', `${report.cumulative_return_pct}%`], ['Avg R', report.average_r_multiple ?? 'n/a'], ['Med R', report.median_r_multiple ?? 'n/a'],
    ['Total R', report.total_r ?? 'n/a'], ['Min RR', report.min_rr ?? 'n/a'], ['RR filtered', report.filtered_rr_count ?? 0]
  ];
  el.innerHTML = items.map(([k,v]) => `<div class="stat-pill"><span class="k">${k}</span><strong class="${resultClass(v)}">${v}</strong></div>`).join('');

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
  if (!filteredTrades.length) {
    tradesContainer.innerHTML = '<div class="stat-pill wide"><span class="k">Trades</span><strong>Aucun trade détaillé</strong></div>';
    return;
  }
  tradesContainer.innerHTML = filteredTrades.slice(0, 120).map(t => `
    <article class="signal small-card">
      <div class="topline">
        <div>
          <div class="symbol">${t.symbol} · ${t.side} · ${t.status}</div>
          <div class="subline">${t.entry_session} · ${t.entry_signal_bias}</div>
        </div>
        <div class="score">${t.score}</div>
      </div>
      <div class="mini-grid">
        <div><span class="label">Signal time</span><strong>${fmtTime(t.entry_signal_time)}</strong></div>
        <div><span class="label">Exit signal time</span><strong>${fmtTime(t.exit_signal_time)}</strong></div>
        <div><span class="label">Entry</span><strong>${t.entry_price}</strong></div>
        <div><span class="label">Exit</span><strong>${t.exit_price ?? t.mark_price ?? 'open'}</strong></div>
        <div><span class="label">Stop</span><strong>${t.stop_price ?? 'n/a'}</strong></div>
        <div><span class="label">Target</span><strong>${t.target_price ?? 'n/a'}</strong></div>
        <div><span class="label">RSI entry</span><strong>${t.entry_rsi_main ?? 'n/a'}</strong></div>
        <div><span class="label">RR entry</span><strong>${t.entry_reward_risk_ratio ?? 'n/a'}</strong></div>
        <div><span class="label">Return %</span><strong class="${resultClass(t.return_pct ?? t.unrealized_return_pct)}">${t.return_pct ?? t.unrealized_return_pct ?? 'n/a'}</strong></div>
        <div><span class="label">R</span><strong class="${resultClass(t.r_multiple ?? t.unrealized_r_multiple)}">${t.r_multiple ?? t.unrealized_r_multiple ?? 'n/a'}</strong></div>
        <div><span class="label">Exit reason</span><strong>${t.exit_reason ?? 'n/a'}</strong></div>
        <div><span class="label">Bars held</span><strong>${t.bars_held ?? 'n/a'}</strong></div>
      </div>
      <div class="liquidity-box">
        <span class="label">Liquidity target at entry</span>
        <strong>${t.liquidity_target_at_entry?.type || 'n/a'} ${t.liquidity_target_at_entry?.level ?? ''}</strong>
        <div class="subline">${t.liquidity_target_at_entry?.reason || ''}</div>
      </div>
    </article>
  `).join('');
}
async function loadBacktest(runId = 'latest') {
  try {
    if (runId === 'latest') {
      const [reportRes, tradesRes] = await Promise.all([
        fetch('/api/backtest_report?_=' + Date.now()),
        fetch('/data/backtest_trades.json?_=' + Date.now()).catch(() => null),
      ]);
      const payload = await reportRes.json();
      const report = payload.report;
      if (!report) {
        document.getElementById('backtest').innerHTML = '<div class="stat-pill wide"><span class="k">Backtest</span><strong>Aucun rapport</strong></div>';
        document.getElementById('backtestTrades').innerHTML = '<div class="stat-pill wide"><span class="k">Trades</span><strong>Aucun trade détaillé</strong></div>';
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
    document.getElementById('backtest').innerHTML = `<div class="stat-pill wide"><span class="k">Backtest</span><strong>Erreur: ${err}</strong></div>`;
  }
}
async function loadDashboard() {
  const res = await fetch('/data/dashboard.json?_=' + Date.now());
  const data = await res.json();
  const mode = data.runtime?.mode ? ` · ${data.runtime.mode}` : '';
  document.getElementById('meta').textContent = 'Dernière génération: ' + data.generated_at + mode;
  document.getElementById('stats').innerHTML = `
    <div class="stat-pill"><span class="k">Total</span><strong>${data.stats.all_symbols_count}</strong></div>
    <div class="stat-pill"><span class="k">Batch</span><strong>${data.stats.batch_count}</strong></div>
    <div class="stat-pill"><span class="k">Boucle</span><strong>${data.stats.loop_interval_seconds}s</strong></div>
  `;
  const q = (document.getElementById('filterSymbol')?.value || '').trim().toUpperCase();
  const bias = document.getElementById('filterBias')?.value || 'all';
  const minScore = Number(document.getElementById('filterScore')?.value || '0');
  const showTopOnly = document.getElementById('toggleTopOnly')?.checked || false;
  const showPipeline = document.getElementById('togglePipeline')?.checked ?? true;
  const showTrade = document.getElementById('toggleTrade')?.checked ?? true;
  const sourceSignals = showTopOnly ? (data.top_signals || []) : (data.signals || []);
  const filtered = sourceSignals.filter(sig => {
    if (q && !sig.symbol.includes(q)) return false;
    if (bias !== 'all' && sig.bias !== bias) return false;
    if ((sig.score || 0) < minScore) return false;
    return true;
  });
  const renderSignal = (sig) => {
    const p = sig.pipeline || {};
    const trade = sig.trade || {};
    const liq = sig.liquidity_target || {};
    const badgeClass = (value) => value ? 'ok' : 'wait';
    const scoreClass = sig.score >= 6 ? 'score score-high' : sig.score >= 4 ? 'score score-mid' : 'score';
    return `
      <article class="signal">
        <div class="topline">
          <div><div class="symbol">${sig.symbol}</div><div class="subline">${sig.session} · ${sig.bias}</div></div>
          <div class="${scoreClass}">${sig.score}</div>
        </div>
        <div class="price-row">
          <div><div class="label">Prix</div><div class="price">${Number(sig.price).toFixed(6)}</div></div>
          <div><div class="label">RSI</div><div class="value">${sig.rsi_main ?? 'n/a'}</div></div>
        </div>
        <div class="mini-grid">
          <div><span class="label">Signal time</span><strong>${fmtTime(sig.signal_time)}</strong></div>
          <div><span class="label">Interval</span><strong>${sig.signal_interval ?? 'n/a'}</strong></div>
          <div><span class="label">State</span><strong>${sig.state}</strong></div>
          <div><span class="label">Trigger</span><strong>${sig.trigger}</strong></div>
          <div><span class="label">TP zone</span><strong>${sig.tp_zone ? 'yes' : 'no'}</strong></div>
          ${showTrade ? `<div><span class="label">Trade</span><strong>${trade.status || 'watch'} ${trade.side || ''}</strong></div>` : ''}
        </div>
        <div class="liquidity-box">
          <span class="label">Liquidity target</span>
          <strong>${liq.type || 'n/a'} ${liq.level ?? ''}</strong>
          <div class="subline">${liq.reason || ''}</div>
        </div>
        ${showPipeline ? `<div class="pipeline">
          <span class="badge ${badgeClass(p.collect)}">collect</span>
          <span class="badge ${badgeClass(p.liquidity)}">liquidity</span>
          <span class="badge ${badgeClass(p.zone)}">zone</span>
          <span class="badge ${badgeClass(p.confirm)}">confirm</span>
          <span class="badge ${badgeClass(p.trade)}">trade</span>
        </div>` : ''}
      </article>`;
  };
  document.getElementById('top').innerHTML = (data.top_signals || []).map(renderSignal).join('');
  document.getElementById('batch').innerHTML = data.batch_symbols.map(s => `<span class="badge neutral">${s}</span>`).join(' ');
  document.getElementById('signals').innerHTML = filtered.map(renderSignal).join('');
}
function bindControls() {
  ['filterSymbol', 'filterBias', 'filterScore', 'toggleTopOnly', 'togglePipeline', 'toggleTrade', 'tradeFilterSymbol', 'tradeFilterSide', 'tradeFilterMinR', 'tradeFilterStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => { if (id.startsWith('tradeFilter')) loadBacktest(currentBacktestRunId); else loadDashboard(); });
    el.addEventListener('change', () => { if (id.startsWith('tradeFilter')) loadBacktest(currentBacktestRunId); else loadDashboard(); });
  });
  const rt = document.getElementById('runtimeToggle');
  if (rt) rt.addEventListener('click', toggleRuntime);
  const backtestBtn = document.getElementById('runBacktestBtn');
  if (backtestBtn) backtestBtn.addEventListener('click', runQuickBacktest);
  const historyBtn = document.getElementById('loadBacktestHistoryBtn');
  if (historyBtn) historyBtn.addEventListener('click', loadSelectedBacktest);
}
bindControls();
Promise.all([loadRuntime(), loadProcesses(), loadCachedSymbols(), loadBacktestRuns(), loadDashboard(), loadBacktest('latest')]).catch(err => {
  document.getElementById('meta').textContent = 'Erreur chargement dashboard: ' + err;
});
setInterval(() => { loadRuntime(); loadProcesses(); loadDashboard(); if (currentBacktestRunId === 'latest') loadBacktest('latest'); }, 15000);
