async function loadDashboard() {
  const res = await fetch('../data/dashboard.json?_=' + Date.now());
  const data = await res.json();

  document.getElementById('meta').textContent = 'Dernière génération: ' + data.generated_at;
  document.getElementById('stats').innerHTML = `
    <div class="row"><span class="k">Total symboles</span><span>${data.stats.all_symbols_count}</span></div>
    <div class="row"><span class="k">Taille du batch</span><span>${data.stats.batch_count}</span></div>
    <div class="row"><span class="k">Boucle (s)</span><span>${data.stats.loop_interval_seconds}</span></div>
  `;

  document.getElementById('batch').innerHTML = data.batch_symbols.map(s => `<span class="badge">${s}</span>`).join(' ');

  document.getElementById('signals').innerHTML = data.signals.map(sig => {
    const p = sig.pipeline || {};
    const trade = sig.trade || {};
    const badge = (value) => value ? 'ok' : 'wait';
    return `
      <div class="signal">
        <div class="row"><strong>${sig.symbol}</strong><span>${sig.session}</span></div>
        <div class="row"><span class="k">Prix</span><span>${Number(sig.price).toFixed(6)}</span></div>
        <div class="row"><span class="k">RSI 5m</span><span>${sig.rsi_5m ?? 'n/a'}</span></div>
        <div class="row"><span class="k">State</span><span>${sig.state}</span></div>
        <div class="row"><span class="k">Trigger</span><span>${sig.trigger}</span></div>
        <div class="row"><span class="k">Bias</span><span>${sig.bias}</span></div>
        <div class="row"><span class="k">Score</span><span>${sig.score}</span></div>
        <div class="row"><span class="k">Trade</span><span>${trade.status || 'watch'} ${trade.side || ''}</span></div>
        <div class="pipeline">
          <span class="badge ${badge(p.collect)}">collect</span>
          <span class="badge ${badge(p.rsi)}">rsi</span>
          <span class="badge ${badge(p.sweep)}">sweep</span>
          <span class="badge ${badge(p.confirm)}">confirm</span>
          <span class="badge ${badge(p.trade)}">trade</span>
        </div>
      </div>
    `;
  }).join('');
}

loadDashboard().catch(err => {
  document.getElementById('meta').textContent = 'Erreur chargement dashboard: ' + err;
});
setInterval(loadDashboard, 15000);
