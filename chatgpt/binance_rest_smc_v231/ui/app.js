async function loadBacktest() {
  try {
    const [reportRes, tradesRes] = await Promise.all([
      fetch('/api/backtest_report?_=' + Date.now()),
      fetch('/data/backtest_trades.json?_=' + Date.now()).catch(() => null),
    ]);
    const payload = await reportRes.json();
    const report = payload.report;
    const el = document.getElementById('backtest');
    if (!report) {
      el.innerHTML = '<div class="stat-pill wide"><span class="k">Backtest</span><strong>Aucun rapport</strong></div>';
      return;
    }
    const items = [
      ['Symbol', report.symbol],
      ['Trades', report.trades],
      ['Winrate', `${report.winrate_pct}%`],
      ['Avg', `${report.average_return_pct}%`],
      ['Median', `${report.median_return_pct}%`],
      ['Best', `${report.best_trade_pct}%`],
      ['Worst', `${report.worst_trade_pct}%`],
      ['PF', report.profit_factor ?? 'n/a'],
      ['Cum.', `${report.cumulative_return_pct}%`],
      ['Avg R', report.average_r_multiple ?? 'n/a'],
      ['Med R', report.median_r_multiple ?? 'n/a'],
      ['Total R', report.total_r ?? 'n/a']
    ];
    el.innerHTML = items.map(([k,v]) => `<div class="stat-pill"><span class="k">${k}</span><strong>${v}</strong></div>`).join('');

    const tradesContainer = document.getElementById('backtestTrades');
    if (!tradesContainer) return;
    if (!tradesRes) {
      tradesContainer.innerHTML = '<div class="stat-pill wide"><span class="k">Trades</span><strong>Aucun fichier de trades</strong></div>';
      return;
    }
    const trades = await tradesRes.json();
    if (!Array.isArray(trades) || !trades.length) {
      tradesContainer.innerHTML = '<div class="stat-pill wide"><span class="k">Trades</span><strong>Aucun trade détaillé</strong></div>';
      return;
    }
    tradesContainer.innerHTML = trades.slice(0, 50).map(t => `
      <article class="signal small-card">
        <div class="topline">
          <div>
            <div class="symbol">${t.symbol} · ${t.side}</div>
            <div class="subline">${t.session} · ${t.bias}</div>
          </div>
          <div class="score">${t.score}</div>
        </div>
        <div class="mini-grid">
          <div><span class="label">Entry</span><strong>${t.entry_price}</strong></div>
          <div><span class="label">Exit</span><strong>${t.exit_price}</strong></div>
          <div><span class="label">Stop</span><strong>${t.stop_price ?? 'n/a'}</strong></div>
          <div><span class="label">Target</span><strong>${t.target_price ?? 'n/a'}</strong></div>
          <div><span class="label">Return %</span><strong>${t.return_pct}</strong></div>
          <div><span class="label">R</span><strong>${t.r_multiple ?? 'n/a'}</strong></div>
        </div>
        <div class="liquidity-box">
          <span class="label">Liquidity target</span>
          <strong>${t.liquidity_target?.type || 'n/a'} ${t.liquidity_target?.level ?? ''}</strong>
          <div class="subline">${t.liquidity_target?.reason || ''}</div>
        </div>
      </article>
    `).join('');
  } catch (err) {
    document.getElementById('backtest').innerHTML = `<div class="stat-pill wide"><span class="k">Backtest</span><strong>Erreur: ${err}</strong></div>`;
  }
}

async function loadDashboard() {
  const res = await fetch('/data/dashboard.json?_=' + Date.now());
  const data = await res.json();

  document.getElementById('meta').textContent = 'Dernière génération: ' + data.generated_at;
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
          <div>
            <div class="symbol">${sig.symbol}</div>
            <div class="subline">${sig.session} · ${sig.bias}</div>
          </div>
          <div class="${scoreClass}">${sig.score}</div>
        </div>

        <div class="price-row">
          <div>
            <div class="label">Prix</div>
            <div class="price">${Number(sig.price).toFixed(6)}</div>
          </div>
          <div>
            <div class="label">RSI 5m</div>
            <div class="value">${sig.rsi_5m ?? 'n/a'}</div>
          </div>
        </div>

        <div class="mini-grid">
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

        ${showPipeline ? `
        <div class="pipeline">
          <span class="badge ${badgeClass(p.collect)}">collect</span>
          <span class="badge ${badgeClass(p.liquidity)}">liquidity</span>
          <span class="badge ${badgeClass(p.zone)}">zone</span>
          <span class="badge ${badgeClass(p.confirm)}">confirm</span>
          <span class="badge ${badgeClass(p.trade)}">trade</span>
        </div>` : ''}
      </article>
    `;
  };

  document.getElementById('top').innerHTML = (data.top_signals || []).map(renderSignal).join('');
  document.getElementById('batch').innerHTML = data.batch_symbols.map(s => `<span class="badge neutral">${s}</span>`).join(' ');
  document.getElementById('signals').innerHTML = filtered.map(renderSignal).join('');
}

function bindControls() {
  ['filterSymbol', 'filterBias', 'filterScore', 'toggleTopOnly', 'togglePipeline', 'toggleTrade'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', loadDashboard);
    el.addEventListener('change', loadDashboard);
  });
}

bindControls();
Promise.all([loadDashboard(), loadBacktest()]).catch(err => {
  document.getElementById('meta').textContent = 'Erreur chargement dashboard: ' + err;
});
setInterval(() => { loadDashboard(); loadBacktest(); }, 15000);
