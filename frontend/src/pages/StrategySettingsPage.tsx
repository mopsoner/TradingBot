import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { Tooltip } from '../components/Tooltip';
import type { AdminPage } from '../types';

type Props = { onNavigate?: (page: AdminPage) => void };

const IMPACT_COLOR = { haut: 'var(--accent-red)', moyen: 'var(--accent-yellow)', faible: 'var(--accent-green)' } as const;

type AiAnalysis = {
  score?: number;
  verdict?: string;
  suggestions?: Array<{ titre: string; probleme: string; action: string; impact: 'haut' | 'moyen' | 'faible' }>;
  suggested_params?: Record<string, unknown>;
  suggested_name?: string;
};

function Toggle({ checked, onChange, label, tip }: { checked: boolean; onChange: (v: boolean) => void; label: string; tip?: string }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      background: 'var(--surface2)', borderRadius: 6, cursor: 'pointer',
      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 'auto' }} />
      {tip ? <Tooltip text={tip}>{label}</Tooltip> : label}
    </label>
  );
}

const SEQUENCE = [
  { step: '1', label: 'Liquidité',          desc: 'Zone où des ordres institutionnels sont concentrés (highs/lows importants, EQH/EQL)' },
  { step: '2', label: 'Sweep',              desc: 'Le prix dépasse brièvement cette zone pour piéger les retail et collecter la liquidité' },
  { step: '3', label: 'Spring / UTAD',      desc: 'Spring = faux cassage bas (accumulation Wyckoff) · UTAD = faux cassage haut (distribution)' },
  { step: '4', label: 'Displacement',       desc: 'Mouvement fort et rapide (ATR-adaptatif + volume 1.8×) confirmant l\'entrée institutionnelle' },
  { step: '5', label: 'BOS',                desc: 'Break Of Structure — clôture au-delà d\'un swing confirmant la direction' },
  { step: '6', label: 'Expansion liquidité', desc: 'Le prix s\'étend vers la prochaine zone de liquidité (Weekly High, Monthly High…)' },
  { step: '7', label: 'Fib Retracement',    desc: 'Retracement sur 0.5, 0.618, 0.786 — entrée en 2 tranches 60/40 si split activé' },
];

export function StrategySettingsPage({ onNavigate }: Props) {
  const { data: profilesData, reload } = useApi(() => api.strategyProfiles());

  // ── Profile creation form ──────────────────────────────────────────────────
  const [name, setName]                 = useState('SMC Wyckoff v1');
  const [symbol, setSymbol]             = useState('ETHUSDT');
  const [direction, setDirection]       = useState('BOTH');
  const [description, setDescription]   = useState('');
  // Univers de trading
  const [timeframe, setTimeframe]                   = useState('1h');
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState(3);
  const [capitalAllocation, setCapitalAllocation]   = useState(100);
  // Gestionnaire de risque
  const [maxOpenPositions, setMaxOpenPositions]     = useState(8);
  const [dailyLossLimit, setDailyLossLimit]         = useState(3.0);
  const [weeklyLossLimit, setWeeklyLossLimit]       = useState(8.0);
  // Sessions de trading
  const [activeSessions, setActiveSessions]         = useState<string[]>(['london', 'newyork']);
  const [londonStart, setLondonStart]               = useState(7);
  const [londonEnd, setLondonEnd]                   = useState(11);
  const [newyorkStart, setNewyorkStart]             = useState(13);
  const [newyorkEnd, setNewyorkEnd]                 = useState(17);
  const [asiaStart, setAsiaStart]                   = useState(0);
  const [asiaEnd, setAsiaEnd]                       = useState(6);
  // Filtres globaux
  const [fakeBreakoutRequired, setFakeBreakoutRequired] = useState(true);
  const [minVolumeUsd24h, setMinVolumeUsd24h]           = useState(0);
  const [enableSpring, setEnableSpring] = useState(true);
  const [enableUtad, setEnableUtad]     = useState(true);
  const [displacementThreshold, setDisplacementThreshold] = useState(0.55);
  const [atrMin, setAtrMin]             = useState(1.2);
  const [bosSensitivity, setBosSensitivity] = useState(7);
  const [bosCloseConf, setBosCloseConf] = useState(true);
  const [fibLevels, setFibLevels]       = useState('0.5,0.618,0.786');
  const [fibSplit, setFibSplit]         = useState(true);
  const [htfRequired, setHtfRequired]   = useState(true);
  const [htfLongMinBias, setHtfLongMinBias] = useState<'neutral' | 'LONG'>('neutral');
  const [htfShortMinBias, setHtfShortMinBias] = useState<'neutral' | 'SHORT'>('SHORT');
  const [tf1hShortMinBias, setTf1hShortMinBias] = useState<'neutral' | 'SHORT'>('SHORT');
  const [tf1hLongMinBias, setTf1hLongMinBias] = useState<'neutral' | 'LONG'>('neutral');
  const [volAdaptive, setVolAdaptive]   = useState(true);
  const [volMultActive, setVolMultActive] = useState(1.8);
  const [volMultOff, setVolMultOff]     = useState(1.25);
  const [rsiPeriod, setRsiPeriod]       = useState(14);
  const [rsiOb, setRsiOb]               = useState(70);
  const [rsiOs, setRsiOs]               = useState(30);
  const [rsiDivOnly, setRsiDivOnly]     = useState(true);
  const [useWeeklyFilter, setUseWeeklyFilter] = useState(false);
  const [allowWeekend, setAllowWeekend] = useState(false);
  const [use5m, setUse5m]               = useState(false);
  const [requireEqHL, setRequireEqHL]   = useState(true);
  const [stopLoss, setStopLoss]         = useState('structure');
  const [riskPerTrade, setRiskPerTrade] = useState(1.0);
  const [tpRR, setTpRR]                 = useState(2.5);
  const [enableAutoBorrowRepay, setEnableAutoBorrowRepay] = useState(false);

  // ── Profile list state ────────────────────────────────────────────────────
  const [editId, setEditId]               = useState<number | null>(null);
  const [status, setStatus]               = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [backtestStatus, setBacktestStatus] = useState<Record<number, string>>({});
  const [optimizeStatus, setOptimizeStatus] = useState<Record<number, 'loading' | 'done' | 'error'>>({});
  const [analyses, setAnalyses]           = useState<Record<number, AiAnalysis>>({});
  const [profileNewName, setProfileNewName] = useState<Record<number, string>>({});
  const [createStatus, setCreateStatus]   = useState<Record<number, 'saving' | 'done' | 'error'>>({});
  const [createdNames, setCreatedNames]   = useState<Record<number, string>>({});

  const profiles = (profilesData?.rows as Array<Record<string, unknown>> | undefined) ?? [];

  const _buildParams = () => ({
    // Univers
    timeframe,
    max_concurrent_trades: maxConcurrentTrades,
    capital_allocation: capitalAllocation / 100,
    // Gestionnaire de risque
    max_open_positions: maxOpenPositions,
    daily_loss_limit: dailyLossLimit / 100,
    weekly_loss_limit: weeklyLossLimit / 100,
    // Sessions
    active_sessions: activeSessions,
    london_start: londonStart,
    london_end: londonEnd,
    newyork_start: newyorkStart,
    newyork_end: newyorkEnd,
    asia_start: asiaStart,
    asia_end: asiaEnd,
    // Filtres globaux
    fake_breakout_required: fakeBreakoutRequired,
    min_volume_usd_24h: minVolumeUsd24h,
    // Wyckoff
    enable_spring: enableSpring,
    enable_utad: enableUtad,
    displacement_threshold: displacementThreshold,
    displacement_atr_min: atrMin,
    bos_sensitivity: bosSensitivity,
    bos_close_confirmation: bosCloseConf,
    fib_levels: fibLevels.split(',').map(v => Number(v.trim())).filter(v => !Number.isNaN(v)),
    fib_entry_split: fibSplit,
    htf_alignment_required: htfRequired,
    htf_long_min_bias: htfLongMinBias,
    htf_short_min_bias: htfShortMinBias,
    tf1h_short_min_bias: tf1hShortMinBias,
    tf1h_long_min_bias: tf1hLongMinBias,
    volume_adaptive: volAdaptive,
    volume_multiplier_active: volMultActive,
    volume_multiplier_offpeak: volMultOff,
    rsi_period: rsiPeriod,
    rsi_overbought: rsiOb,
    rsi_oversold: rsiOs,
    rsi_divergence_only: rsiDivOnly,
    allow_weekend_trading: allowWeekend,
    use_5m_refinement: use5m,
    require_equal_highs_lows: requireEqHL,
    stop_logic: stopLoss,
    risk_per_trade: riskPerTrade / 100,
    take_profit_rr: tpRR,
    use_weekly_trend_filter: useWeeklyFilter,
  });

  const loadProfileIntoForm = (p: Record<string, unknown>) => {
    let params: Record<string, unknown> = {};
    try { params = JSON.parse(String(p.parameters ?? '{}')); } catch { /**/ }
    setName(String(p.name ?? ''));
    setSymbol(String(p.symbol ?? 'ETHUSDT'));
    setDirection(String(p.direction ?? 'BOTH'));
    setDescription(String(p.description ?? ''));
    setEnableAutoBorrowRepay(Boolean(p.enable_auto_borrow_repay ?? false));
    // Univers
    setTimeframe(String(params.timeframe ?? '1h'));
    setMaxConcurrentTrades(Number(params.max_concurrent_trades ?? 3));
    setCapitalAllocation(Math.round(Number(params.capital_allocation ?? 1) * 100));
    // Risk
    setMaxOpenPositions(Number(params.max_open_positions ?? 8));
    setDailyLossLimit(Math.round(Number(params.daily_loss_limit ?? 0.03) * 1000) / 10);
    setWeeklyLossLimit(Math.round(Number(params.weekly_loss_limit ?? 0.08) * 1000) / 10);
    // Sessions
    setActiveSessions(Array.isArray(params.active_sessions) ? (params.active_sessions as string[]) : ['london', 'newyork']);
    setLondonStart(Number(params.london_start ?? 7));
    setLondonEnd(Number(params.london_end ?? 11));
    setNewyorkStart(Number(params.newyork_start ?? 13));
    setNewyorkEnd(Number(params.newyork_end ?? 17));
    setAsiaStart(Number(params.asia_start ?? 0));
    setAsiaEnd(Number(params.asia_end ?? 6));
    // Filtres
    setFakeBreakoutRequired(Boolean(params.fake_breakout_required ?? true));
    setMinVolumeUsd24h(Number(params.min_volume_usd_24h ?? 0));
    // Wyckoff
    setEnableSpring(Boolean(params.enable_spring ?? true));
    setEnableUtad(Boolean(params.enable_utad ?? true));
    setDisplacementThreshold(Number(params.displacement_threshold ?? 0.55));
    setAtrMin(Number(params.displacement_atr_min ?? 1.2));
    setBosSensitivity(Number(params.bos_sensitivity ?? 7));
    setBosCloseConf(Boolean(params.bos_close_confirmation ?? true));
    const fib = Array.isArray(params.fib_levels) ? (params.fib_levels as number[]).join(',') : '0.5,0.618,0.786';
    setFibLevels(fib);
    setFibSplit(Boolean(params.fib_entry_split ?? true));
    setHtfRequired(Boolean(params.htf_alignment_required ?? true));
    setHtfLongMinBias((params.htf_long_min_bias as 'neutral' | 'LONG') ?? 'neutral');
    setHtfShortMinBias((params.htf_short_min_bias as 'neutral' | 'SHORT') ?? 'SHORT');
    setTf1hShortMinBias((params.tf1h_short_min_bias as 'neutral' | 'SHORT') ?? 'SHORT');
    setTf1hLongMinBias((params.tf1h_long_min_bias as 'neutral' | 'LONG') ?? 'neutral');
    setVolAdaptive(Boolean(params.volume_adaptive ?? true));
    setVolMultActive(Number(params.volume_multiplier_active ?? 1.8));
    setVolMultOff(Number(params.volume_multiplier_offpeak ?? 1.25));
    setRsiPeriod(Number(params.rsi_period ?? 14));
    setRsiOb(Number(params.rsi_overbought ?? 70));
    setRsiOs(Number(params.rsi_oversold ?? 30));
    setRsiDivOnly(Boolean(params.rsi_divergence_only ?? true));
    setUseWeeklyFilter(Boolean(params.use_weekly_trend_filter ?? false));
    setAllowWeekend(Boolean(params.allow_weekend_trading ?? false));
    setUse5m(Boolean(params.use_5m_refinement ?? false));
    setRequireEqHL(Boolean(params.require_equal_highs_lows ?? true));
    setStopLoss(String(params.stop_logic ?? 'structure'));
    setRiskPerTrade(Number(params.risk_per_trade ?? 0.01) * 100);
    setTpRR(Number(params.take_profit_rr ?? 2.5));
  };

  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || profiles.length === 0) return;
    const active = profiles.find(p => p.is_active) ?? profiles[0];
    if (active) {
      loadProfileIntoForm(active);
      setEditId(Number(active.id));
      autoLoaded.current = true;
    }
  }, [profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelEdit = () => {
    setEditId(null);
    setName('SMC Wyckoff v1');
    setSymbol('ETHUSDT'); setDirection('BOTH'); setDescription('');
    setTimeframe('1h'); setMaxConcurrentTrades(3); setCapitalAllocation(100);
    setMaxOpenPositions(8); setDailyLossLimit(3.0); setWeeklyLossLimit(8.0);
    setActiveSessions(['london', 'newyork']);
    setLondonStart(7); setLondonEnd(11); setNewyorkStart(13); setNewyorkEnd(17); setAsiaStart(0); setAsiaEnd(6);
    setFakeBreakoutRequired(true); setMinVolumeUsd24h(0);
    setEnableSpring(true); setEnableUtad(true);
    setDisplacementThreshold(0.55); setAtrMin(1.2);
    setBosSensitivity(7); setBosCloseConf(true);
    setFibLevels('0.5,0.618,0.786'); setFibSplit(true);
    setHtfRequired(true); setHtfLongMinBias('neutral'); setHtfShortMinBias('SHORT');
    setTf1hShortMinBias('SHORT'); setTf1hLongMinBias('neutral'); setVolAdaptive(true);
    setVolMultActive(1.8); setVolMultOff(1.25);
    setRsiPeriod(14); setRsiOb(70); setRsiOs(30); setRsiDivOnly(true);
    setUseWeeklyFilter(false);
    setAllowWeekend(false); setUse5m(false); setRequireEqHL(true);
    setStopLoss('structure'); setRiskPerTrade(1.0); setTpRR(2.5);
    setEnableAutoBorrowRepay(false);
    setStatus('');
  };

  const saveProfile = async () => {
    const body = { name, mode: 'research', symbol, direction, description, parameters: _buildParams(), enable_auto_borrow_repay: enableAutoBorrowRepay };
    const res = editId !== null
      ? await api.updateStrategyProfile(editId, body)
      : await api.saveStrategyProfile(body);
    if (res.ok) {
      setStatus(editId !== null ? '✅ Profil mis à jour.' : '✅ Profil sauvegardé.');
      setEditId(null);
      reload();
    } else {
      setStatus(`❌ Erreur: ${String(res.reason)}`);
    }
  };

  const deleteProfile = async (profileId: number) => {
    const res = await api.deleteStrategyProfile(profileId);
    if (res.ok) {
      setDeleteConfirm(null);
      if (editId === profileId) cancelEdit();
      reload();
    }
  };

  const runProfileBacktest = async (profileId: number) => {
    setBacktestStatus(prev => ({ ...prev, [profileId]: 'running' }));
    const res = await api.backtestStrategyProfile(profileId);
    if (res.ok) {
      const m = res.metrics as Record<string, number>;
      setBacktestStatus(prev => ({
        ...prev,
        [profileId]: `WR ${(m.win_rate * 100).toFixed(1)}% · PF ${m.profit_factor.toFixed(2)} · DD ${(m.drawdown * 100).toFixed(1)}%`,
      }));
      reload();
    } else {
      setBacktestStatus(prev => ({ ...prev, [profileId]: `❌ ${String(res.reason)}` }));
    }
  };

  const optimize = async (profileId: number, backtestId: number, profileName: string) => {
    setOptimizeStatus(prev => ({ ...prev, [profileId]: 'loading' }));
    try {
      const res = await api.optimizeBacktest(backtestId);
      if (res.ok) {
        const a = res.analysis as AiAnalysis;
        setAnalyses(prev => ({ ...prev, [profileId]: a }));
        setOptimizeStatus(prev => ({ ...prev, [profileId]: 'done' }));
        const suggestedName = a.suggested_name ?? _nextVersion(profileName);
        setProfileNewName(prev => ({ ...prev, [profileId]: suggestedName }));
      } else {
        setOptimizeStatus(prev => ({ ...prev, [profileId]: 'error' }));
      }
    } catch {
      setOptimizeStatus(prev => ({ ...prev, [profileId]: 'error' }));
    }
  };

  const createOptimized = async (profileId: number) => {
    const analysis = analyses[profileId];
    if (!analysis?.suggested_params) return;
    setCreateStatus(prev => ({ ...prev, [profileId]: 'saving' }));
    try {
      const res = await api.createOptimizedProfile(profileId, {
        source_profile_id: profileId,
        suggested_params: analysis.suggested_params as Record<string, unknown>,
        new_name: profileNewName[profileId],
      });
      if (res.ok) {
        setCreatedNames(prev => ({ ...prev, [profileId]: String(res.name ?? profileNewName[profileId]) }));
        setCreateStatus(prev => ({ ...prev, [profileId]: 'done' }));
        reload();
      } else {
        setCreateStatus(prev => ({ ...prev, [profileId]: 'error' }));
      }
    } catch {
      setCreateStatus(prev => ({ ...prev, [profileId]: 'error' }));
    }
  };

  return (
    <section>
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Stratégie SMC/Wyckoff</h2>
          <p className="page-description">Gestion des profils de stratégie et leurs 12 règles</p>
        </div>
        {onNavigate && (
          <button className="btn btn-primary" onClick={() => onNavigate('Backtests')}>
            Lancer un backtest →
          </button>
        )}
      </div>

      <div className="grid-2">
        {/* ── Left: profile creation / edition form ─────────────────────── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>
              {editId !== null ? '✏️ Modifier le profil' : 'Nouveau profil'}
            </h3>
            {editId !== null && (
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={cancelEdit}>
                Annuler
              </button>
            )}
          </div>

          <div className="form-group">
            <label>Nom du profil</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="SMC Wyckoff v1" />
          </div>

          {/* ── Identité du profil ──────────────────────────────────────── */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Identité du profil</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Crypto (symbol)</label>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.toUpperCase())}
                  placeholder="ETHUSDT"
                  style={{ fontFamily: 'monospace', fontWeight: 600 }}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Direction</label>
                <select value={direction} onChange={e => setDirection(e.target.value)}>
                  <option value="BOTH">↕ LONG + SHORT (les deux)</option>
                  <option value="LONG">↑ LONG uniquement</option>
                  <option value="SHORT">↓ SHORT uniquement</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
              <label style={{ fontSize: 12 }}>Description (notes, contexte, conditions)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Profil bull validé BT 4 ans, filtre weekly actif, session London uniquement…"
                rows={2}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* ── Univers de trading ──────────────────────────────────────── */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Univers de trading</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Timeframe principal</label>
                <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                  <option value="5m">5 minutes</option>
                  <option value="15m">15 minutes</option>
                  <option value="1h">1 heure</option>
                  <option value="4h">4 heures</option>
                  <option value="1d">1 jour</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Trades simultanés max</label>
                <input type="number" min={1} max={50} step={1} value={maxConcurrentTrades} onChange={e => setMaxConcurrentTrades(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Allocation capital (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={1} max={100} step={1} value={capitalAllocation} onChange={e => setCapitalAllocation(Number(e.target.value))} style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: 12 }}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Gestionnaire de risque ──────────────────────────────────── */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Gestionnaire de risque (limites)</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Positions ouvertes max</label>
                <input type="number" min={1} max={100} step={1} value={maxOpenPositions} onChange={e => setMaxOpenPositions(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Perte journalière max (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0.1} max={50} step={0.1} value={dailyLossLimit} onChange={e => setDailyLossLimit(Number(e.target.value))} style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: 12 }}>%</span>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Perte hebdomadaire max (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0.1} max={100} step={0.1} value={weeklyLossLimit} onChange={e => setWeeklyLossLimit(Number(e.target.value))} style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: 12 }}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sessions de trading ─────────────────────────────────────── */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Sessions de trading</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {['london', 'newyork', 'asia'].map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 12px', borderRadius: 6, border: `1px solid ${activeSessions.includes(s) ? 'var(--accent)' : 'var(--border)'}`, background: activeSessions.includes(s) ? 'rgba(88,166,255,0.1)' : 'transparent', fontSize: 13 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={activeSessions.includes(s)} onChange={() => setActiveSessions(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} />
                  {s === 'london' ? '🇬🇧 London' : s === 'newyork' ? '🇺🇸 New York' : '🌏 Asie'}
                </label>
              ))}
            </div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>London début (UTC)</label>
                <input type="number" min={0} max={23} step={1} value={londonStart} onChange={e => setLondonStart(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>London fin (UTC)</label>
                <input type="number" min={0} max={23} step={1} value={londonEnd} onChange={e => setLondonEnd(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>New York début (UTC)</label>
                <input type="number" min={0} max={23} step={1} value={newyorkStart} onChange={e => setNewyorkStart(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>New York fin (UTC)</label>
                <input type="number" min={0} max={23} step={1} value={newyorkEnd} onChange={e => setNewyorkEnd(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Asie début (UTC)</label>
                <input type="number" min={0} max={23} step={1} value={asiaStart} onChange={e => setAsiaStart(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Asie fin (UTC)</label>
                <input type="number" min={0} max={23} step={1} value={asiaEnd} onChange={e => setAsiaEnd(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* ── Filtres globaux ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Filtres globaux</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              <Toggle
                checked={fakeBreakoutRequired}
                onChange={setFakeBreakoutRequired}
                label="Faux cassage obligatoire (Spring / UTAD)"
                tip="Exige un faux cassage au-delà de la zone de liquidité avant de valider l'étape 2. Désactiver augmente les setups mais réduit la qualité."
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12 }}>Volume minimum 24h (M USD) — 0 = désactivé</label>
              <input
                type="number" min={0} step={10} value={minVolumeUsd24h}
                onChange={e => setMinVolumeUsd24h(Number(e.target.value))}
                placeholder="0 = désactivé"
              />
            </div>
          </div>

          {/* Wyckoff events */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              <Tooltip text="Le Spring est un faux cassage en bas avant une hausse. L'UTAD est un faux cassage en haut avant une baisse.">
                Événements Wyckoff
              </Tooltip>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Toggle checked={enableSpring} onChange={setEnableSpring} label="Spring (accumulation)" tip="Faux cassage bas — précède une hausse" />
              <Toggle checked={enableUtad} onChange={setEnableUtad} label="UTAD (distribution)" tip="Faux cassage haut — précède une baisse" />
            </div>
          </div>

          {/* Displacement */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              <Tooltip text="Force du mouvement directionnel pour valider une impulsion institutionnelle.">Displacement ATR-adaptatif</Tooltip>
            </div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>
                  <Tooltip text="Force minimale (0.1–1.0). Plus haut = setups plus nets, moins fréquents.">Seuil force (0.1–1.0)</Tooltip>
                </label>
                <input type="number" step="0.01" min="0.1" max="1" value={displacementThreshold} onChange={e => setDisplacementThreshold(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>
                  <Tooltip text="Range bougie ≥ N × ATR(14). 1.2 = bougie 20% plus large que l'ATR moyen.">ATR min (range ÷ ATR14)</Tooltip>
                </label>
                <input type="number" step="0.1" min="0.5" max="3.0" value={atrMin} onChange={e => setAtrMin(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* BOS */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              <Tooltip text="Break Of Structure — cassure d'un sommet/creux qui confirme la direction.">BOS (Break Of Structure)</Tooltip>
            </div>
            <div className="form-group" style={{ margin: 0, marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>
                <Tooltip text="1 = très réactif (plus de signaux), 10 = conservateur (moins de signaux, plus fiables).">Sensibilité (1–10)</Tooltip>
              </label>
              <input type="number" min="1" max="10" value={bosSensitivity} onChange={e => setBosSensitivity(Number(e.target.value))} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {bosSensitivity}/10 — {bosSensitivity <= 3 ? 'Réactif' : bosSensitivity <= 6 ? 'Équilibré' : 'Conservateur (recommandé)'}
              </div>
            </div>
            <Toggle checked={bosCloseConf} onChange={setBosCloseConf} label="BOS = clôture (pas juste wick)" tip="Si activé, le prix doit clôturer au-delà du swing pour valider le BOS. Évite les faux cassages intracandle." />
          </div>

          {/* Fibonacci */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              <Tooltip text="Niveaux de retracement acceptés pour l'entrée. Recommandé: 0.5, 0.618, 0.786.">Fibonacci</Tooltip>
            </div>
            <div className="form-group" style={{ margin: 0, marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>Niveaux (séparés par virgule)</label>
              <input value={fibLevels} onChange={e => setFibLevels(e.target.value)} placeholder="0.5,0.618,0.786" />
            </div>
            <Toggle checked={fibSplit} onChange={setFibSplit} label="Entrée en 2 tranches (60%@0.618 + 40%@0.786)" tip="Divise l'entrée en 2 paliers Fibonacci pour améliorer le prix moyen d'entrée." />
          </div>

          {/* HTF + Volume */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>HTF & Volume</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Toggle checked={htfRequired} onChange={setHtfRequired} label="Alignement 4H obligatoire" tip="Rejette les setups LONG si la structure 4H est Bearish, et les SHORT si Bullish. Filtre HTF essentiel." />
              {htfRequired && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Biais 4H minimum (HTF)</div>
                  <div className="grid-2" style={{ gap: 8 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }} title="Biais 4H minimum requis pour valider un signal LONG. 'neutral' = autorisé si 4H neutral ou LONG. 'LONG' = exige une structure 4H haussière confirmée.">
                        LONG — biais 4H min
                      </label>
                      <select value={htfLongMinBias} onChange={e => setHtfLongMinBias(e.target.value as 'neutral' | 'LONG')} style={{ fontSize: 13 }}>
                        <option value="neutral">neutral (défaut)</option>
                        <option value="LONG">LONG strict (4H haussier confirmé)</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }} title="Biais 4H minimum requis pour valider un signal SHORT. 'SHORT' = exige structure 4H baissière explicite (recommandé crypto). 'neutral' = autorisé si 4H neutral ou SHORT.">
                        SHORT — biais 4H min
                      </label>
                      <select value={htfShortMinBias} onChange={e => setHtfShortMinBias(e.target.value as 'neutral' | 'SHORT')} style={{ fontSize: 13 }}>
                        <option value="SHORT">SHORT strict (recommandé)</option>
                        <option value="neutral">neutral (4H non haussier suffit)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Confirmation 1H (double filtre)</div>
                  <div className="grid-2" style={{ gap: 8 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }} title="Structure 1H minimum pour un LONG. 'neutral' = pas de filtre 1H. 'LONG' = exige 1H haussier (filtre strict).">
                        LONG — structure 1H min
                      </label>
                      <select value={tf1hLongMinBias} onChange={e => setTf1hLongMinBias(e.target.value as 'neutral' | 'LONG')} style={{ fontSize: 13 }}>
                        <option value="neutral">neutral (défaut)</option>
                        <option value="LONG">LONG strict (1H confirmé)</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }} title="Structure 1H minimum pour un SHORT. 'SHORT' = exige 1H baissier (recommandé — +2R vs -1R sur backtests). 'neutral' = pas de filtre 1H.">
                        SHORT — structure 1H min
                      </label>
                      <select value={tf1hShortMinBias} onChange={e => setTf1hShortMinBias(e.target.value as 'neutral' | 'SHORT')} style={{ fontSize: 13 }}>
                        <option value="SHORT">SHORT strict (+2R BT ETH 1an)</option>
                        <option value="neutral">neutral (pas de filtre 1H)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <Toggle checked={volAdaptive} onChange={setVolAdaptive} label="Volume adaptatif (session)" tip="Volume requis plus élevé en session active (London/NY) qu'en hors session." />
              {volAdaptive && (
                <div className="grid-2" style={{ gap: 8 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Mult. session active (×SMA20)</label>
                    <input type="number" step="0.1" min="1.0" max="3.0" value={volMultActive} onChange={e => setVolMultActive(Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: 12 }}>Mult. hors session (×SMA20)</label>
                    <input type="number" step="0.1" min="1.0" max="2.5" value={volMultOff} onChange={e => setVolMultOff(Number(e.target.value))} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RSI */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
              <Tooltip text="RSI jamais bloquant (règle obligatoire). Utilisé uniquement en divergence ou filtre directionnel.">RSI (filtre, jamais déclencheur)</Tooltip>
            </div>
            <Toggle checked={rsiDivOnly} onChange={setRsiDivOnly} label="Divergence only (recommandé)" tip="Le RSI ne bloque JAMAIS une entrée — il est utilisé uniquement pour détecter des divergences." />
            <div className="grid-2" style={{ gap: 8, marginTop: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Période RSI</label>
                <input type="number" min="5" max="30" value={rsiPeriod} onChange={e => setRsiPeriod(Number(e.target.value))} />
              </div>
              <div />
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Surachat</label>
                <input type="number" min="60" max="95" value={rsiOb} onChange={e => setRsiOb(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Survente</label>
                <input type="number" min="5" max="40" value={rsiOs} onChange={e => setRsiOs(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Weekly Trend Filter */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tooltip text="Filtre validé par backtest 4 ans (2022→2026). Bloque les trades contre la tendance weekly. LONG interdit si le marché est en tendance baissière weekly, SHORT interdit si tendance haussière.">
                Filtre Tendance Weekly
              </Tooltip>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(63,185,80,0.15)', color: 'var(--accent-green)', fontWeight: 700 }}>
                Validé BT 4 ans ★
              </span>
            </div>
            <Toggle
              checked={useWeeklyFilter}
              onChange={setUseWeeklyFilter}
              label="Activer le filtre tendance Weekly"
              tip="Valide sur ETHUSDT 2022→2026 : +67% P&L, MaxDD ÷2, WR +4.3pts"
            />
          </div>

          {/* Rules configurable */}
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Règles avancées</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Toggle checked={allowWeekend} onChange={setAllowWeekend} label="Trading le week-end autorisé" tip="Par défaut désactivé. Le crypto trade 24/7 mais la liquidité institutionnelle est réduite en week-end. À activer uniquement si vous avez validé des setups week-end sur votre historique." />
              <Toggle checked={use5m} onChange={setUse5m} label="Refinement 5 minutes activé" tip="Après validation des 7 étapes, vérifie que la bougie 5m de la zone Fib confirme la direction (corps + volume + alignement). Réduit le nb de trades mais améliore la précision d'entrée." />
              <Toggle checked={requireEqHL} onChange={setRequireEqHL} label="EQH/EQL obligatoire pour la liquidité" tip="Equal Highs / Equal Lows — les doubles sommets/creux définissent la zone de liquidité à chasser. Désactiver uniquement si vous voulez détecter d'autres types de liquidité." />
              <Toggle checked={enableAutoBorrowRepay} onChange={setEnableAutoBorrowRepay} label="Auto Borrow & Repay (margin isolé)" tip="Emprunte automatiquement l'actif nécessaire avant d'ouvrir une position en isolated margin, et rembourse à la fermeture du trade." />
            </div>
          </div>

          {/* Risk */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Risk & Target</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>
                  <Tooltip text="% du capital risqué par trade. 1% = recommandé pour la gestion du risque.">Risque par trade (%)</Tooltip>
                </label>
                <input type="number" step="0.1" min="0.1" max="5" value={riskPerTrade} onChange={e => setRiskPerTrade(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>
                  <Tooltip text="Ratio Risk:Reward cible. 2.5 = pour 1 risqué, vous ciblez 2.5 de gain.">Target R:R</Tooltip>
                </label>
                <input type="number" step="0.1" min="1.0" max="10" value={tpRR} onChange={e => setTpRR(Number(e.target.value))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Stop loss logic</label>
                <select value={stopLoss} onChange={e => setStopLoss(e.target.value)}>
                  <option value="structure">Structure (swing high/low)</option>
                  <option value="atr">ATR (1.5× ATR14)</option>
                  <option value="fixed">Fixe (% distance)</option>
                </select>
              </div>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={saveProfile}>
            {editId !== null ? '💾 Enregistrer les modifications' : 'Sauvegarder le profil'}
          </button>
          {status && <div style={{ marginTop: 10, fontSize: 13 }}>{status}</div>}
        </div>

        {/* ── Right: sequence + profiles ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Séquence obligatoire — 7 étapes</h3>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Un signal doit passer les 7 étapes dans l'ordre. RSI/Volume sont des filtres, jamais des déclencheurs.
            </div>
            {SEQUENCE.map(({ step, label, desc }) => (
              <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{step}</span>
                <div>
                  <Tooltip text={desc}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Profils sauvegardés ({profiles.length})</h3>
            {profiles.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, opacity: 0.5 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚙️</div>
                <p>Aucun profil — créez-en un à gauche.</p>
              </div>
            )}
            {profiles.map(p => {
              const pid          = Number(p.id);
              const bt           = backtestStatus[pid];
              const wr           = p.last_backtest_win_rate != null ? Number(p.last_backtest_win_rate) : null;
              const pf           = p.last_backtest_profit_factor != null ? Number(p.last_backtest_profit_factor) : null;
              const lastBtId     = Number(p.last_backtest_id ?? 0);
              const optStatus    = optimizeStatus[pid];
              const analysis     = analyses[pid];
              const cStatus      = createStatus[pid];
              const createdName  = createdNames[pid];

              // Parse profile params to show badges
              let params: Record<string, unknown> = {};
              try { params = JSON.parse(String(p.parameters ?? '{}')); } catch { params = {}; }
              const hasWeekend      = Boolean(params.allow_weekend_trading);
              const has5m           = Boolean(params.use_5m_refinement);
              const hasHtf          = Boolean(params.htf_alignment_required ?? true);
              const hasWeeklyFilter = Boolean(params.use_weekly_trend_filter);

              const profileSymbol    = String(p.symbol ?? 'ETHUSDT');
              const profileDirection = String(p.direction ?? 'BOTH');
              const profileDesc      = String(p.description ?? '');
              const dirColor = profileDirection === 'LONG' ? 'var(--accent-green)' : profileDirection === 'SHORT' ? 'var(--accent-red)' : 'var(--accent)';
              const dirLabel = profileDirection === 'LONG' ? '↑ LONG' : profileDirection === 'SHORT' ? '↓ SHORT' : '↕ LONG+SHORT';

              return (
                <div key={pid} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, background: 'var(--surface2)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>{profileSymbol}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: dirColor, padding: '2px 8px', borderRadius: 6, background: `${dirColor}18`, border: `1px solid ${dirColor}33` }}>{dirLabel}</span>
                        {Boolean(p.approved_for_live) && <span className="badge badge-green">Live ✅</span>}
                      </div>
                      <strong style={{ fontSize: 13 }}>{String(p.name)}</strong>
                      {profileDesc && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }} title={profileDesc}>
                          {profileDesc}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                        {hasHtf          && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(88,166,255,0.15)', color: 'var(--accent)' }}>HTF ✓</span>}
                        {hasWeeklyFilter && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(63,185,80,0.18)', color: 'var(--accent-green)', fontWeight: 700 }}>Weekly ★</span>}
                        {hasWeekend      && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(248,166,0,0.15)', color: 'var(--accent-yellow)' }}>WE</span>}
                        {has5m           && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>5m</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={() => runProfileBacktest(pid)} disabled={bt === 'running'}>
                        {bt === 'running' ? '⏳' : '▶ Tester'}
                      </button>
                      {lastBtId > 0 && (
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--accent)' }}
                          onClick={() => optimize(pid, lastBtId, String(p.name))}
                          disabled={optStatus === 'loading'}>
                          {optStatus === 'loading' ? '🤖…' : '🤖 IA'}
                        </button>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '3px 10px', color: 'var(--accent-yellow)', borderColor: editId === pid ? 'var(--accent-yellow)' : undefined }}
                        onClick={() => { loadProfileIntoForm(p); setEditId(pid); setStatus(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      >
                        ✏️ Éditer
                      </button>
                      {deleteConfirm === pid ? (
                        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button className="btn" style={{ fontSize: 11, padding: '3px 10px', background: 'var(--accent-red)', color: '#fff', border: 'none' }}
                            onClick={() => deleteProfile(pid)}>
                            Confirmer
                          </button>
                          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => setDeleteConfirm(null)}>✕</button>
                        </span>
                      ) : (
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--accent-red)' }}
                          onClick={() => setDeleteConfirm(pid)}>
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {wr !== null && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>
                      WR {(wr * 100).toFixed(1)}% · PF {pf?.toFixed(2)} · DD {p.last_backtest_drawdown != null ? (Number(p.last_backtest_drawdown) * 100).toFixed(1) : '—'}%
                    </div>
                  )}
                  {bt && bt !== 'running' && (
                    <div style={{ fontSize: 12, marginTop: 4, color: 'var(--accent-green)' }}>{bt}</div>
                  )}

                  {/* AI analysis results */}
                  {analysis && (
                    <div style={{ marginTop: 10, padding: 12, background: 'rgba(88,166,255,0.05)', borderRadius: 8, border: '1px solid rgba(88,166,255,0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: (analysis.score ?? 0) >= 70 ? 'var(--accent-green)' : (analysis.score ?? 0) >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                          {analysis.score}/100
                        </span>
                        <span style={{ fontSize: 12, flex: 1, fontStyle: 'italic', color: 'var(--text-muted)' }}>{analysis.verdict}</span>
                      </div>
                      {analysis.suggestions?.slice(0, 4).map((s, i) => (
                        <div key={i} style={{ marginBottom: 6, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, borderLeft: `3px solid ${IMPACT_COLOR[s.impact] ?? 'var(--border)'}` }}>
                          <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2, color: IMPACT_COLOR[s.impact] }}>{s.titre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>⚠ {s.probleme}</div>
                          <div style={{ fontSize: 11 }}>→ {s.action}</div>
                        </div>
                      ))}

                      {/* Create optimized profile */}
                      {analysis.suggested_params && !createdName && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            value={profileNewName[pid] ?? ''}
                            onChange={e => setProfileNewName(prev => ({ ...prev, [pid]: e.target.value }))}
                            placeholder={_nextVersion(String(p.name))}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.3)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}
                          />
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', borderColor: '#3b82f6' }}
                            onClick={() => createOptimized(pid)}
                            disabled={cStatus === 'saving'}
                          >
                            {cStatus === 'saving' ? 'Création…' : '➕ Créer profil optimisé'}
                          </button>
                        </div>
                      )}
                      {createdName && (
                        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.3)', fontSize: 12, color: 'var(--accent-green)' }}>
                          ✅ Profil <strong>"{createdName}"</strong> créé — disponible dans la liste.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function _nextVersion(name: string): string {
  const m = name.match(/-v(\d+)$/i);
  if (m) return name.slice(0, m.index) + `-v${Number(m[1]) + 1}`;
  return name + '-v2';
}
