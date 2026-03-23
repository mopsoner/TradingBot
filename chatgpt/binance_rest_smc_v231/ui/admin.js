let currentConfig = null;

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function getNum(id, fallback) {
  const v = document.getElementById(id)?.value;
  return v === '' || v == null ? fallback : Number(v);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '';
}

function setStatus(text, isError = false) {
  const meta = document.getElementById('adminMeta');
  if (!meta) return;
  meta.textContent = text;
  meta.classList.toggle('negative', !!isError);
}

function maskSecret(value) {
  if (!value) return 'missing';
  if (value.length <= 6) return 'saved';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

async function loadConfig() {
  const res = await fetch('/api/config?_=' + Date.now());
  const payload = await res.json();
  if (!payload.ok) throw new Error(payload.error || 'Config load failed');
  currentConfig = payload.config;
  setValue('binance_api_key', currentConfig.binance_api_key);
  setValue('binance_api_secret', currentConfig.binance_api_secret);
  setValue('poll_seconds', currentConfig.poll_seconds);
  setValue('lookback_limit', currentConfig.lookback_limit);
  setValue('rsi_period', currentConfig.rsi_period);
  setValue('swing_window', currentConfig.swing_window);
  setValue('session_timezone_offset_hours', currentConfig.session_timezone_offset_hours);
  setValue('equal_level_tolerance_pct', currentConfig.equal_level_tolerance_pct);
  setValue('overbought', currentConfig.signals?.overbought);
  setValue('oversold', currentConfig.signals?.oversold);
  setValue('price_near_extreme_pct', currentConfig.signals?.price_near_extreme_pct);
  setValue('quote_assets', (currentConfig.symbol_discovery?.quote_assets || []).join(','));
  setValue('max_symbols_total', currentConfig.symbol_discovery?.max_symbols_total);
  setValue('batch_size', currentConfig.symbol_discovery?.batch_size);
  setValue('status', currentConfig.symbol_discovery?.status);
  setValue('bt_symbol', currentConfig.backtest?.symbol);
  setText('bt_interval_display', currentConfig.backtest?.interval || 'n/a');
  setValue('history_limit', currentConfig.backtest?.history_limit);
  setValue('min_score', currentConfig.backtest?.min_score);
  setValue('min_rr', currentConfig.backtest?.min_rr);
  setStatus(`Config chargée · key=${currentConfig.binance_api_key ? 'saved' : 'missing'} · secret=${maskSecret(currentConfig.binance_api_secret || '')}`);
}

async function saveConfig() {
  if (!currentConfig) return;
  const next = JSON.parse(JSON.stringify(currentConfig));
  next.binance_api_key = document.getElementById('binance_api_key')?.value || '';
  next.binance_api_secret = document.getElementById('binance_api_secret')?.value || '';
  next.poll_seconds = getNum('poll_seconds', next.poll_seconds);
  next.lookback_limit = getNum('lookback_limit', next.lookback_limit);
  next.rsi_period = getNum('rsi_period', next.rsi_period);
  next.swing_window = getNum('swing_window', next.swing_window);
  next.session_timezone_offset_hours = getNum('session_timezone_offset_hours', next.session_timezone_offset_hours);
  next.equal_level_tolerance_pct = getNum('equal_level_tolerance_pct', next.equal_level_tolerance_pct);
  next.signals = next.signals || {};
  next.signals.overbought = getNum('overbought', next.signals.overbought);
  next.signals.oversold = getNum('oversold', next.signals.oversold);
  next.signals.price_near_extreme_pct = getNum('price_near_extreme_pct', next.signals.price_near_extreme_pct);
  next.symbol_discovery = next.symbol_discovery || {};
  next.symbol_discovery.quote_assets = (document.getElementById('quote_assets')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
  next.symbol_discovery.max_symbols_total = getNum('max_symbols_total', next.symbol_discovery.max_symbols_total);
  next.symbol_discovery.batch_size = getNum('batch_size', next.symbol_discovery.batch_size);
  next.symbol_discovery.status = document.getElementById('status')?.value || next.symbol_discovery.status;
  next.backtest = next.backtest || {};
  next.backtest.symbol = document.getElementById('bt_symbol')?.value || next.backtest.symbol;
  next.backtest.history_limit = getNum('history_limit', next.backtest.history_limit);
  next.backtest.min_score = getNum('min_score', next.backtest.min_score);
  next.backtest.min_rr = getNum('min_rr', next.backtest.min_rr ?? 0.8);

  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: next })
  });
  const payload = await res.json();
  if (!payload.ok) {
    setStatus('Erreur: ' + payload.error, true);
    return;
  }
  await loadConfig();
  setStatus(`Config sauvegardée · key=${next.binance_api_key ? 'saved' : 'missing'} · secret=${maskSecret(next.binance_api_secret || '')}`);
}

document.getElementById('reloadBtn').addEventListener('click', loadConfig);
document.getElementById('saveBtn').addEventListener('click', saveConfig);
loadConfig().catch(err => {
  setStatus('Erreur chargement config: ' + err, true);
});
