import { useEffect, useState, useMemo, useCallback } from 'react';
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

const QUOTE_BASES = ['USDT', 'USDC', 'BTC'] as const;

function SymbolBaseSelector({
  symbolsByQuote,
  enabledSymbols,
  onChange,
  loadError = false,
}: {
  symbolsByQuote: Record<string, string[]>;
  enabledSymbols: string[];
  onChange: (symbols: string[]) => void;
  loadError?: boolean;
}) {
  const enabled = useMemo(() => new Set(enabledSymbols), [enabledSymbols]);

  const isBaseFullySelected = useCallback(
    (base: string) => {
      const pairs = symbolsByQuote[base] ?? [];
      return pairs.length > 0 && pairs.every(p => enabled.has(p));
    },
    [symbolsByQuote, enabled],
  );

  const baseSelectedCount = useCallback(
    (base: string) => {
      const pairs = symbolsByQuote[base] ?? [];
      return pairs.filter(p => enabled.has(p)).length;
    },
    [symbolsByQuote, enabled],
  );

  const toggleBase = useCallback(
    (base: string) => {
      const pairs = symbolsByQuote[base] ?? [];
      if (isBaseFullySelected(base)) {
        const pairSet = new Set(pairs);
        onChange(enabledSymbols.filter(s => !pairSet.has(s)));
      } else {
        const merged = new Set(enabledSymbols);
        pairs.forEach(p => merged.add(p));
        onChange(Array.from(merged));
      }
    },
    [symbolsByQuote, enabledSymbols, isBaseFullySelected, onChange],
  );

  const togglePair = useCallback(
    (pair: string) => {
      if (enabled.has(pair)) {
        onChange(enabledSymbols.filter(s => s !== pair));
      } else {
        onChange([...enabledSymbols, pair]);
      }
    },
    [enabled, enabledSymbols, onChange],
  );

  const selectAllBase = useCallback(
    (base: string) => {
      const pairs = symbolsByQuote[base] ?? [];
      const merged = new Set(enabledSymbols);
      pairs.forEach(p => merged.add(p));
      onChange(Array.from(merged));
    },
    [symbolsByQuote, enabledSymbols, onChange],
  );

  const deselectAllBase = useCallback(
    (base: string) => {
      const pairs = symbolsByQuote[base] ?? [];
      const pairSet = new Set(pairs);
      onChange(enabledSymbols.filter(s => !pairSet.has(s)));
    },
    [symbolsByQuote, enabledSymbols, onChange],
  );

  const [expandedBases, setExpandedBases] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((base: string) => {
    setExpandedBases(prev => {
      const next = new Set(prev);
      if (next.has(base)) next.delete(base);
      else next.add(base);
      return next;
    });
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {QUOTE_BASES.map(base => {
          const total = (symbolsByQuote[base] ?? []).length;
          const selected = baseSelectedCount(base);
          const allSelected = isBaseFullySelected(base);
          const hasAny = selected > 0;
          return (
            <button
              key={base}
              type="button"
              onClick={() => toggleBase(base)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: `2px solid ${allSelected ? 'var(--accent)' : hasAny ? 'var(--accent)' : 'var(--border)'}`,
                background: allSelected ? 'rgba(88,166,255,0.15)' : hasAny ? 'rgba(88,166,255,0.06)' : 'transparent',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--text)',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4,
                border: `2px solid ${allSelected ? 'var(--accent)' : 'var(--border)'}`,
                background: allSelected ? 'var(--accent)' : hasAny ? 'rgba(88,166,255,0.3)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#fff', lineHeight: 1,
              }}>
                {allSelected ? '✓' : hasAny ? '–' : ''}
              </span>
              {base}
              <span style={{
                background: 'var(--surface2)',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-muted)',
              }}>
                {selected}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {QUOTE_BASES.map(base => {
        const pairs = symbolsByQuote[base] ?? [];
        if (pairs.length === 0) return null;
        const selected = baseSelectedCount(base);
        const isExpanded = expandedBases.has(base);

        return (
          <div key={base} style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => toggleExpand(base)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{base}</span>
                <span className="muted" style={{ fontSize: 11 }}>{selected} / {pairs.length} paires</span>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>
            {isExpanded && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); selectAllBase(base); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    Tout sélectionner
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); deselectAllBase(base); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    Tout désélectionner
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pairs.map(pair => {
                    const active = enabled.has(pair);
                    return (
                      <button
                        key={pair}
                        type="button"
                        onClick={() => togglePair(pair)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: 14,
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: active ? 600 : 400,
                          transition: 'all 0.12s ease',
                        }}
                      >
                        {pair}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(symbolsByQuote).length === 0 && (
        <div style={{ fontSize: 12, padding: '8px 0', color: loadError ? 'var(--accent-red)' : 'var(--text-muted)' }}>
          {loadError ? 'Impossible de charger les paires disponibles.' : 'Chargement des paires disponibles…'}
        </div>
      )}

      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {enabledSymbols.length} paire{enabledSymbols.length !== 1 ? 's' : ''} activée{enabledSymbols.length !== 1 ? 's' : ''} au total
      </div>
    </div>
  );
}

export function SystemSettingsPage() {
  const { data, loading, error } = useApi(() => api.config());
  const [draft, setDraft] = useState<Cfg | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [symbolsByQuote, setSymbolsByQuote] = useState<Record<string, string[]>>({});
  const [symbolsError, setSymbolsError] = useState(false);

  useEffect(() => { if (data) setDraft(data as Cfg); }, [data]);

  useEffect(() => {
    api.symbolsByQuote()
      .then(d => { setSymbolsByQuote(d); setSymbolsError(false); })
      .catch(() => setSymbolsError(true));
  }, []);

  function setGroup(group: string, key: string, value: unknown) {
    if (!draft) return;
    const grp = (draft[group] as Cfg) ?? {};
    setDraft({ ...draft, [group]: { ...grp, [key]: value } });
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
  const sess    = grp('session');
  const dat     = grp('data');
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
          <Field label="Mode de trading" desc="research = analyse seule · paper = simulation · live = ordres réels sur exchange">
            <select value={String(sys.mode)} onChange={e => setGroup('system', 'mode', e.target.value)}>
              <option value="research">🔬 Research</option>
              <option value="paper">📋 Paper (simulation)</option>
              <option value="live">⚡ Live (exchange réel)</option>
            </select>
          </Field>
          <Field label="API Key" desc="Clé API de votre exchange (Binance, etc.)">
            <input value={String(sys.api_key ?? '')} placeholder="Laissez vide pour Paper / Research"
              onChange={e => setGroup('system', 'api_key', e.target.value || null)} />
          </Field>
          <Field label="API Secret" desc="Secret API — stocké en mémoire uniquement">
            <input type="password" value={String(sys.api_secret ?? '')} placeholder="••••••••••••"
              onChange={e => setGroup('system', 'api_secret', e.target.value || null)} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Univers de trading" icon="🪙">
        <Field label="Sélecteur de paires" desc="Activez une base pour ajouter toutes ses paires, ou affinez individuellement">
          <SymbolBaseSelector
            symbolsByQuote={symbolsByQuote}
            enabledSymbols={(trading.enabled_symbols as string[]) ?? []}
            onChange={syms => setGroup('trading', 'enabled_symbols', syms)}
            loadError={symbolsError}
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
          <Field
            label="Source de données bougies"
            desc="Binance : données temps réel (nécessite accès réseau). yfinance : données historiques gratuites via Yahoo Finance. CSV : import manuel de fichier."
          >
            <select
              value={String(dat.candle_source ?? 'yfinance')}
              onChange={e => setGroup('data', 'candle_source', e.target.value)}
            >
              <option value="yfinance">Yahoo Finance (yfinance) — recommandé</option>
              <option value="binance">Binance API — accès réseau requis</option>
              <option value="csv">Fichier CSV (import manuel)</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', fontSize: 12, color: 'var(--text-muted)' }}>
          ℹ️ Le choix de source s'applique à tous les imports depuis la page <strong>Données de marché</strong>.
          Les bougies importées sont stockées en base de données et réutilisées par le backtest et le pipeline.
        </div>
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
