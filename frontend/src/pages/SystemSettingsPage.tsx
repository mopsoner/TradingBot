import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';

type Cfg = Record<string, unknown>;

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="form-group" style={{ marginBottom: 14 }}>
      <label style={{ marginBottom: 2 }}>{label}</label>
      {desc && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{desc}</div>}
      {children}
    </div>
  );
}

function Num({ val, min, max, step = 0.01, onChange }: {
  val: number; min?: number; max?: number; step?: number; onChange: (v: number) => void
}) {
  return (
    <input
      type="number" value={val} min={min} max={max} step={step}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: '100%' }}
    />
  );
}

function Pct({ val, onChange }: { val: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number" value={Number((val * 100).toFixed(4))} min={0} max={100} step={0.1}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ flex: 1 }}
      />
      <span className="muted" style={{ fontSize: 13, minWidth: 20 }}>%</span>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginBottom: open ? 16 : 0 }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h3 style={{ margin: 0, flex: 1 }}>{title}</h3>
        <span className="muted" style={{ fontSize: 12 }}>{open ? '▲ Réduire' : '▼ Développer'}</span>
      </div>
      {open && children}
    </div>
  );
}

export function SystemSettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const { data: endpoints } = useApi(() => api.marginEndpoints());
  const [draft, setDraft] = useState<Cfg | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setDraft(data as Cfg); }, [data]);

  function setGroup(group: string, key: string, value: unknown) {
    if (!draft) return;
    const grp = (draft[group] as Cfg) ?? {};
    setDraft({ ...draft, [group]: { ...grp, [key]: value } });
  }

  function setNested(group: string, key: string, subkey: string, value: unknown) {
    if (!draft) return;
    const grp = (draft[group] as Cfg) ?? {};
    const sub = (grp[key] as Cfg) ?? {};
    setDraft({ ...draft, [group]: { ...grp, [key]: { ...sub, [subkey]: value } } });
  }

  function grp(name: string): Cfg {
    return (draft?.[name] as Cfg) ?? {};
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.updateConfig(draft);
      setStatus('✅ Paramètres sauvegardés avec succès.');
    } catch {
      setStatus('❌ Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section><h2>Paramètres</h2><p className="muted">Chargement…</p></section>;
  if (error)   return <section><h2>Paramètres</h2><p className="red">Erreur: {error}</p></section>;
  if (!draft)  return null;

  const sys     = grp('system');
  const trading = grp('trading');
  const risk    = grp('risk');
  const bt      = grp('backtest');
  const sess    = grp('session');
  const dat     = grp('data');
  const symPrices = (dat.symbol_prices as Record<string, number>) ?? {};
  const activeSessions = (sess.active_sessions as string[]) ?? [];

  function toggleSession(s: string) {
    const cur = activeSessions;
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
    setGroup('session', 'active_sessions', next);
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Paramètres système</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {status && <span style={{ fontSize: 13, color: status.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{status}</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>
            {saving ? 'Sauvegarde…' : '💾 Tout sauvegarder'}
          </button>
        </div>
      </div>

      <SectionCard title="Système & exécution" icon="⚙️">
        <div className="grid-2">
          <Field label="Mode de trading" desc="paper = simulation, live = ordres réels sur exchange">
            <select value={String(sys.mode)} onChange={e => setGroup('system', 'mode', e.target.value)}>
              <option value="research">🔬 Research</option>
              <option value="paper">📋 Paper (simulation)</option>
              <option value="live">⚡ Live (exchange réel)</option>
            </select>
          </Field>
          <Field label="Execution mode (lecture seule)" desc="Mode actuel côté exchange">
            <input value={String(endpoints?.execution_mode ?? sys.mode ?? 'paper')} disabled />
          </Field>
          <Field label="API Key" desc="Clé API de votre exchange (Binance, etc.)">
            <input value={String(sys.api_key ?? '')} placeholder="Laissez vide pour Paper mode"
              onChange={e => setGroup('system', 'api_key', e.target.value || null)} />
          </Field>
          <Field label="API Secret" desc="Secret API — stocké en mémoire uniquement">
            <input type="password" value={String(sys.api_secret ?? '')} placeholder="••••••••••••"
              onChange={e => setGroup('system', 'api_secret', e.target.value || null)} />
          </Field>
          <Field label="Perte journalière max" desc="Seuil d'arrêt automatique du jour (fraction du capital)">
            <Pct val={Number(sys.max_daily_loss ?? 0.03)} onChange={v => setGroup('system', 'max_daily_loss', v)} />
          </Field>
          <Field label="Perte hebdomadaire max" desc="Seuil d'arrêt automatique de la semaine">
            <Pct val={Number(sys.max_weekly_loss ?? 0.08)} onChange={v => setGroup('system', 'max_weekly_loss', v)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Univers de trading" icon="🪙">
        <Field label="Symboles activés" desc="Liste séparée par virgules — doit correspondre aux symboles USDT de votre exchange">
          <textarea
            value={(trading.enabled_symbols as string[]).join(', ')}
            rows={3}
            onChange={e => setGroup('trading', 'enabled_symbols', e.target.value.split(',').map(v => v.trim().toUpperCase()).filter(Boolean))}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          />
        </Field>
        <div className="grid-2">
          <Field label="Timeframe principal" desc="Timeframe de référence pour les analyses (15m, 1h, 4h)">
            <input value={String(trading.timeframe)} onChange={e => setGroup('trading', 'timeframe', e.target.value)} />
          </Field>
          <Field label="Trades simultanés max" desc="Nombre maximum de positions ouvertes en parallèle">
            <Num val={Number(trading.max_concurrent_trades)} min={1} max={50} step={1} onChange={v => setGroup('trading', 'max_concurrent_trades', v)} />
          </Field>
          <Field label="Allocation capital" desc="Fraction du capital total engagée (1.0 = 100%)">
            <Pct val={Number(trading.capital_allocation ?? 1)} onChange={v => setGroup('trading', 'capital_allocation', v)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Gestionnaire de risque" icon="🛡️">
        <div className="grid-2">
          <Field label="Risque par trade" desc="Fraction du capital risquée par trade (ex: 0.01 = 1%)">
            <Pct val={Number(risk.risk_per_trade ?? 0.01)} onChange={v => setGroup('risk', 'risk_per_trade', v)} />
          </Field>
          <Field label="Positions ouvertes max" desc="Nombre maximum de positions simultanées">
            <Num val={Number(risk.max_open_positions ?? 8)} min={1} max={100} step={1} onChange={v => setGroup('risk', 'max_open_positions', v)} />
          </Field>
          <Field label="Limite de perte journalière" desc="Stop trading pour aujourd'hui si ce seuil est atteint">
            <Pct val={Number(risk.daily_loss_limit ?? 0.03)} onChange={v => setGroup('risk', 'daily_loss_limit', v)} />
          </Field>
          <Field label="Limite de perte hebdomadaire" desc="Stop trading pour la semaine si ce seuil est atteint">
            <Pct val={Number(risk.weekly_loss_limit ?? 0.08)} onChange={v => setGroup('risk', 'weekly_loss_limit', v)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Moteur de simulation backtest" icon="🔬">
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(88,166,255,0.08)', fontSize: 12 }}>
          Ces paramètres contrôlent comment les résultats de backtest sont calculés. Ils s'appliquent à tous les profils stratégie.
        </div>
        <div className="grid-2">
          <Field label="Win rate de base" desc="WR avant les bonus/pénalités des paramètres du profil">
            <Pct val={Number(bt.base_win_rate ?? 0.42)} onChange={v => setGroup('backtest', 'base_win_rate', v)} />
          </Field>
          <Field label="Bonus Spring" desc="+WR si Spring est activé dans le profil">
            <Pct val={Number(bt.spring_bonus ?? 0.06)} onChange={v => setGroup('backtest', 'spring_bonus', v)} />
          </Field>
          <Field label="Bonus UTAD" desc="+WR si UTAD est activé dans le profil">
            <Pct val={Number(bt.utad_bonus ?? 0.05)} onChange={v => setGroup('backtest', 'utad_bonus', v)} />
          </Field>
          <Field label="Sensibilité BOS maximale" desc="Valeur max du slider BOS sensitivity dans les profils">
            <Num val={Number(bt.bos_max_sensitivity ?? 5)} min={1} max={20} step={0.5} onChange={v => setGroup('backtest', 'bos_max_sensitivity', v)} />
          </Field>
          <Field label="Pénalité BOS (à sensibilité max)" desc="-WR appliquée quand BOS sensitivity est au maximum">
            <Pct val={Number(bt.bos_penalty ?? 0.18)} onChange={v => setGroup('backtest', 'bos_penalty', v)} />
          </Field>
          <Field label="WR minimum" desc="Win rate plancher possible (protection simulation)">
            <Pct val={Number(bt.wr_min ?? 0.28)} onChange={v => setGroup('backtest', 'wr_min', v)} />
          </Field>
          <Field label="WR maximum" desc="Win rate plafond possible (protection simulation)">
            <Pct val={Number(bt.wr_max ?? 0.80)} onChange={v => setGroup('backtest', 'wr_max', v)} />
          </Field>
          <Field label="R moyen par trade gagnant" desc="Gain moyen en R d'un trade positif">
            <Num val={Number(bt.avg_win_r ?? 1.4)} min={0.1} max={10} step={0.1} onChange={v => setGroup('backtest', 'avg_win_r', v)} />
          </Field>
          <Field label="R moyen par trade perdant" desc="Perte moyenne en R d'un trade négatif">
            <Num val={Number(bt.avg_loss_r ?? 1.0)} min={0.1} max={10} step={0.1} onChange={v => setGroup('backtest', 'avg_loss_r', v)} />
          </Field>
          <Field label="Facteur d'échelle de volatilité" desc="Multiplicateur appliqué à la volatilité des bougies">
            <Num val={Number(bt.vol_scale ?? 80)} min={1} max={500} step={1} onChange={v => setGroup('backtest', 'vol_scale', v)} />
          </Field>
          <Field label="Facteur vol minimum" desc="Facteur de volatilité plancher (protection)">
            <Num val={Number(bt.vol_min ?? 0.6)} min={0.1} max={2} step={0.1} onChange={v => setGroup('backtest', 'vol_min', v)} />
          </Field>
          <Field label="Facteur vol maximum" desc="Facteur de volatilité plafond (protection)">
            <Num val={Number(bt.vol_max ?? 2.2)} min={1} max={10} step={0.1} onChange={v => setGroup('backtest', 'vol_max', v)} />
          </Field>
          <Field label="Trades/30j en 15min" desc="Nombre de trades simulés par 30 jours en timeframe 15m">
            <Num val={Number(bt.tf_trades_15m ?? 110)} min={1} max={1000} step={1} onChange={v => setGroup('backtest', 'tf_trades_15m', v)} />
          </Field>
          <Field label="Trades/30j en 1h" desc="Nombre de trades simulés par 30 jours en timeframe 1h">
            <Num val={Number(bt.tf_trades_1h ?? 42)} min={1} max={500} step={1} onChange={v => setGroup('backtest', 'tf_trades_1h', v)} />
          </Field>
          <Field label="Trades/30j en 4h" desc="Nombre de trades simulés par 30 jours en timeframe 4h">
            <Num val={Number(bt.tf_trades_4h ?? 18)} min={1} max={200} step={1} onChange={v => setGroup('backtest', 'tf_trades_4h', v)} />
          </Field>
          <Field label="Trades minimum simulés" desc="Protection contre les backtests trop courts">
            <Num val={Number(bt.min_trades ?? 8)} min={1} max={100} step={1} onChange={v => setGroup('backtest', 'min_trades', v)} />
          </Field>
          <Field label="Trades maximum simulés" desc="Plafond pour éviter des simulations trop lentes">
            <Num val={Number(bt.max_trades ?? 300)} min={10} max={10000} step={10} onChange={v => setGroup('backtest', 'max_trades', v)} />
          </Field>
          <Field label="Horizon par défaut (jours)" desc="Durée de backtest utilisée quand non spécifiée">
            <Num val={Number(bt.default_horizon_days ?? 45)} min={1} max={365} step={1} onChange={v => setGroup('backtest', 'default_horizon_days', v)} />
          </Field>
          <Field label="Profit factor min pour approbation live" desc="PF minimum pour qu'un profil soit approuvé en live">
            <Num val={Number(bt.approved_pf_threshold ?? 1.2)} min={0.5} max={5} step={0.1} onChange={v => setGroup('backtest', 'approved_pf_threshold', v)} />
          </Field>
          <Field label="Drawdown max pour approbation live" desc="DD maximum pour qu'un profil soit approuvé en live">
            <Pct val={Number(bt.approved_dd_threshold ?? 0.12)} onChange={v => setGroup('backtest', 'approved_dd_threshold', v)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Sessions de trading" icon="🕐">
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Sessions actives</label>
          <div style={{ display: 'flex', gap: 12 }}>
            {['london', 'newyork', 'asia'].map(s => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 14px', borderRadius: 6, border: `1px solid ${activeSessions.includes(s) ? 'var(--accent)' : 'var(--border)'}`, background: activeSessions.includes(s) ? 'rgba(88,166,255,0.1)' : 'transparent' }}>
                <input type="checkbox" checked={activeSessions.includes(s)} onChange={() => toggleSession(s)} style={{ width: 'auto' }} />
                {s === 'london' ? '🇬🇧 London' : s === 'newyork' ? '🇺🇸 New York' : '🌏 Asie'}
              </label>
            ))}
          </div>
        </div>
        <div className="grid-2">
          <Field label="London — heure début (UTC)" desc="Heure UTC de début de la session London">
            <Num val={Number(sess.london_start ?? 7)} min={0} max={23} step={1} onChange={v => setGroup('session', 'london_start', v)} />
          </Field>
          <Field label="London — heure fin (UTC)" desc="Heure UTC de fin de la session London">
            <Num val={Number(sess.london_end ?? 11)} min={0} max={23} step={1} onChange={v => setGroup('session', 'london_end', v)} />
          </Field>
          <Field label="New York — heure début (UTC)" desc="Heure UTC de début de la session New York">
            <Num val={Number(sess.newyork_start ?? 13)} min={0} max={23} step={1} onChange={v => setGroup('session', 'newyork_start', v)} />
          </Field>
          <Field label="New York — heure fin (UTC)" desc="Heure UTC de fin de la session New York">
            <Num val={Number(sess.newyork_end ?? 17)} min={0} max={23} step={1} onChange={v => setGroup('session', 'newyork_end', v)} />
          </Field>
          <Field label="Asie — heure début (UTC)" desc="Heure UTC de début de la session Asie">
            <Num val={Number(sess.asia_start ?? 0)} min={0} max={23} step={1} onChange={v => setGroup('session', 'asia_start', v)} />
          </Field>
          <Field label="Asie — heure fin (UTC)" desc="Heure UTC de fin de la session Asie">
            <Num val={Number(sess.asia_end ?? 6)} min={0} max={23} step={1} onChange={v => setGroup('session', 'asia_end', v)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Données de marché" icon="📊">
        <div className="grid-2">
          <Field label="Cron d'enrichissement quotidien" desc="Format cron Unix — ex: '0 1 * * *' = tous les jours à 01h00 UTC">
            <input value={String(dat.enrichment_cron ?? '0 1 * * *')} onChange={e => setGroup('data', 'enrichment_cron', e.target.value)} style={{ fontFamily: 'monospace' }} />
          </Field>
          <div />
          <Field label="Bougies générées en 15m" desc="Nombre de bougies 15min à générer (672 = 7 jours)">
            <Num val={Number(dat.candles_15m ?? 672)} min={1} max={5000} step={1} onChange={v => setGroup('data', 'candles_15m', v)} />
          </Field>
          <Field label="Bougies générées en 1h" desc="Nombre de bougies 1h à générer (720 = 30 jours)">
            <Num val={Number(dat.candles_1h ?? 720)} min={1} max={5000} step={1} onChange={v => setGroup('data', 'candles_1h', v)} />
          </Field>
          <Field label="Bougies générées en 4h" desc="Nombre de bougies 4h à générer (540 = 90 jours)">
            <Num val={Number(dat.candles_4h ?? 540)} min={1} max={5000} step={1} onChange={v => setGroup('data', 'candles_4h', v)} />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>
            Prix de référence par symbole
            <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>(utilisés pour la génération de bougies réalistes)</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {Object.entries(symPrices).map(([sym, price]) => (
              <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 80 }}>{sym.replace('USDT', '')}</span>
                <input
                  type="number"
                  value={price}
                  step={sym === 'BTCUSDT' ? 100 : sym === 'ETHUSDT' ? 10 : 0.01}
                  onChange={e => setNested('data', 'symbol_prices', sym, Number(e.target.value))}
                  style={{ flex: 1, padding: '3px 6px', fontSize: 12 }}
                />
                <span className="muted" style={{ fontSize: 11 }}>$</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Endpoints isolated margin (lecture seule)" icon="🔌">
        {Object.entries((endpoints?.endpoints ?? {}) as Record<string, { method: string; path: string; description: string } | string>).map(([k, v]) => {
          const isObj = typeof v === 'object' && v !== null;
          const method = isObj ? (v as { method: string }).method : '';
          const path = isObj ? (v as { path: string }).path : String(v);
          const desc = isObj ? (v as { description: string }).description : '';
          return (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span className="muted" style={{ fontSize: 12 }}>{k}</span>
                {desc && <span className="muted" style={{ fontSize: 10, marginLeft: 8, opacity: 0.6 }}>{desc}</span>}
              </div>
              <code style={{ fontSize: 11 }}>{method ? `${method} ${path}` : path}</code>
            </div>
          );
        })}
      </SectionCard>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 160 }}>
          {saving ? 'Sauvegarde…' : '💾 Tout sauvegarder'}
        </button>
        {status && <span style={{ fontSize: 13, color: status.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{status}</span>}
      </div>
    </section>
  );
}
