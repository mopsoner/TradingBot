import React, { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { AdminPage } from '../types';
import type { BacktestResult, ProcessStatus, Signal } from '../services/api';

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function pct(n: number) { return (n * 100).toFixed(1) + '%'; }
function num(n: number, d = 2) { return n.toFixed(d); }
function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toFixed(2);
  if (n >= 1)     return n.toFixed(4);
  return n.toFixed(6);
}
function qualityBadge(wr: number, pf: number, dd: number) {
  const score = (wr >= 0.55 ? 2 : wr >= 0.45 ? 1 : 0)
              + (pf >= 1.5 ? 2 : pf >= 1.1 ? 1 : 0)
              + (dd <= 0.08 ? 2 : dd <= 0.15 ? 1 : 0);
  if (score >= 5) return { label: 'Excellent',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' };
  if (score >= 3) return { label: 'Bon',          color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  if (score >= 2) return { label: 'Attention',    color: '#eab308', bg: 'rgba(234,179,8,0.12)' };
  return            { label: 'Insuffisant',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
}
function colorFor(val: number, goodAbove: number, warnAbove: number) {
  return val >= goodAbove ? 'var(--accent-green)' : val >= warnAbove ? 'var(--accent-yellow)' : 'var(--accent-red)';
}

/* ── ExpandedSignals ─────────────────────────────────────────────────────── */
function ExpandedSignals({ r }: { r: BacktestResult }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSignals([]);
    const firstSymbol = r.symbol.split(',')[0].trim();
    api.signalsForBacktest(r.pipeline_run_id, firstSymbol)
      .then(res => { if (!cancelled) setSignals(res.rows); })
      .catch(err => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [r.pipeline_run_id, r.symbol]);

  if (loading) return (
    <div style={{ padding: '12px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Chargement des signaux…</div>
  );
  if (error) return (
    <div style={{ padding: '12px 20px', color: 'var(--accent-red)', fontSize: 12 }}>{error}</div>
  );
  if (signals.length === 0) return (
    <div style={{ padding: '12px 20px', color: 'var(--text-muted)', fontSize: 12 }}>Aucun signal accepté pour ce backtest.</div>
  );

  return (
    <div style={{ padding: '12px 20px 16px', background: 'rgba(6,9,15,0.6)', borderTop: '1px solid rgba(59,130,246,0.15)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)' }}>
            {['Timestamp','Symbole','Direction','Outcome','R','Entry','SL','TP'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map(sig => {
            const dC = sig.direction === 'LONG' ? '#22c55e' : sig.direction === 'SHORT' ? '#ef4444' : '#9ca3af';
            const oC = sig.bt_outcome === 'win' ? '#22c55e' : sig.bt_outcome === 'loss' ? '#ef4444' : '#eab308';
            const oL = sig.bt_outcome === 'win' ? '✓ Win' : sig.bt_outcome === 'loss' ? '✗ Loss' : sig.bt_outcome === 'timeout' ? '⏱ TO' : '—';
            const rVal = sig.bt_r_multiple ?? 0;
            return (
              <tr key={sig.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
                  {sig.timestamp ? new Date(sig.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>{sig.symbol}</td>
                <td style={{ padding: '4px 8px', color: dC, fontWeight: 600 }}>{sig.direction || '—'}</td>
                <td style={{ padding: '4px 8px', color: oC, fontWeight: 600 }}>{oL}</td>
                <td style={{ padding: '4px 8px', color: rVal > 0 ? '#22c55e' : rVal < 0 ? '#ef4444' : '#eab308', fontWeight: 700 }}>
                  {rVal > 0 ? '+' : ''}{rVal.toFixed(2)}R
                </td>
                <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {sig.entry_price ? fmtPrice(sig.entry_price) : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: '#ef4444', fontFamily: 'monospace' }}>
                  {sig.sl_price ? fmtPrice(sig.sl_price) : '—'}
                </td>
                <td style={{ padding: '4px 8px', color: '#22c55e', fontFamily: 'monospace' }}>
                  {sig.tp_price ? fmtPrice(sig.tp_price) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── ExpandedOverrides ───────────────────────────────────────────────────── */
const OVERRIDE_LABELS: Record<string, string> = {
  enabled:                   'Overrides actifs',
  wyckoff_lookback:          'Lookback Wyckoff',
  displacement_threshold:    'Seuil Displacement',
  displacement_atr_min:      'ATR min Displacement',
  displacement_vol_min:      'Volume min Displacement',
  bos_sensitivity:           'Sensibilité BOS',
  bos_close_confirmation:    'BOS clôture requise',
  volume_multiplier_active:  'Multiplicateur vol. (actif)',
  volume_multiplier_offpeak: 'Multiplicateur vol. (off-peak)',
  skip_htf_1h_validation:    'Ignorer validation 1H',
  use_5m_refinement:         'Affinement 5m',
  allow_weekend_trading:     'Trading week-end',
};

function ExpandedOverrides({ overridesJson }: { overridesJson: string }) {
  let ov: Record<string, unknown> = {};
  try { ov = JSON.parse(overridesJson); } catch { /**/ }
  const entries = Object.entries(ov).filter(([k]) => k !== 'enabled');
  if (entries.length === 0) return null;
  return (
    <div style={{ padding: '10px 20px 14px', background: 'rgba(168,85,247,0.04)', borderTop: '1px solid rgba(168,85,247,0.12)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Overrides utilisés pour ce backtest
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 5 }}>
            <span style={{ color: 'var(--text-soft)' }}>{OVERRIDE_LABELS[k] ?? k}:</span>
            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: v === true ? 'var(--accent-green)' : v === false ? 'var(--accent-red)' : 'var(--text)' }}>
              {String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── BacktestOverridesConfigPanel ────────────────────────────────────────── */
const OVERRIDE_DEFAULTS: Record<string, unknown> = {
  enabled: true,
  wyckoff_lookback: 20,
  displacement_threshold: 0.35,
  displacement_atr_min: 0.60,
  displacement_vol_min: 1.00,
  bos_sensitivity: 9,
  bos_close_confirmation: false,
  volume_multiplier_active: 1.00,
  volume_multiplier_offpeak: 0.80,
  skip_htf_1h_validation: true,
  allow_weekend_trading: true,
  use_5m_refinement: false,
};

function NumInput({ val, min, max, step, onChange }: { val: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" value={val} min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || min)}
      style={{
        width: 90, padding: '4px 8px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
        color: 'var(--text-primary)', textAlign: 'right',
      }}
    />
  );
}

function OvField({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      {desc && <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 2 }}>{desc}</div>}
      {children}
    </div>
  );
}

interface AiOverrideResult {
  score: number;
  verdict: string;
  suggested_overrides: Record<string, unknown>;
  suggestions: Array<{ titre: string; probleme: string; action: string; impact: string }>;
}

function BacktestOverridesConfigPanel({ lastBacktest }: { lastBacktest: BacktestResult | null }) {
  const { data: cfgData, reload: reloadCfg } = useApi(() => api.config());
  const cfg = cfgData as Record<string, unknown> | null;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiOverrideResult | null>(null);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (!cfg || draft) return;
    const bt = cfg.backtest as Record<string, unknown> | undefined;
    const ov = (bt?.overrides as Record<string, unknown> | undefined) ?? {};
    setDraft({ ...OVERRIDE_DEFAULTS, ...ov });
  }, [cfg]);

  const setOv = (key: string, value: unknown) => {
    setDraft(prev => prev ? { ...prev, [key]: value } : null);
  };

  const save = async () => {
    if (!cfg || !draft) return;
    setSaving(true); setSaveStatus('');
    try {
      const bt = (cfg.backtest as Record<string, unknown>) ?? {};
      const newCfg = { ...cfg, backtest: { ...bt, overrides: draft } };
      await api.updateConfig(newCfg);
      setSaveStatus('✅ Sauvegardé');
      reloadCfg();
    } catch (e) { setSaveStatus('❌ Erreur: ' + String(e)); }
    finally { setSaving(false); setTimeout(() => setSaveStatus(''), 3000); }
  };

  const runAi = async () => {
    if (!lastBacktest) return;
    setAiLoading(true); setAiError(''); setAiResult(null);
    try {
      const res = await api.optimizeBacktestOverrides(lastBacktest.id);
      if (!res.ok) { setAiError(String(res.reason ?? 'Erreur IA')); return; }
      setAiResult(res.analysis as AiOverrideResult);
    } catch (e) { setAiError(String(e)); }
    finally { setAiLoading(false); }
  };

  const applyAi = () => {
    if (!aiResult?.suggested_overrides) return;
    setDraft(prev => prev ? { ...prev, ...aiResult.suggested_overrides } : aiResult.suggested_overrides);
    setAiResult(null);
  };

  if (!draft) return null;

  const enabled = Boolean(draft.enabled ?? true);
  const impactColor = (i: string) => i === 'haut' ? '#22c55e' : i === 'moyen' ? '#eab308' : '#9ca3af';

  return (
    <div style={{ marginBottom: 24, borderRadius: 10, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.04)', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '12px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#a855f7' }}>⚙️ Overrides pipeline backtest</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
            background: enabled ? 'rgba(168,85,247,0.2)' : 'rgba(100,116,139,0.15)',
            color: enabled ? '#a855f7' : 'var(--text-muted)',
          }}>
            {enabled ? 'Overrides ON' : 'Overrides OFF'}
          </span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{open ? '▲ Réduire' : '▼ Configurer'}</span>
      </div>

      {!open && (
        <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
          {Object.entries(draft).filter(([k]) => k !== 'enabled').map(([k, v]) => (
            <div key={k} style={{ fontSize: 11, display: 'flex', gap: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>{OVERRIDE_LABELS[k] ?? k}:</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', color: v === true ? 'var(--accent-green)' : v === false ? '#ef4444' : 'var(--text)' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div style={{ borderTop: '1px solid rgba(168,85,247,0.15)', padding: '16px 18px' }}>
          {/* Master toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 16,
            background: enabled ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
            borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${enabled ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
          }}>
            <input type="checkbox" checked={enabled} onChange={e => setOv('enabled', e.target.checked)} style={{ width: 'auto' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>Activer les overrides backtest</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Quand désactivé, le backtest utilise exactement le même pipeline que le mode paper/live.
              </div>
            </div>
          </label>

          <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
            {/* Wyckoff */}
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Wyckoff (Spring / UTAD)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px 20px', marginBottom: 14 }}>
              <OvField label="Lookback Wyckoff (bougies 15m)" desc="Fenêtre de scan. Live=5. Augmenter améliore la détection multi-mois.">
                <NumInput val={Number(draft.wyckoff_lookback ?? 20)} min={5} max={96} step={1} onChange={v => setOv('wyckoff_lookback', v)} />
              </OvField>
            </div>

            {/* Displacement */}
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' }}>Displacement</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px 20px', marginBottom: 14 }}>
              <OvField label="Seuil force displacement" desc="Force min. Live=0.40. Abaisser = plus de signaux.">
                <NumInput val={Number(draft.displacement_threshold ?? 0.35)} min={0.1} max={1.0} step={0.05} onChange={v => setOv('displacement_threshold', v)} />
              </OvField>
              <OvField label="Ratio ATR minimum" desc="Taille vs ATR. Live=0.75. Abaisser = mouvements plus petits acceptés.">
                <NumInput val={Number(draft.displacement_atr_min ?? 0.60)} min={0.1} max={3.0} step={0.05} onChange={v => setOv('displacement_atr_min', v)} />
              </OvField>
              <OvField label="Volume min (×SMA20)" desc="Confirmation volumétrique. Live=1.2. Abaisser = moins de filtrage.">
                <NumInput val={Number(draft.displacement_vol_min ?? 1.00)} min={0.3} max={3.0} step={0.1} onChange={v => setOv('displacement_vol_min', v)} />
              </OvField>
            </div>

            {/* BOS */}
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' }}>Break of Structure (BOS)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px 20px', marginBottom: 14 }}>
              <OvField label="Sensibilité BOS (lookback)" desc="Bougies pour swing point. Live=7. Plus élevé = swings plus significatifs.">
                <NumInput val={Number(draft.bos_sensitivity ?? 9)} min={2} max={30} step={1} onChange={v => setOv('bos_sensitivity', v)} />
              </OvField>
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 14,
              background: 'rgba(255,255,255,0.03)', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${Boolean(draft.bos_close_confirmation) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <input type="checkbox" checked={Boolean(draft.bos_close_confirmation)} onChange={e => setOv('bos_close_confirmation', e.target.checked)} style={{ width: 'auto' }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>BOS : clôture obligatoire</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Le BOS exige une clôture au-delà du swing (pas juste un wick). Live défaut: activé.</div>
              </div>
            </label>

            {/* Volume */}
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' }}>Volume</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px 20px', marginBottom: 14 }}>
              <OvField label="Multiplicateur vol. sessions actives" desc="London/NY. Live=1.2. 1.0 = volume normal suffit.">
                <NumInput val={Number(draft.volume_multiplier_active ?? 1.00)} min={0.3} max={4.0} step={0.1} onChange={v => setOv('volume_multiplier_active', v)} />
              </OvField>
              <OvField label="Multiplicateur vol. hors session" desc="Hors sessions actives. Live=0.9.">
                <NumInput val={Number(draft.volume_multiplier_offpeak ?? 0.80)} min={0.3} max={4.0} step={0.1} onChange={v => setOv('volume_multiplier_offpeak', v)} />
              </OvField>
            </div>

            {/* Filtres */}
            <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' }}>Filtres contournés</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
              {([
                ['skip_htf_1h_validation', 'Ignorer la validation HTF 1H vs 4H', 'Bypass le filtre 1H aligné/divergent. Élimine ~30% des rejets. Live: toujours actif.'],
                ['allow_weekend_trading', 'Autoriser le trading le weekend', 'Ignore le filtre weekend. Permet de couvrir tous les timestamps.'],
                ['use_5m_refinement', "Affiner l'entrée sur bougies 5m", 'Utilise les bougies 5m pour affiner l\'entrée. Désactivé = plus rapide.'],
              ] as [string, string, string][]).map(([key, title, desc]) => {
                const checked = Boolean(draft[key]);
                return (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${checked ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  }}>
                    <input type="checkbox" checked={checked} onChange={e => setOv(key, e.target.checked)} style={{ width: 'auto' }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600 }}>{title}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(168,85,247,0.15)', flexWrap: 'wrap' }}>
            <button
              onClick={save} disabled={saving}
              style={{
                padding: '7px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Sauvegarde…' : '💾 Sauvegarder les overrides'}
            </button>
            <button
              onClick={runAi}
              disabled={aiLoading || !lastBacktest}
              title={!lastBacktest ? 'Lance un backtest pour activer l\'optimisation IA' : ''}
              style={{
                padding: '7px 20px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: aiLoading || !lastBacktest ? 'default' : 'pointer',
                background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: 'var(--accent)',
                opacity: aiLoading || !lastBacktest ? 0.5 : 1,
              }}
            >
              {aiLoading ? '⏳ Analyse IA…' : '✨ Optimiser via IA'}
            </button>
            {lastBacktest && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                basé sur le backtest <strong style={{ color: 'var(--text)' }}>{lastBacktest.symbol}</strong> ({lastBacktest.date_from?.slice(0, 7)} → {lastBacktest.date_to?.slice(0, 7)})
              </span>
            )}
            {saveStatus && <span style={{ fontSize: 12, color: saveStatus.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{saveStatus}</span>}
            {aiError && <span style={{ fontSize: 12, color: 'var(--accent-red)' }}>{aiError}</span>}
          </div>

          {/* ── AI Result Panel ── */}
          {aiResult && (
            <div style={{ marginTop: 16, borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.05)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Résultats IA</span>
                  <span style={{
                    padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: (aiResult.score ?? 0) >= 60 ? 'rgba(34,197,94,0.15)' : (aiResult.score ?? 0) >= 40 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                    color: (aiResult.score ?? 0) >= 60 ? '#22c55e' : (aiResult.score ?? 0) >= 40 ? '#eab308' : '#ef4444',
                  }}>
                    Score {aiResult.score}/100
                  </span>
                </div>
                <button onClick={applyAi} style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e',
                }}>
                  ✓ Appliquer les suggestions
                </button>
              </div>
              <div style={{ padding: '12px 16px' }}>
                {aiResult.verdict && (
                  <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.5 }}>{aiResult.verdict}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(aiResult.suggestions ?? []).map((s, i) => (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', borderLeft: `3px solid ${impactColor(s.impact)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)' }}>{s.titre}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: `${impactColor(s.impact)}22`, color: impactColor(s.impact) }}>{s.impact}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{s.probleme}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>→ {s.action}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', fontSize: 11, color: 'var(--text-muted)' }}>
                  Valeurs suggérées : {Object.entries(aiResult.suggested_overrides ?? {}).map(([k, v]) => (
                    <span key={k} style={{ marginRight: 12 }}><strong style={{ color: 'var(--text)' }}>{OVERRIDE_LABELS[k] ?? k}</strong>: <code style={{ color: '#a855f7' }}>{String(v)}</code></span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── BacktestRow ─────────────────────────────────────────────────────────── */
function BacktestRow({
  r, selected, onSelect, onOptimize, onCompare,
}: {
  r: BacktestResult;
  selected: boolean;
  onSelect: () => void;
  onOptimize: () => void;
  onCompare: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const q = qualityBadge(r.win_rate, r.profit_factor, r.drawdown);
  const dateRange = r.date_from && r.date_to
    ? `${r.date_from} → ${r.date_to}`
    : new Date(r.timestamp).toLocaleDateString('fr-FR');

  return (
    <>
      <tr
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        <td style={{ padding: '10px 8px' }}>
          <input type="checkbox" checked={selected} onChange={onSelect} onClick={e => e.stopPropagation()} />
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600 }} onClick={() => setExpanded(!expanded)}>
          <span style={{ marginRight: 6, opacity: 0.5 }}>{expanded ? '▾' : '▸'}</span>
          {r.symbol}
        </td>
        <td style={{ padding: '10px 8px' }} onClick={() => setExpanded(!expanded)}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(59,130,246,0.1)', color: 'var(--accent)',
            border: '1px solid rgba(59,130,246,0.2)',
            whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden',
            textOverflow: 'ellipsis', display: 'inline-block',
          }} title={r.strategy_version}>
            {r.strategy_version || '—'}
          </span>
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-muted)', fontSize: 11 }} onClick={() => setExpanded(!expanded)}>
          {dateRange}
        </td>
        <td style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }} onClick={() => setExpanded(!expanded)}>
          {r.signal_count ?? '—'}
          {r.step_count ? <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> / {r.step_count} steps</span> : null}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: colorFor(r.win_rate, 0.5, 0.42), fontWeight: 700 }} onClick={() => setExpanded(!expanded)}>
          {pct(r.win_rate)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: colorFor(r.profit_factor, 1.5, 1.1), fontWeight: 700 }} onClick={() => setExpanded(!expanded)}>
          {num(r.profit_factor)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center', color: r.drawdown <= 0.1 ? '#22c55e' : r.drawdown <= 0.2 ? '#eab308' : '#ef4444', fontWeight: 700 }} onClick={() => setExpanded(!expanded)}>
          {pct(r.drawdown)}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center' }} onClick={() => setExpanded(!expanded)}>
          <span style={{ padding: '2px 8px', borderRadius: 4, background: q.bg, color: q.color, fontSize: 11, fontWeight: 600 }}>{q.label}</span>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          <button onClick={onOptimize} style={{ marginRight: 6, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.4)', background: 'transparent', color: 'var(--accent)', fontSize: 11, cursor: 'pointer' }}>AI</button>
          <button onClick={onCompare} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>Comparer</button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={10} style={{ padding: 0 }}>
            <ExpandedSignals r={r} />
            {r.overrides_json && <ExpandedOverrides overridesJson={r.overrides_json} />}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── ComparePanel ────────────────────────────────────────────────────────── */
function delta(a: number, b: number, higherIsBetter = true) {
  const d = a - b;
  const good = higherIsBetter ? d > 0 : d < 0;
  const sign = d > 0 ? '+' : '';
  return <span style={{ color: good ? '#22c55e' : '#ef4444', fontSize: 11 }}>{sign}{d.toFixed(3)}</span>;
}
function ComparePanel({ a, b, onClose }: { a: BacktestResult; b: BacktestResult; onClose: () => void }) {
  const rows: [string, (r: BacktestResult) => string, boolean][] = [
    ['Win Rate',      r => pct(r.win_rate),      true],
    ['Profit Factor', r => num(r.profit_factor), true],
    ['Drawdown',      r => pct(r.drawdown),      false],
    ['Expectancy',    r => num(r.expectancy, 4), true],
    ['R Multiple',    r => num(r.r_multiple) + 'R', true],
    ['Signals',       r => String(r.signal_count ?? '—'), true],
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: 24, minWidth: 480, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Comparaison</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Métrique</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>{a.symbol}</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>{b.symbol}</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, fn, hib]) => {
              const va = fn(a), vb = fn(b);
              const na = parseFloat(va), nb = parseFloat(vb);
              return (
                <tr key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{label}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{va}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{vb}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{!isNaN(na) && !isNaN(nb) ? delta(na, nb, hib) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── OptimizePanel ───────────────────────────────────────────────────────── */
function OptimizePanel({ result, onClose }: { result: BacktestResult; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setError(''); setAnalysis(null);
    try {
      const res = await api.optimizeBacktest(result.id);
      setAnalysis(res.analysis as Record<string, unknown>);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 10, padding: 24, width: 540, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Optimisation IA — {result.symbol}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {!analysis && !loading && (
          <button onClick={run} style={{ width: '100%', padding: '10px', borderRadius: 6, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>
            Lancer l'analyse GPT-4o
          </button>
        )}
        {loading && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Analyse en cours…</p>}
        {error && <p style={{ color: 'var(--accent-red)' }}>{error}</p>}
        {analysis && (
          <div>
            {(analysis.summary as string | undefined) && (
              <p style={{ color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{analysis.summary as string}</p>
            )}
            {(analysis.recommendations as unknown[] | undefined)?.map((rec, i) => {
              const r = rec as Record<string, unknown>;
              return (
                <div key={i} style={{ padding: '10px 12px', marginBottom: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6, borderLeft: '3px solid rgba(59,130,246,0.5)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{r.title as string}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{r.description as string}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── BacktestProcessCard ─────────────────────────────────────────────────── */
function BacktestProcessCard({ onDone }: { onDone?: () => void }) {
  const [processes, setProcesses] = useState<ProcessStatus[]>([]);
  const [stopping, setStopping] = useState(false);

  const load = () => {
    api.systemProcesses().then(d => {
      const prev = processes;
      const bt = d.processes.filter(p => p.type === 'backtest' || p.type === 'import');
      setProcesses(bt);
      const wasRunning = prev.some(p => p.status === 'running');
      const nowDone    = bt.every(p => p.status !== 'running');
      if (wasRunning && nowDone && onDone) onDone();
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    return () => clearInterval(poll);
  }, []);

  const handleStop = async () => {
    setStopping(true);
    try { await api.autonomousStop(); } catch { /**/ }
    setTimeout(() => { load(); setStopping(false); }, 1000);
  };

  const running = processes.filter(p => p.status === 'running');
  if (processes.length === 0) return null;

  return (
    <div style={{
      marginBottom: 20, padding: '14px 18px', borderRadius: 10,
      background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: running.length > 0 ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: running.length > 0 ? '#a855f7' : 'var(--text-muted)',
            boxShadow: running.length > 0 ? '0 0 8px #a855f7' : 'none',
            animation: running.length > 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: running.length > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
            {running.length > 0 ? `Backtest en cours (${running.length})` : 'Processus terminé'}
          </span>
        </div>
        {running.length > 0 && (
          <button
            onClick={handleStop}
            disabled={stopping}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              border: '1px solid rgba(239,68,68,0.45)',
              background: stopping ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.13)',
              color: 'var(--accent-red)', cursor: stopping ? 'default' : 'pointer',
              opacity: stopping ? 0.6 : 1,
            }}
          >
            {stopping ? 'Arrêt…' : '⏹ Arrêter'}
          </button>
        )}
      </div>

      {processes.map(p => {
        const isRunning = p.status === 'running';
        return (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderTop: '1px solid rgba(168,85,247,0.12)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: isRunning ? 'var(--text)' : 'var(--text-muted)' }}>
                {p.label}
              </div>
              {p.detail && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.detail}
                </div>
              )}
              {p.pct_done !== undefined && (
                <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: 'rgba(168,85,247,0.15)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width 0.4s ease',
                    width: `${p.pct_done ?? 0}%`,
                    background: p.status === 'error' ? 'var(--accent-red)' : '#a855f7',
                  }} />
                </div>
              )}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
              background: isRunning ? 'rgba(168,85,247,0.15)' : 'rgba(100,116,139,0.12)',
              color: isRunning ? '#a855f7' : 'var(--text-muted)',
            }}>
              {isRunning ? 'En cours' : p.status === 'error' ? 'Erreur' : 'Terminé'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── LaunchForm ──────────────────────────────────────────────────────────── */
const DURATIONS = ['1m', '3m', '6m', '1y', '2y'];

function LaunchForm({ onLaunched }: { onLaunched: () => void }) {
  const { data: symbolsData } = useApi(() => api.symbols());
  const { data: profilesData } = useApi(() => api.strategyProfiles());

  const btUniverse: string[] = Array.isArray(symbolsData) ? symbolsData.filter((s: string) => s.endsWith('USDT')) : [];
  const profiles: Array<Record<string, unknown>> = (profilesData?.rows as Array<Record<string, unknown>> | undefined) ?? [];

  const [selected, setSelected] = useState<string[]>(['FETUSDT']);
  const [duration, setDuration] = useState('1y');
  const [profileId, setProfileId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError]   = useState('');

  const toggle = (s: string) => setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const launch = async () => {
    if (selected.length === 0) { setError('Sélectionnez au moins 1 symbole.'); return; }
    setRunning(true); setResult(null); setError('');
    try {
      const body: Record<string, unknown> = { symbols: selected, duration };
      if (profileId) body.profile_id = parseInt(profileId, 10);
      const res = await api.runBacktest(body);
      const n = (res.signal_count as number | undefined) ?? 0;
      setResult(`✓ Backtest terminé — ${n} signal${n !== 1 ? 's' : ''} accepté${n !== 1 ? 's' : ''}`);
      onLaunched();
    } catch (e) { setError(String(e)); }
    finally { setRunning(false); }
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, fontSize: 14 }}>Nouveau backtest walk-forward</div>

      {/* Symbols grid */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>
          Symboles — {selected.length} sélectionné(s)
          <button onClick={() => setSelected([...btUniverse])} style={{ marginLeft: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>Tous</button>
          <button onClick={() => setSelected([])} style={{ marginLeft: 6, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>Aucun</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {btUniverse.map(s => {
            const on = selected.includes(s);
            return (
              <button key={s} onClick={() => toggle(s)} style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: on ? 700 : 400,
                background: on ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${on ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: on ? 'var(--accent)' : 'var(--text-muted)',
              }}>{s.replace('USDT', '')}</button>
            );
          })}
        </div>
      </div>

      {/* Durée + Profil */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>Durée</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {DURATIONS.map(d => (
              <button key={d} onClick={() => setDuration(d)} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                background: duration === d ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${duration === d ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: duration === d ? 'var(--accent)' : 'var(--text-muted)', fontWeight: duration === d ? 700 : 400,
              }}>{d}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>Profil stratégie</div>
          <select value={profileId} onChange={e => setProfileId(e.target.value)} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
            color: 'var(--text-primary)', fontSize: 12, padding: '5px 10px',
          }}>
            <option value=''>Défaut (SMC/Wyckoff)</option>
            {profiles.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ color: 'var(--accent-red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      {result && <div style={{ color: '#22c55e', fontSize: 12, marginBottom: 10 }}>{result}</div>}

      <button onClick={launch} disabled={running} style={{
        padding: '9px 28px', borderRadius: 6, fontSize: 13, cursor: running ? 'default' : 'pointer', fontWeight: 700,
        background: running ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.25)',
        border: '1px solid rgba(59,130,246,0.5)', color: running ? 'var(--text-muted)' : 'var(--accent)',
        opacity: running ? 0.7 : 1,
      }}>
        {running ? 'Backtest en cours…' : 'Lancer le backtest'}
      </button>
    </div>
  );
}

/* ── BacktestsPage ───────────────────────────────────────────────────────── */
export function BacktestsPage({ onNavigate: _onNavigate }: { onNavigate?: (page: AdminPage) => void } = {}) {
  const { data, reload } = useApi(() => api.backtests('?limit=100&order=-timestamp'));
  const rows: BacktestResult[] = (data?.rows ?? []) as BacktestResult[];

  const [compareA, setCompareA]       = useState<BacktestResult | null>(null);
  const [compareB, setCompareB]       = useState<BacktestResult | null>(null);
  const [optimizeTarget, setOptimize] = useState<BacktestResult | null>(null);
  const [compareQueue, setCompareQueue] = useState<number[]>([]);

  const handleCompare = (r: BacktestResult) => {
    if (compareQueue.includes(r.id)) {
      setCompareQueue(q => q.filter(id => id !== r.id));
      return;
    }
    const next = [...compareQueue, r.id];
    if (next.length >= 2) {
      const [idA, idB] = next;
      const a = rows.find(x => x.id === idA);
      const b = rows.find(x => x.id === idB);
      if (a && b) { setCompareA(a); setCompareB(b); }
      setCompareQueue([]);
    } else {
      setCompareQueue(next);
    }
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-primary)', fontWeight: 800 }}>Backtests</h1>
        <button onClick={reload} style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          Rafraîchir
        </button>
      </div>

      <LaunchForm onLaunched={reload} />

      <BacktestOverridesConfigPanel lastBacktest={rows[0] ?? null} />

      <BacktestProcessCard onDone={reload} />

      {compareQueue.length === 1 && (
        <div style={{ padding: '8px 14px', marginBottom: 12, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 6, color: '#eab308', fontSize: 12 }}>
          Cliquez sur "Comparer" d'un second backtest pour voir la comparaison.
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun backtest enregistré. Lancez un premier backtest ci-dessus.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(59,130,246,0.07)', color: 'var(--text-muted)', fontSize: 11 }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', width: 28 }}></th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Symboles</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Profil</th>
                <th style={{ padding: '10px 8px', textAlign: 'left' }}>Période</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Signaux</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>WR%</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>PF</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>DD%</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Qualité</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <BacktestRow
                  key={r.id}
                  r={r}
                  selected={compareQueue.includes(r.id)}
                  onSelect={() => handleCompare(r)}
                  onOptimize={() => setOptimize(r)}
                  onCompare={() => handleCompare(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compareA && compareB && (
        <ComparePanel a={compareA} b={compareB} onClose={() => { setCompareA(null); setCompareB(null); }} />
      )}
      {optimizeTarget && (
        <OptimizePanel result={optimizeTarget} onClose={() => setOptimize(null)} />
      )}
    </div>
  );
}
