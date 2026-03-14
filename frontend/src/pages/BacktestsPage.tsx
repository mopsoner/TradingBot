import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { BacktestResult } from '../services/api';
import { TIMEFRAMES } from '../constants';
import { fmtSym } from '../utils/dateUtils';
import { Tooltip } from '../components/Tooltip';
import { useSortable } from '../hooks/useSortable';

function pct(n: number) { return (n * 100).toFixed(1) + '%'; }
function num(n: number, d = 2) { return n.toFixed(d); }

const IMPACT_COLOR = { haut: 'var(--accent-red)', moyen: 'var(--accent-yellow)', faible: 'var(--accent-green)' } as const;

function delta(a: number, b: number, higherIsBetter = true) {
  const d = a - b;
  const good = higherIsBetter ? d > 0 : d < 0;
  const sign = d > 0 ? '+' : '';
  return <span style={{ color: good ? 'var(--accent-green)' : d === 0 ? 'var(--text-muted)' : 'var(--accent-red)', fontSize: 12 }}>
    {sign}{d.toFixed(3)}
  </span>;
}

function ComparePanel({ a, b }: { a: BacktestResult; b: BacktestResult }) {
  const rows: [string, string, (r: BacktestResult) => string, boolean][] = [
    ['Symbole',        'Crypto testée',                                             r => r.symbol,                       true],
    ['Timeframe',      'Unité de temps des bougies',                                r => r.timeframe,                    true],
    ['Stratégie',      'Profil de stratégie utilisé',                               r => r.strategy_version,             true],
    ['Win rate',       '% de trades gagnants sur le total',                         r => pct(r.win_rate),                true],
    ['Profit factor',  'Ratio gains totaux / pertes totales. >1.2 = rentable',      r => num(r.profit_factor),           true],
    ['Drawdown',       'Perte maximale depuis un pic. Plus bas = moins risqué',      r => pct(r.drawdown),                false],
    ['Expectancy',     'Gain moyen par trade en R. Positif = stratégie rentable',   r => num(r.expectancy, 4),           true],
    ['R multiple',     'Rendement moyen en unités de risque (1R = 1× votre risque)',r => num(r.r_multiple) + 'R',        true],
  ];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Comparaison — #{a.id} vs #{b.id}</h3>
      <table>
        <thead>
          <tr>
            <th>Métrique</th>
            <th>#{a.id} · {a.symbol} {a.timeframe}</th>
            <th>#{b.id} · {b.symbol} {b.timeframe}</th>
            <th>Delta (A − B)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, tip, fn, higherIsBetter]) => {
            const va = fn(a), vb = fn(b);
            const na = parseFloat(va), nb = parseFloat(vb);
            return (
              <tr key={label}>
                <td className="muted" style={{ fontWeight: 600 }}>
                  <Tooltip text={tip}>{label}</Tooltip>
                </td>
                <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{va}</td>
                <td style={{ fontWeight: 600 }}>{vb}</td>
                <td>{!isNaN(na) && !isNaN(nb) ? delta(na, nb, higherIsBetter) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: 'var(--surface2)', fontSize: 12 }}>
        {a.win_rate >= b.win_rate && a.profit_factor >= b.profit_factor
          ? <span style={{ color: 'var(--accent-green)' }}>✅ Backtest A est globalement meilleur sur win rate et profit factor.</span>
          : b.win_rate >= a.win_rate && b.profit_factor >= a.profit_factor
          ? <span style={{ color: 'var(--accent-yellow)' }}>⚡ Backtest B surpasse A sur win rate et profit factor.</span>
          : <span className="muted">Les deux backtests ont des avantages différents — arbitrage selon votre priorité.</span>
        }
      </div>
    </div>
  );
}

type Analysis = {
  score: number;
  verdict: string;
  suggestions: Array<{ titre: string; probleme: string; action: string; impact: 'haut' | 'moyen' | 'faible' }>;
};

function OptimizePanel({ result, onClose, onProfileCreated }: { result: BacktestResult; onClose: () => void; onProfileCreated?: () => void }) {
  const [loading, setLoading]     = useState(false);
  const [analysis, setAnalysis]   = useState<Analysis | null>(null);
  const [error, setError]         = useState('');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError('');
    setSaved(null);
    try {
      const res = await api.optimizeBacktest(result.id);
      if (res.ok) {
        const a = res.analysis as Analysis & { suggested_name?: string; suggested_params?: Record<string, unknown> };
        setAnalysis(a);
        setProfileId(typeof res.profile_id === 'number' ? res.profile_id : null);
        setProfileName(a.suggested_name ?? _nextVersion(String(res.profile_name ?? result.strategy_version)));
      } else {
        setError(String(res.reason ?? 'Erreur inconnue'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async () => {
    if (!analysis || !profileName.trim()) return;
    const a = analysis as Analysis & { suggested_params?: Record<string, unknown> };
    setSaving(true);
    try {
      let res: Record<string, unknown>;
      if (profileId && a.suggested_params) {
        res = await api.createOptimizedProfile(profileId, {
          source_profile_id: profileId,
          suggested_params: a.suggested_params,
          new_name: profileName.trim(),
        });
      } else {
        res = await api.saveStrategyProfile({
          name: profileName.trim(),
          mode: 'research',
          parameters: a.suggested_params ?? {},
        });
      }
      if (res.ok) {
        setSaved(profileName.trim());
        onProfileCreated?.();
      } else {
        setError(String(res.reason ?? 'Erreur lors de la création'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16, border: '1px solid rgba(88,166,255,0.3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>🤖 Optimisation IA — #{result.id} · {result.symbol} {result.timeframe}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            L'IA analyse vos métriques et paramètres pour proposer des améliorations précises, puis génère un profil optimisé.
          </div>
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>✕ Fermer</button>
      </div>

      {!analysis && !loading && (
        <button className="btn btn-primary" onClick={run} style={{ width: '100%' }}>
          ▶ Lancer l'analyse IA
        </button>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
          <div className="muted">Analyse en cours… (~5–10 secondes)</div>
          <div style={{ marginTop: 12, height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', width: '60%' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', borderRadius: 6, color: 'var(--accent-red)', fontSize: 13, marginBottom: 10 }}>
          ❌ {error}
          <button className="btn btn-secondary" style={{ marginLeft: 12, fontSize: 12 }} onClick={run}>Réessayer</button>
        </div>
      )}

      {analysis && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: 16, background: 'var(--surface2)', borderRadius: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: analysis.score >= 70 ? 'var(--accent-green)' : analysis.score >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                {analysis.score}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>Score /100</div>
            </div>
            <div style={{ flex: 1, fontSize: 14, fontStyle: 'italic' }}>"{analysis.verdict}"</div>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={run}>
              🔄 Relancer
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {analysis.suggestions.map((s, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, borderLeft: `4px solid ${IMPACT_COLOR[s.impact] ?? 'var(--border)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{s.titre}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: IMPACT_COLOR[s.impact] + '22', color: IMPACT_COLOR[s.impact] }}>
                    Impact {s.impact}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  ⚠ {s.probleme}
                </div>
                <div style={{ fontSize: 12, padding: '6px 10px', background: 'rgba(88,166,255,0.08)', borderRadius: 4 }}>
                  → {s.action}
                </div>
              </div>
            ))}
          </div>

          {/* Create optimized profile */}
          {!saved ? (
            <div style={{ padding: 14, background: 'rgba(88,166,255,0.05)', borderRadius: 8, border: '1px solid rgba(88,166,255,0.2)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>
                ➕ Créer un profil optimisé basé sur cette analyse
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="Nom du profil…"
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.3)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ whiteSpace: 'nowrap', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', borderColor: '#3b82f6' }}
                  onClick={createProfile}
                  disabled={saving || !profileName.trim()}
                >
                  {saving ? 'Création…' : '✓ Créer le profil'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 12, background: 'rgba(63,185,80,0.1)', borderRadius: 8, border: '1px solid rgba(63,185,80,0.3)', color: 'var(--accent-green)', fontSize: 13 }}>
              ✅ Profil <strong>"{saved}"</strong> créé avec succès — visible dans la page Stratégie.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function _nextVersion(name: string): string {
  const m = name.match(/-v(\d+)$/i);
  if (m) return name.slice(0, m.index) + `-v${Number(m[1]) + 1}`;
  return name + '-v2';
}

type MultiAnalysis = {
  score: number;
  verdict: string;
  synthesis: string;
  strengths: Array<{ backtest_id: number; point: string }>;
  weaknesses: Array<{ backtest_id: number; point: string }>;
  suggested_name: string;
  suggested_params: Record<string, unknown>;
  param_insights: Array<{ param: string; from: string; to: string; reason: string }>;
};

const PARAM_LABELS: Record<string, string> = {
  enable_spring: 'Spring Wyckoff',
  enable_utad: 'UTAD (distribution)',
  bos_sensitivity: 'Sensibilité BOS (1-10)',
  displacement_threshold: 'Seuil Displacement',
  fib_levels: 'Niveaux Fibonacci',
  rsi_period: 'Période RSI',
  rsi_overbought: 'RSI Surachat',
  rsi_oversold: 'RSI Survente',
  volume_confirmation: 'Confirmation Volume',
  volume_multiplier: 'Multiplicateur Volume',
  risk_per_trade: 'Risque par trade',
  max_open_trades: 'Trades max simultanés',
  stop_loss_atr_mult: 'SL Multiplicateur ATR',
  take_profit_rr: 'TP Ratio R:R',
};

function MultiOptimizePanel({
  backtestIds,
  rows,
  onClose,
  onProfileCreated,
}: {
  backtestIds: number[];
  rows: BacktestResult[];
  onClose: () => void;
  onProfileCreated: () => void;
}) {
  const [loading, setLoading]     = useState(false);
  const [analysis, setAnalysis]   = useState<MultiAnalysis | null>(null);
  const [error, setError]         = useState('');
  const [profileName, setProfileName] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState<string | null>(null);

  const selectedRows = rows.filter(r => backtestIds.includes(r.id));

  const run = async () => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    setSaved(null);
    try {
      const res = await api.multiOptimize(backtestIds);
      if (res.ok) {
        const a = res.analysis as MultiAnalysis;
        setAnalysis(a);
        setProfileName(a.suggested_name ?? `IA-Optimised-v${Date.now().toString().slice(-4)}`);
      } else {
        setError(String(res.reason ?? 'Erreur inconnue'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async () => {
    if (!analysis || !profileName.trim()) return;
    setSaving(true);
    try {
      const res = await api.saveStrategyProfile({
        name: profileName.trim(),
        mode: 'research',
        parameters: analysis.suggested_params,
      });
      if (res.ok) {
        setSaved(profileName.trim());
        onProfileCreated();
      } else {
        setError(String(res.reason ?? 'Erreur lors de la création'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{
      marginTop: 16,
      border: '1px solid rgba(139,92,246,0.4)',
      background: 'linear-gradient(135deg, rgba(139,92,246,0.04) 0%, var(--surface) 100%)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, color: '#a78bfa' }}>🧠 Création de stratégie optimisée par IA</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            L'IA compare {backtestIds.length} backtests, identifie les patterns gagnants et génère une stratégie synthétisée prête à l'emploi.
          </div>
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>✕ Fermer</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {selectedRows.map(r => (
          <div key={r.id} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 12,
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
          }}>
            <strong>#{r.id}</strong> {fmtSym(r.symbol)} {r.timeframe}
            <span style={{ marginLeft: 6, color: r.win_rate >= 0.5 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              WR {pct(r.win_rate)}
            </span>
            <span style={{ marginLeft: 6, color: r.profit_factor >= 1.2 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
              PF {num(r.profit_factor)}
            </span>
          </div>
        ))}
      </div>

      {!analysis && !loading && (
        <button
          className="btn btn-primary"
          onClick={run}
          style={{ width: '100%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', borderColor: '#7c3aed', fontSize: 14, padding: '12px 0' }}
        >
          🧠 Analyser et créer une stratégie optimisée
        </button>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Analyse comparative en cours…</div>
          <div className="muted" style={{ fontSize: 13 }}>L'IA compare les {backtestIds.length} backtests et synthétise la meilleure stratégie (~10–20 secondes)</div>
          <div style={{ marginTop: 16, height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg, #7c3aed, #4f46e5)',
              animation: 'pulse 1.8s ease-in-out infinite', width: '65%',
            }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'rgba(248,81,73,0.1)', borderRadius: 6, color: 'var(--accent-red)', fontSize: 13, marginTop: 8 }}>
          ❌ {error}
          <button className="btn btn-secondary" style={{ marginLeft: 12, fontSize: 12 }} onClick={run}>Réessayer</button>
        </div>
      )}

      {analysis && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
            padding: 20, background: 'rgba(139,92,246,0.08)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.2)',
          }}>
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              <div style={{
                fontSize: 44, fontWeight: 900,
                color: analysis.score >= 70 ? 'var(--accent-green)' : analysis.score >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)',
              }}>
                {analysis.score}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>Score /100</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: '#a78bfa' }}>
                {analysis.verdict}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                {analysis.synthesis}
              </div>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 11, alignSelf: 'flex-start' }} onClick={run}>
              🔄 Relancer
            </button>
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-green)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ✅ Points forts identifiés
              </div>
              {analysis.strengths?.map((s, i) => (
                <div key={i} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 6, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', fontSize: 12 }}>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>#{s.backtest_id}</span>
                  <span style={{ marginLeft: 6 }}>{s.point}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent-red)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ⚠ Faiblesses corrigées
              </div>
              {analysis.weaknesses?.map((w, i) => (
                <div key={i} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 6, background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)', fontSize: 12 }}>
                  <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>#{w.backtest_id}</span>
                  <span style={{ marginLeft: 6 }}>{w.point}</span>
                </div>
              ))}
            </div>
          </div>

          {analysis.param_insights && analysis.param_insights.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🔧 Ajustements de paramètres
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {analysis.param_insights.map((ins, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 6, background: 'var(--surface2)', fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 700, minWidth: 150, color: 'var(--text)' }}>
                      {PARAM_LABELS[ins.param] ?? ins.param}
                    </span>
                    <span style={{ color: 'var(--accent-red)', textDecoration: 'line-through' }}>{ins.from}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{ins.to}</span>
                    <span style={{ color: 'var(--text-muted)', flex: 1, fontStyle: 'italic' }}>{ins.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{
            padding: 20, borderRadius: 10,
            background: 'rgba(139,92,246,0.06)', border: '2px solid rgba(139,92,246,0.3)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#a78bfa' }}>
              ✨ Stratégie optimisée générée — Paramètres proposés
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 16 }}>
              {Object.entries(analysis.suggested_params).map(([key, val]) => (
                <div key={key} style={{ padding: '8px 10px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    {PARAM_LABELS[key] ?? key}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#a78bfa' }}>
                    {Array.isArray(val) ? (val as number[]).join(', ') : String(val)}
                  </div>
                </div>
              ))}
            </div>

            {saved ? (
              <div style={{ padding: 14, borderRadius: 8, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--accent-green)', fontSize: 15, marginBottom: 4 }}>
                  ✅ Profil "{saved}" créé avec succès !
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Retrouvez-le dans la page Stratégie pour le tester et le backtester.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="Nom du profil…"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(139,92,246,0.4)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={createProfile}
                  disabled={saving || !profileName.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    borderColor: '#7c3aed', whiteSpace: 'nowrap', padding: '10px 20px',
                  }}
                >
                  {saving ? 'Création…' : '✅ Créer ce profil de stratégie'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Types ───────────────────────────────────────────────────────────────────
type WorkshopSymbolResult = {
  symbol: string;
  status: 'pending' | 'running' | 'done' | 'error';
  ai_score?: number;
  verdict?: string;
  synthesis?: string;
  suggestions?: Array<{ titre: string; probleme: string; action: string; impact: 'haut' | 'moyen' | 'faible' }>;
  profile?: { id: number; name: string; params: Record<string, unknown> };
  win_rate?: number;
  profit_factor?: number;
  drawdown?: number;
  expectancy?: number;
  r_multiple?: number;
  n_trades?: number;
  error?: string;
};

type WorkshopJob = {
  ok: boolean;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  current: string | null;
  results: WorkshopSymbolResult[];
  error?: string;
};

// ── AI Workshop Panel ────────────────────────────────────────────────────────
function AiWorkshopPanel({
  availableSymbols,
  profiles,
  onClose,
  onProfilesCreated,
}: {
  availableSymbols: string[];
  profiles: Array<Record<string, unknown>>;
  onClose: () => void;
  onProfilesCreated: () => void;
}) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(
    availableSymbols.slice(0, 5)
  );
  const [timeframe, setTimeframe] = useState('4h');
  const [horizon, setHorizon]     = useState(1460);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<WorkshopJob | null>(null);
  const [starting, setStarting]   = useState(false);
  const [error, setError]         = useState('');
  const [expandedSym, setExpandedSym] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleSym = (s: string) =>
    setSelectedSymbols(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );

  const startWorkshop = async () => {
    if (!selectedSymbols.length) return;
    setStarting(true);
    setError('');
    setJob(null);
    try {
      const res = await api.startAiWorkshop({
        symbols: selectedSymbols,
        timeframe,
        horizon_days: horizon,
        profile_id: profileId,
      }) as Record<string, unknown>;
      if (res.ok) {
        setJobId(String(res.job_id));
      } else {
        setError(String(res.reason ?? 'Erreur démarrage'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getAiWorkshopStatus(jobId) as WorkshopJob;
        setJob(status);
        if (status.status === 'done' || status.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (status.status === 'done') onProfilesCreated();
        }
      } catch (_) {}
    }, 900);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const doneResults = job?.results.filter(r => r.status === 'done') ?? [];
  const avgScore    = doneResults.length ? Math.round(doneResults.reduce((s, r) => s + (r.ai_score ?? 0), 0) / doneResults.length) : 0;
  const progress    = job ? Math.round((job.done / Math.max(job.total, 1)) * 100) : 0;
  const isDone      = job?.status === 'done';

  return (
    <div className="card" style={{
      marginTop: 20,
      border: '1px solid rgba(139,92,246,0.5)',
      background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(79,70,229,0.04) 50%, var(--surface) 100%)',
      boxShadow: '0 0 40px rgba(139,92,246,0.08)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, color: '#c4b5fd', fontSize: 18 }}>
            🧬 AI Workshop — Profils par crypto
          </h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            L'IA backteste chaque crypto séparément, analyse les spécificités et génère un profil de stratégie sur-mesure.
          </div>
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>✕ Fermer</button>
      </div>

      {/* Config (only before starting) */}
      {!jobId && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>
              CRYPTOS À ANALYSER ({selectedSymbols.length} sélectionnées)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableSymbols.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSym(s)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    border: selectedSymbols.includes(s)
                      ? '1px solid rgba(139,92,246,0.8)'
                      : '1px solid var(--border)',
                    background: selectedSymbols.includes(s)
                      ? 'rgba(139,92,246,0.18)'
                      : 'var(--surface2)',
                    color: selectedSymbols.includes(s) ? '#c4b5fd' : 'var(--text-muted)',
                    fontWeight: selectedSymbols.includes(s) ? 700 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {fmtSym(s)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label style={{ fontSize: 11 }}>Timeframe</label>
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={{ fontSize: 13 }}>
                {TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label style={{ fontSize: 11 }}>Horizon (jours)</label>
              <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} style={{ fontSize: 13 }}>
                <option value={365}>1 an (365j)</option>
                <option value={730}>2 ans (730j)</option>
                <option value={1095}>3 ans (1095j)</option>
                <option value={1460}>4 ans (1460j)</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label style={{ fontSize: 11 }}>Profil de base</label>
              <select value={profileId ?? ''} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)} style={{ fontSize: 13 }}>
                <option value="">SMC-Wyckoff-Optimisé (défaut)</option>
                {profiles.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--accent-red)', fontSize: 13 }}>
              ❌ {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={startWorkshop}
            disabled={starting || selectedSymbols.length === 0}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              borderColor: '#7c3aed',
              fontSize: 15, padding: '14px 0', fontWeight: 700,
            }}
          >
            {starting ? 'Démarrage…' : `🧬 Lancer l'analyse IA sur ${selectedSymbols.length} crypto${selectedSymbols.length > 1 ? 's' : ''}`}
          </button>
        </>
      )}

      {/* Progress bar */}
      {jobId && job && !isDone && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span>
              {job.current
                ? <>Analyse en cours : <strong style={{ color: '#c4b5fd' }}>{fmtSym(job.current)}</strong></>
                : 'Initialisation…'
              }
            </span>
            <span className="muted">{job.done}/{job.total}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, transition: 'width 0.6s ease',
              background: 'linear-gradient(90deg, #7c3aed, #06b6d4)',
              width: `${progress}%`,
            }} />
          </div>
        </div>
      )}

      {/* Symbol cards */}
      {jobId && job && job.results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: isDone ? 20 : 0 }}>
          {job.results.map(r => {
            const isExpanded = expandedSym === r.symbol;
            const scoreColor = (r.ai_score ?? 0) >= 80 ? 'var(--accent-green)' : (r.ai_score ?? 0) >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)';
            return (
              <div key={r.symbol} style={{
                borderRadius: 8, border: '1px solid',
                borderColor: r.status === 'done' ? 'rgba(63,185,80,0.3)' : r.status === 'error' ? 'rgba(248,81,73,0.3)' : r.status === 'running' ? 'rgba(139,92,246,0.5)' : 'var(--border)',
                background: r.status === 'done' ? 'rgba(63,185,80,0.04)' : r.status === 'running' ? 'rgba(139,92,246,0.06)' : 'var(--surface2)',
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}>
                <div
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: r.status === 'done' ? 'pointer' : 'default' }}
                  onClick={() => r.status === 'done' && setExpandedSym(isExpanded ? null : r.symbol)}
                >
                  {/* Status icon */}
                  <div style={{ fontSize: 18, flexShrink: 0 }}>
                    {r.status === 'done'    ? '✅'
                    : r.status === 'error'  ? '❌'
                    : r.status === 'running' ? <span style={{ animation: 'pulse 1s ease infinite', display: 'inline-block' }}>🔄</span>
                    : '⏳'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {fmtSym(r.symbol)}
                      {r.profile && <span className="tag" style={{ marginLeft: 8, fontSize: 10, background: 'rgba(139,92,246,0.2)', color: '#c4b5fd' }}>{r.profile.name}</span>}
                    </div>
                    {r.status === 'running' && <div className="muted" style={{ fontSize: 12 }}>Backtest + analyse IA en cours…</div>}
                    {r.status === 'pending' && <div className="muted" style={{ fontSize: 12 }}>En attente…</div>}
                    {r.status === 'done' && (
                      <div style={{ fontSize: 12, display: 'flex', gap: 12, marginTop: 2 }}>
                        <span style={{ color: (r.win_rate ?? 0) >= 0.55 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                          WR {pct(r.win_rate ?? 0)}
                        </span>
                        <span style={{ color: (r.profit_factor ?? 0) >= 2 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                          PF {num(r.profit_factor ?? 0)}
                        </span>
                        <span className="muted">DD {pct(r.drawdown ?? 0)}</span>
                        <span className="muted">{r.n_trades} trades</span>
                      </div>
                    )}
                    {r.status === 'error' && <div style={{ fontSize: 12, color: 'var(--accent-red)' }}>{r.error}</div>}
                  </div>
                  {r.status === 'done' && r.ai_score !== undefined && (
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{r.ai_score}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>/ 100</div>
                    </div>
                  )}
                  {r.status === 'done' && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && r.status === 'done' && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    {r.verdict && (
                      <div style={{ padding: '10px 14px', borderRadius: 6, background: 'var(--surface)', margin: '12px 0 10px', fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>
                        "{r.verdict}"
                      </div>
                    )}
                    {r.synthesis && (
                      <div style={{ fontSize: 12, marginBottom: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                        {r.synthesis}
                      </div>
                    )}

                    {/* Suggested params */}
                    {r.profile?.params && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Paramètres optimisés</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                          {([
                            ['Displacement', r.profile.params.displacement_threshold as number, '.2f'],
                            ['ATR min', r.profile.params.displacement_atr_min as number, '.1f×'],
                            ['BOS sens.', r.profile.params.bos_sensitivity as number, '/10'],
                            ['Vol mult.', r.profile.params.volume_multiplier_active as number, '.1f×'],
                            ['R:R target', r.profile.params.take_profit_rr as number, '.1f'],
                            ['Risk/trade', (r.profile.params.risk_per_trade as number) * 100, '.1f%'],
                          ] as [string, number, string][]).map(([label, val, fmt]) => (
                            <div key={label} style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#c4b5fd' }}>
                                {fmt.includes('f') ? Number(val ?? 0).toFixed(fmt.startsWith('.2') ? 2 : 1) : val}
                                {fmt.includes('×') ? '×' : fmt.includes('/10') ? '/10' : fmt.includes('%') ? '%' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {r.suggestions && r.suggestions.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Insights IA</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {r.suggestions.slice(0, 3).map((sg, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 6, background: 'var(--surface2)', borderLeft: `3px solid ${IMPACT_COLOR[sg.impact]}` }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 12, color: IMPACT_COLOR[sg.impact] }}>{sg.titre}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sg.action}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary when done */}
      {isDone && doneResults.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              ['Cryptos analysées', doneResults.length, '#c4b5fd'],
              ['Score IA moyen', avgScore + '/100', avgScore >= 75 ? 'var(--accent-green)' : 'var(--accent-yellow)'],
              ['WR moyen', pct(doneResults.reduce((s, r) => s + (r.win_rate ?? 0), 0) / Math.max(doneResults.length, 1)), 'var(--accent-green)'],
              ['PF moyen', num(doneResults.reduce((s, r) => s + (r.profit_factor ?? 0), 0) / Math.max(doneResults.length, 1)), 'var(--accent-green)'],
            ].map(([label, value, color]) => (
              <div key={String(label)} style={{ padding: '12px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: String(color) }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.25)', fontSize: 13, textAlign: 'center' }}>
            ✅ <strong>{doneResults.length} profil{doneResults.length > 1 ? 's' : ''}</strong> créé{doneResults.length > 1 ? 's' : ''} et disponible{doneResults.length > 1 ? 's' : ''} dans la page Stratégie.
            {job?.results.filter(r => r.status === 'error').length
              ? <span style={{ color: 'var(--accent-red)', marginLeft: 8 }}>({job.results.filter(r => r.status === 'error').length} erreur{job.results.filter(r => r.status === 'error').length > 1 ? 's' : ''})</span>
              : null}
          </div>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 12 }}
            onClick={() => { setJobId(null); setJob(null); setError(''); }}
          >
            🔁 Nouvelle analyse
          </button>
        </div>
      )}
    </div>
  );
}

export function BacktestsPage({ onNavigate }: { onNavigate?: (page: import('../types').AdminPage) => void }) {
  const { data, reload } = useApi(() => api.backtests());
  const { data: profiles, reload: reloadProfiles } = useApi(() => api.strategyProfiles());
  const { data: loadedData } = useApi(() => api.loadedSymbols());

  const loadedEntries = loadedData ?? [];
  const hasData = loadedEntries.length > 0;

  const [symbol, setSymbol]       = useState('');
  const [timeframe, setTimeframe] = useState('1h');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [report, setReport]       = useState<Record<string, unknown> | null>(null);
  const [lastResult, setLastResult] = useState<BacktestResult | null>(null);
  const [status, setStatus]       = useState('');
  const [running, setRunning]     = useState(false);
  const [compareIds, setCompareIds] = useState<[number | null, number | null]>([null, null]);
  const [optimizeTarget, setOptimizeTarget] = useState<BacktestResult | null>(null);
  const [optimizeIds, setOptimizeIds] = useState<Set<number>>(new Set());
  const [showMultiOptimize, setShowMultiOptimize] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState(false);

  // ── Derived from DB-loaded candle data ────────────────────────────────────
  const availableSymbols = useMemo(() => loadedEntries.map(e => e.symbol), [loadedEntries]);

  const availableTimeframes = useMemo(() => {
    const entry = loadedEntries.find(e => e.symbol === symbol);
    return entry ? Object.keys(entry.timeframes).sort() : ['1h'];
  }, [loadedEntries, symbol]);

  // Auto-select first symbol when data arrives
  useEffect(() => {
    if (!symbol && loadedEntries.length > 0) {
      setSymbol(loadedEntries[0].symbol);
    }
  }, [loadedEntries, symbol]);

  // Auto-adjust timeframe if current one isn't available for selected symbol
  useEffect(() => {
    if (availableTimeframes.length > 0 && !availableTimeframes.includes(timeframe)) {
      setTimeframe(availableTimeframes[0]);
    }
  }, [availableTimeframes, timeframe]);

  // ── History filters (client-side) ─────────────────────────────────────────
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterTF,     setFilterTF]     = useState('');
  const [filterMinPF,  setFilterMinPF]  = useState('');
  const [filterMinWR,  setFilterMinWR]  = useState('');

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const filteredRows = useMemo(() => rows.filter(r => {
    if (filterSymbol && r.symbol !== filterSymbol) return false;
    if (filterTF     && r.timeframe !== filterTF) return false;
    if (filterMinPF  && r.profit_factor < Number(filterMinPF)) return false;
    if (filterMinWR  && r.win_rate < Number(filterMinWR) / 100) return false;
    return true;
  }), [rows, filterSymbol, filterTF, filterMinPF, filterMinWR]);

  const { sorted: sortedHistory, Th: HistoryTh } = useSortable<BacktestResult>(filteredRows, 'id', 'desc');

  const avgPF = rows.length ? rows.reduce((s, b) => s + b.profit_factor, 0) / rows.length : 0;
  const avgWR = rows.length ? rows.reduce((s, b) => s + b.win_rate, 0) / rows.length : 0;
  const avgDD = rows.length ? rows.reduce((s, b) => s + b.drawdown, 0) / rows.length : 0;

  const historySymbols = useMemo(() => [...new Set(rows.map(r => r.symbol))].sort(), [rows]);
  const historyTFs     = useMemo(() => [...new Set(rows.map(r => r.timeframe))].sort(), [rows]);

  const runBacktest = async () => {
    setRunning(true);
    setStatus('');
    setOptimizeTarget(null);
    try {
      const res = await api.runBacktest({ symbol, timeframe, profile_id: profileId, horizon_days: 45 });
      if (res.ok) {
        setStatus('✅ Backtest terminé — rapport généré.');
        setReport(res.result as Record<string, unknown>);
        setLastResult(res.result as BacktestResult);
        reload();
      } else {
        setStatus(`❌ Erreur: ${String(res.reason)}`);
      }
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
    } finally {
      setRunning(false);
    }
  };

  const toggleCompare = (id: number) => {
    setCompareIds(prev => {
      if (prev[0] === id) return [null, prev[1]];
      if (prev[1] === id) return [prev[0], null];
      if (prev[0] === null) return [id, prev[1]];
      if (prev[1] === null) return [prev[0], id];
      return [id, prev[1]];
    });
  };

  const toggleOptimizeId = (id: number) => {
    setOptimizeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setShowMultiOptimize(false);
  };

  const compareA = rows.find(r => r.id === compareIds[0]) ?? null;
  const compareB = rows.find(r => r.id === compareIds[1]) ?? null;
  const optimizeIdList = Array.from(optimizeIds);

  return (
    <section>
      <div className="page-header-row">
        <div>
          <h2 style={{ margin: 0 }}>Backtests</h2>
          <p className="page-description">Simulation historique de votre stratégie SMC/Wyckoff</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowWorkshop(v => !v)}
          style={{
            background: showWorkshop
              ? 'rgba(139,92,246,0.2)'
              : 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            borderColor: '#7c3aed',
            fontSize: 13, padding: '8px 18px', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span>🧬</span>
          {showWorkshop ? 'Fermer le Workshop' : 'Optimiser avec IA'}
        </button>
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className={`stat-card ${avgWR >= 0.5 ? 'stat-card-accent-green' : 'stat-card-accent-red'}`}>
          <div className="stat-num" style={{ color: avgWR >= 0.5 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {(avgWR * 100).toFixed(1)}%
          </div>
          <div className="stat-lbl">
            <Tooltip text="Pourcentage de trades gagnants sur l'ensemble de tous vos backtests. Au dessus de 50% = bonne sélection. Un bon système peut être profitable avec 40% si le R/R est bon.">
              Win rate moyen
            </Tooltip>
          </div>
        </div>
        <div className={`stat-card ${avgPF >= 1.2 ? 'stat-card-accent-green' : 'stat-card-accent-yellow'}`}>
          <div className="stat-num" style={{ color: avgPF >= 1.2 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
            {avgPF.toFixed(2)}
          </div>
          <div className="stat-lbl">
            <Tooltip text="Profit Factor = gains bruts / pertes brutes. Au dessus de 1.0 = rentable. Au dessus de 1.5 = excellent. En dessous de 1.0 = perd de l'argent.">
              Profit factor moyen
            </Tooltip>
          </div>
        </div>
        <div className={`stat-card ${avgDD <= 0.1 ? 'stat-card-accent-green' : avgDD <= 0.2 ? 'stat-card-accent-yellow' : 'stat-card-accent-red'}`}>
          <div className="stat-num" style={{ color: avgDD <= 0.1 ? 'var(--accent-green)' : avgDD <= 0.2 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
            {(avgDD * 100).toFixed(1)}%
          </div>
          <div className="stat-lbl">
            <Tooltip text="Drawdown = perte maximale depuis un sommet avant de remonter. C'est la mesure du pire scénario que vous auriez vécu. Moins de 10% = excellent, 10-20% = acceptable, +20% = dangereux.">
              Drawdown moyen
            </Tooltip>
          </div>
        </div>
        <div className="stat-card stat-card-accent-blue">
          <div className="stat-num" style={{ color: 'var(--accent)' }}>{rows.length}</div>
          <div className="stat-lbl">Rapports stockés</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Lancer un backtest</h3>

          {!hasData && loadedData !== undefined && (
            <div style={{
              background: 'rgba(255,165,0,0.10)', border: '1px solid rgba(255,165,0,0.4)',
              borderRadius: 8, padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-yellow)', marginBottom: 6 }}>
                Aucune donnée chargée en base
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Charge d'abord des bougies pour au moins une crypto avant de lancer un backtest.
              </div>
              {onNavigate && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12 }}
                  onClick={() => onNavigate('Données de marché')}
                >
                  Aller charger des données →
                </button>
              )}
            </div>
          )}

          {hasData && (
            <>
              <div className="form-group">
                <label>Crypto ({availableSymbols.length} disponibles en base)</label>
                <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                  {loadedEntries.map(e => {
                    const totalCandles = e.total;
                    const tfs = Object.keys(e.timeframes).sort().join(', ');
                    return (
                      <option key={e.symbol} value={e.symbol}>
                        {fmtSym(e.symbol)} — {totalCandles.toLocaleString()} bougies ({tfs})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="form-group">
                <label>
                  <Tooltip text="Seuls les timeframes pour lesquels des données sont chargées sont affichés.">
                    Timeframe
                  </Tooltip>
                </label>
                <select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                  {availableTimeframes.map(tf => {
                    const entry = loadedEntries.find(e => e.symbol === symbol);
                    const count = entry?.timeframes[tf] ?? 0;
                    return (
                      <option key={tf} value={tf}>{tf} — {count.toLocaleString()} bougies</option>
                    );
                  })}
                </select>
              </div>
            </>
          )}

          {!hasData && loadedData === undefined && (
            <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Chargement…</div>
          )}
          <div className="form-group">
            <label>
              <Tooltip text="Le profil stratégie contient tous les paramètres de votre système (Spring, UTAD, BOS, Fib, RSI, Volume). Créez des profils dans la page Stratégie.">
                Profil stratégie
              </Tooltip>
            </label>
            <select value={profileId ?? ''} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">default-smc</option>
              {(profiles?.rows as Array<Record<string, unknown>> | undefined)?.map(p => (
                <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={runBacktest} disabled={running} style={{ width: '100%' }}>
            {running ? 'Calcul en cours…' : '▶ Lancer le backtest'}
          </button>
          {status && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: 'var(--surface2)', fontSize: 13 }}>
              {status}
            </div>
          )}

          {report && (
            <div style={{ marginTop: 16 }}>
              <h3>Résultats</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {([
                  ['Win rate',      pct(Number(report.win_rate)),      'Trades gagnants / total trades'],
                  ['Profit factor', num(Number(report.profit_factor)), 'Gains bruts / pertes brutes (>1.2 = rentable)'],
                  ['Drawdown',      pct(Number(report.drawdown)),      'Perte max depuis un sommet (moins = mieux)'],
                  ['Expectancy',    num(Number(report.expectancy), 4), 'Gain moyen par trade en unités de risque (R)'],
                  ['R multiple',    num(Number(report.r_multiple)) + 'R', 'Rendement total exprimé en multiples du risque initial'],
                  ['Stratégie',     String(report.strategy_version),  'Profil stratégie utilisé pour ce backtest'],
                ] as [string, string, string][]).map(([label, value, tip]) => (
                  <div key={label} style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
                      <Tooltip text={tip}>{label}</Tooltip>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{value}</div>
                  </div>
                ))}
              </div>
              {lastResult && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 12, borderColor: 'rgba(88,166,255,0.4)', color: 'var(--accent)' }}
                  onClick={() => setOptimizeTarget(lastResult)}
                >
                  🤖 Optimiser cette stratégie avec l'IA
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Historique des backtests</h3>
            {optimizeIds.size >= 2 && (
              <button
                className="btn btn-primary"
                style={{
                  fontSize: 12, padding: '6px 14px',
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  borderColor: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6,
                }}
                onClick={() => setShowMultiOptimize(true)}
              >
                🧠 Créer stratégie optimisée ({optimizeIds.size})
              </button>
            )}
          </div>

          {optimizeIds.size === 1 && (
            <div style={{ marginBottom: 10, padding: 8, borderRadius: 6, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 12, color: '#a78bfa' }}>
              ✦ Sélectionnez au moins 1 autre backtest dans la colonne 🧠 pour créer une stratégie optimisée
            </div>
          )}
          {compareIds[0] !== null && compareIds[1] === null && (
            <div style={{ marginBottom: 10, padding: 8, borderRadius: 6, background: 'rgba(88,166,255,0.1)', fontSize: 12 }}>
              Sélectionnez un 2e backtest dans Cmp pour comparer
            </div>
          )}

          {/* ── Filters ──────────────────────────────────────────────── */}
          {rows.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Filtres</span>
              <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, flex: 1, minWidth: 100 }}>
                <option value="">Tous les symboles</option>
                {historySymbols.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterTF} onChange={e => setFilterTF(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, minWidth: 80 }}>
                <option value="">Tous les TF</option>
                {historyTFs.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="number" placeholder="PF min" value={filterMinPF} onChange={e => setFilterMinPF(e.target.value)}
                min="0" step="0.1"
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, width: 80 }} />
              <input type="number" placeholder="WR min %" value={filterMinWR} onChange={e => setFilterMinWR(e.target.value)}
                min="0" max="100" step="1"
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, width: 80 }} />
              {(filterSymbol || filterTF || filterMinPF || filterMinWR) && (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => { setFilterSymbol(''); setFilterTF(''); setFilterMinPF(''); setFilterMinWR(''); }}>
                  ✕ Réinitialiser
                </button>
              )}
              {(filterSymbol || filterTF || filterMinPF || filterMinWR) && (
                <span className="muted" style={{ fontSize: 11 }}>{filteredRows.length}/{rows.length} résultats</span>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <Tooltip text="Cochez 2 backtests pour les comparer côte à côte">Cmp</Tooltip>
                    </th>
                    <th style={{ width: 28 }}>
                      <Tooltip text="Cochez 2+ backtests pour créer une stratégie optimisée par IA">🧠</Tooltip>
                    </th>
                    <HistoryTh col="id">#</HistoryTh>
                    <HistoryTh col="symbol">Symbole</HistoryTh>
                    <HistoryTh col="timeframe">TF</HistoryTh>
                    <HistoryTh col="win_rate"><Tooltip text="Win Rate — % de trades gagnants">WR</Tooltip></HistoryTh>
                    <HistoryTh col="profit_factor"><Tooltip text="Profit Factor — gains/pertes (>1.2 = rentable)">PF</Tooltip></HistoryTh>
                    <HistoryTh col="drawdown"><Tooltip text="Drawdown — perte maximale depuis un pic">DD</Tooltip></HistoryTh>
                    <th>IA</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map(r => {
                    const isSelected = compareIds[0] === r.id || compareIds[1] === r.id;
                    const isA = compareIds[0] === r.id;
                    const isOptimize = optimizeIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: isOptimize
                            ? 'rgba(139,92,246,0.1)'
                            : isSelected
                            ? isA ? 'rgba(88,166,255,0.15)' : 'rgba(63,185,80,0.12)'
                            : optimizeTarget?.id === r.id ? 'rgba(88,166,255,0.08)' : 'transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleCompare(r.id)}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleCompare(r.id)}
                            style={{ width: 'auto', cursor: 'pointer' }} />
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isOptimize}
                            onChange={() => toggleOptimizeId(r.id)}
                            style={{ width: 'auto', cursor: 'pointer', accentColor: '#7c3aed' }}
                          />
                        </td>
                        <td className="muted">{r.id}</td>
                        <td><strong style={{ fontSize: 12 }}>{fmtSym(r.symbol)}</strong></td>
                        <td><span className="tag">{r.timeframe}</span></td>
                        <td className={r.win_rate >= 0.5 ? 'green' : 'red'}>{pct(r.win_rate)}</td>
                        <td className={r.profit_factor >= 1.2 ? 'green' : 'yellow'}>{num(r.profit_factor)}</td>
                        <td className={r.drawdown <= 0.1 ? 'green' : r.drawdown <= 0.2 ? 'yellow' : 'red'}>{pct(r.drawdown)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 10, padding: '2px 6px', opacity: 0.8 }}
                            onClick={() => setOptimizeTarget(optimizeTarget?.id === r.id ? null : r)}
                          >
                            {optimizeTarget?.id === r.id ? '▼' : '🤖'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, opacity: 0.5 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
              <p>Aucun backtest encore — lancez votre premier à gauche.</p>
            </div>
          )}
        </div>
      </div>

      {showWorkshop && (
        <AiWorkshopPanel
          availableSymbols={availableSymbols}
          profiles={(profiles?.rows as Array<Record<string, unknown>> | undefined) ?? []}
          onClose={() => setShowWorkshop(false)}
          onProfilesCreated={() => reloadProfiles()}
        />
      )}

      {compareA && compareB && <ComparePanel a={compareA} b={compareB} />}
      {optimizeTarget && <OptimizePanel result={optimizeTarget} onClose={() => setOptimizeTarget(null)} onProfileCreated={reloadProfiles} />}

      {showMultiOptimize && optimizeIds.size >= 2 && (
        <MultiOptimizePanel
          backtestIds={optimizeIdList}
          rows={rows}
          onClose={() => setShowMultiOptimize(false)}
          onProfileCreated={() => {
            reloadProfiles();
            setOptimizeIds(new Set());
            setShowMultiOptimize(false);
          }}
        />
      )}
    </section>
  );
}
