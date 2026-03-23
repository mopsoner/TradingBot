function fmtIso(iso) { if (!iso) return 'n/a'; try { return new Date(iso).toLocaleString(); } catch { return String(iso); } }
function fmtNum(v, d = 2) { if (v == null || v === '' || Number.isNaN(Number(v))) return 'n/a'; return Number(v).toFixed(d); }
function pill(text, cls = 'pill-neutral') { return `<span class="pill ${cls}">${text}</span>`; }
function renderRow(r) {
  const side = String(r.bias || '').includes('bull') ? 'long' : String(r.bias || '').includes('bear') ? 'short' : 'watch';
  return `<article class="row-card"><div class="row-main"><div><div class="symbol">${r.symbol} · ${r.stage}</div><div class="subline">${fmtIso(r.ts)} · ${r.session || 'n/a'} · ${r.run_id || 'n/a'}</div></div><div class="trade-pills">${pill(r.actionability, r.actionability === 'actionable' ? 'pill-long' : r.actionability === 'blocked' ? 'pill-short' : 'pill-neutral')}${pill(r.trigger || 'wait')}${pill(r.confirm_source || 'n/a')}</div></div><div class="liquidity-box"><span class="label">Reason</span><strong>${r.reason || 'n/a'}</strong></div><div class="row-grid"><div><span class="label">Score</span><strong>${r.score ?? 'n/a'}</strong></div><div><span class="label">Bias</span><strong>${r.bias || 'n/a'}</strong></div><div><span class="label">Liquidity</span><strong>${r.liquidity_type || 'n/a'} ${r.liquidity_level ?? ''}</strong></div><div><span class="label">Entry</span><strong>${fmtNum(r.entry_price, 4)}</strong></div><div><span class="label">Stop</span><strong>${fmtNum(r.stop_price, 4)}</strong></div><div><span class="label">Target</span><strong>${fmtNum(r.target_price, 4)}</strong></div></div></article>`;
}
async function loadJournal() {
  const symbol = (document.getElementById('journalSymbol')?.value || '').trim().toUpperCase();
  const stage = document.getElementById('journalStage')?.value || 'all';
  const actionability = document.getElementById('journalActionability')?.value || 'all';
  const limit = document.getElementById('journalLimit')?.value || '200';
  const params = new URLSearchParams({ limit, stage, actionability });
  if (symbol) params.set('symbol', symbol);
  const res = await fetch('/api/setup-journal?' + params.toString() + '&_=' + Date.now());
  const payload = await res.json();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  document.getElementById('journalMeta').textContent = `${rows.length} entrée(s)`;
  document.getElementById('journalRows').innerHTML = rows.length ? rows.map(renderRow).join('') : '<div class="empty-state">Aucune entrée.</div>';
}
['journalSymbol','journalStage','journalActionability','journalLimit'].forEach(id => {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('input', loadJournal); el.addEventListener('change', loadJournal);
});
loadJournal().catch(err => { document.getElementById('journalMeta').textContent = 'Erreur journal: ' + err; });
