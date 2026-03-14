import { useState, useRef, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { BacktestResult } from '../services/api';
import { useSortable } from '../hooks/useSortable';
import { fmtSym } from '../utils/dateUtils';

function pct(n: number) { return (n * 100).toFixed(1) + '%'; }
function num(n: number, d = 2) { return n.toFixed(d); }

const IMPACT_COLOR = {
  haut:   'var(--accent-red)',
  moyen:  'var(--accent-yellow)',
  faible: 'var(--accent-green)',
} as const;

type Suggestion = { titre: string; probleme: string; action: string; impact: 'haut' | 'moyen' | 'faible' };
type SingleAnalysis = {
  score: number;
  verdict: string;
  suggested_name?: string;
  suggested_params?: Record<string, unknown>;
  suggestions: Suggestion[];
};

type WorkshopSuggestion = {
  titre: string;
  probleme: string;
  action: string;
  impact: 'haut' | 'moyen' | 'faible';
};

type WorkshopEntry = {
  symbol: string;
  status: 'running' | 'done' | 'error';
  ai_score: number | null;
  verdict?: string;
  synthesis?: string;
  suggestions?: WorkshopSuggestion[];
  profile?: { id: number; name: string };
  win_rate?: number;
  profit_factor?: number;
  drawdown?: number;
  error?: string | null;
};

type WorkshopStatus = {
  ok: boolean;
  reason?: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  current: string | null;
  results: WorkshopEntry[];
  error: string | null;
};

const TF_OPTIONS = ['15m', '1h', '4h'];

// ── Single backtest analyze panel ─────────────────────────────────────────────
function SingleAnalyzePanel({ rows }: { rows: BacktestResult[] }) {
  const { sorted, Th } = useSortable<BacktestResult>(rows, 'profit_factor', 'desc');
  const [selected, setSelected] = useState<BacktestResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [analysis, setAnalysis] = useState<SingleAnalysis | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileSrcName, setProfileSrcName] = useState('');
  const [error, setError]       = useState('');
  const [profileName, setProfileName] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState('');

  const analyze = async (bt: BacktestResult) => {
    setSelected(bt);
    setAnalysis(null);
    setError('');
    setSaved('');
    setLoading(true);
    try {
      const res = await api.optimizeBacktest(bt.id);
      if (res.ok) {
        const a = res.analysis as SingleAnalysis;
        setAnalysis(a);
        setProfileId(typeof res.profile_id === 'number' ? res.profile_id : null);
        setProfileSrcName(String(res.profile_name ?? bt.strategy_version ?? ''));
        setProfileName(a.suggested_name ?? _nextVer(String(res.profile_name ?? bt.strategy_version)));
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
      let res: Record<string, unknown>;
      if (profileId && analysis.suggested_params) {
        res = await api.createOptimizedProfile(profileId, {
          source_profile_id: profileId,
          suggested_params: analysis.suggested_params,
          new_name: profileName.trim(),
        });
      } else {
        res = await api.saveStrategyProfile({
          name: profileName.trim(),
          mode: 'research',
          parameters: analysis.suggested_params ?? {},
        });
      }
      if (res.ok) setSaved(profileName.trim());
      else setError(String(res.reason ?? 'Erreur'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔬</div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Aucun backtest disponible</div>
        <div className="muted" style={{ fontSize: 13 }}>Lancez d'abord des backtests depuis la page Backtests.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      {/* Left — backtest list */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
          Sélectionnez un backtest à analyser
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <Th col="id">#</Th>
                <Th col="symbol">Crypto</Th>
                <Th col="timeframe">TF</Th>
                <Th col="win_rate">WR</Th>
                <Th col="profit_factor">PF</Th>
                <Th col="drawdown">DD</Th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}
                  style={{
                    background: selected?.id === r.id ? 'rgba(88,166,255,0.1)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => analyze(r)}
                >
                  <td className="muted">{r.id}</td>
                  <td><strong style={{ fontSize: 12 }}>{fmtSym(r.symbol)}</strong></td>
                  <td><span className="tag">{r.timeframe}</span></td>
                  <td className={r.win_rate >= 0.5 ? 'green' : 'red'}>{pct(r.win_rate)}</td>
                  <td className={r.profit_factor >= 1.2 ? 'green' : 'yellow'}>{num(r.profit_factor)}</td>
                  <td className={r.drawdown <= 0.1 ? 'green' : r.drawdown <= 0.2 ? 'yellow' : 'red'}>{pct(r.drawdown)}</td>
                  <td>
                    <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={e => { e.stopPropagation(); analyze(r); }}>
                      {selected?.id === r.id && loading ? '🤖…' : '🤖 Analyser'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right — analysis */}
      <div>
        {!selected && !loading && (
          <div className="card" style={{ textAlign: 'center', padding: 48, opacity: 0.5 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
            <div>Sélectionnez un backtest pour lancer l'analyse IA</div>
          </div>
        )}

        {loading && (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }}>🤖</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Analyse IA en cours…</div>
            <div className="muted" style={{ fontSize: 12 }}>GPT analyse les métriques et paramètres de votre stratégie</div>
            <div style={{ marginTop: 16, height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', width: '60%' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="card" style={{ borderColor: 'var(--accent-red)' }}>
            <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 10 }}>❌ {error}</div>
            {selected && (
              <button className="btn btn-secondary" onClick={() => analyze(selected)}>Réessayer</button>
            )}
          </div>
        )}

        {analysis && selected && !loading && (
          <div className="card" style={{ border: '1px solid rgba(88,166,255,0.25)' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, padding: 14, background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 40, fontWeight: 900, color: analysis.score >= 70 ? 'var(--accent-green)' : analysis.score >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                  {analysis.score}
                </div>
                <div className="muted" style={{ fontSize: 10 }}>/100</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  #{selected.id} · {fmtSym(selected.symbol)} {selected.timeframe}
                  {profileSrcName && <span className="tag" style={{ marginLeft: 8 }}>{profileSrcName}</span>}
                </div>
                <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' }}>"{analysis.verdict}"</div>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => analyze(selected)}>
                🔄
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {analysis.suggestions.map((s, i) => (
                <div key={i} style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: 7, borderLeft: `3px solid ${IMPACT_COLOR[s.impact] ?? 'var(--border)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{s.titre}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: IMPACT_COLOR[s.impact] + '22', color: IMPACT_COLOR[s.impact] }}>
                      {s.impact}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>⚠ {s.probleme}</div>
                  <div style={{ fontSize: 11, color: 'var(--text)', background: 'rgba(88,166,255,0.06)', padding: '4px 8px', borderRadius: 4 }}>→ {s.action}</div>
                </div>
              ))}
            </div>

            {!saved ? (
              <div style={{ padding: 12, background: 'rgba(88,166,255,0.04)', borderRadius: 8, border: '1px solid rgba(88,166,255,0.18)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--accent)' }}>➕ Créer un profil optimisé</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={profileName} onChange={e => setProfileName(e.target.value)}
                    placeholder="Nom du profil…"
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.3)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }} />
                  <button className="btn btn-primary"
                    style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                    disabled={saving || !profileName.trim()}
                    onClick={createProfile}>
                    {saving ? 'Création…' : '✓ Créer'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 10, background: 'rgba(63,185,80,0.1)', borderRadius: 7, border: '1px solid rgba(63,185,80,0.3)', fontSize: 12, color: 'var(--accent-green)' }}>
                ✅ Profil <strong>"{saved}"</strong> créé — disponible dans la page Stratégie.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-crypto workshop panel ───────────────────────────────────────────────
function WorkshopPanel({ profiles }: { profiles: Array<Record<string, unknown>> }) {
  const { data: byQuote } = useApi(() => api.symbolsByQuote());
  const [quote, setQuote]       = useState('USDT');
  const quotes                  = Object.keys(byQuote ?? { USDT: [] });
  const universe                = (byQuote ?? {})[quote] ?? [];
  const [symbols, setSymbols]   = useState<string[]>([]);
  const [timeframe, setTf]      = useState('1h');
  const [days, setDays]         = useState(30);
  const [profileId, setProfileId] = useState<string>('');
  const [jobId, setJobId]       = useState('');
  const [wsStatus, setWsStatus] = useState<WorkshopStatus | null>(null);
  const progress = wsStatus ? Math.round((wsStatus.done / Math.max(wsStatus.total, 1)) * 100) : 0;
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState('');
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleSymbol = (s: string) =>
    setSymbols(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const start = async () => {
    if (symbols.length === 0) { setError('Sélectionnez au moins 1 crypto.'); return; }
    setError('');
    setRunning(true);
    setWsStatus(null);
    try {
      const res = await api.startAiWorkshop({
        symbols,
        timeframe,
        horizon_days: days,
        profile_id: profileId ? Number(profileId) : null,
      });
      if (res.ok && res.job_id) {
        setJobId(String(res.job_id));
      } else {
        setError(String(res.reason ?? 'Impossible de démarrer le workshop'));
        setRunning(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const st = await api.getAiWorkshopStatus(jobId) as WorkshopStatus;
        if (!st.ok && st.reason) {
          setError(String(st.reason));
          setRunning(false);
          clearInterval(pollRef.current!);
          return;
        }
        setWsStatus(st);
        if (st.status === 'done' || st.status === 'error') {
          setRunning(false);
          clearInterval(pollRef.current!);
        }
      } catch { clearInterval(pollRef.current!); setRunning(false); }
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Config */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Configuration du Workshop</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Timeframe</label>
            <select value={timeframe} onChange={e => setTf(e.target.value)}>
              {TF_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Horizon (jours)</label>
            <input type="number" min="7" max="365" value={days} onChange={e => setDays(Number(e.target.value))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Profil de base (optionnel)</label>
            <select value={profileId} onChange={e => setProfileId(e.target.value)}>
              <option value="">— Aucun —</option>
              {profiles.map(p => (
                <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {quotes.map(q => (
              <button key={q} onClick={() => { setQuote(q); setSymbols([]); }}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${quote === q ? 'var(--accent)' : 'var(--border)'}`,
                  background: quote === q ? 'rgba(88,166,255,0.15)' : 'var(--surface2)',
                  color: quote === q ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
                }}>{q}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>
            Cryptos analysées ({symbols.length} sélectionnées sur {universe.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {universe.map(s => {
              const on = symbols.includes(s);
              return (
                <button key={s} onClick={() => toggleSymbol(s)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    background: on ? 'rgba(88,166,255,0.15)' : 'var(--surface)',
                    color: on ? 'var(--accent)' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}>
                  {fmtSym(s)}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div style={{ padding: 10, background: 'rgba(248,81,73,0.1)', borderRadius: 6, color: 'var(--accent-red)', fontSize: 13, marginBottom: 10 }}>
            ❌ {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{
            width: '100%', fontSize: 15, padding: '13px 0',
            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
            borderColor: '#7c3aed',
          }}
          onClick={start}
          disabled={running || symbols.length === 0}
        >
          {running ? '🤖 Workshop en cours…' : '🚀 Lancer le Workshop IA'}
        </button>
      </div>

      {/* Progress */}
      {(running || wsStatus) && (
        <div className="card" style={{ border: '1px solid rgba(139,92,246,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#a78bfa' }}>
              {wsStatus?.status === 'done' ? '✅ Workshop terminé' : wsStatus?.status === 'error' ? '❌ Erreur' : '🤖 Workshop en cours…'}
            </h3>
            {running && wsStatus && (
              <span className="muted" style={{ fontSize: 12 }}>
                {progress}% ({wsStatus.done}/{wsStatus.total}) · {wsStatus.current ? `Analyse ${fmtSym(wsStatus.current)}…` : ''}
              </span>
            )}
          </div>

          {running && (
            <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{
                height: '100%',
                width: `${progress || 5}%`,
                background: 'linear-gradient(90deg, #7c3aed, #4f46e5)',
                borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
          )}

          {/* Results grid */}
          {wsStatus && wsStatus.results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {wsStatus.results.map(r => {
                const isDone  = r.status === 'done';
                const score   = r.ai_score ?? null;
                const borderColor = score === null ? 'var(--border)'
                  : score >= 70 ? 'rgba(63,185,80,0.3)'
                  : score >= 50 ? 'rgba(248,166,0,0.3)'
                  : 'rgba(248,81,73,0.25)';
                return (
                  <div key={r.symbol} style={{
                    padding: 14, borderRadius: 10,
                    background: 'var(--surface2)',
                    border: `1px solid ${borderColor}`,
                    opacity: isDone ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <strong style={{ fontSize: 15 }}>{fmtSym(r.symbol)}</strong>
                        {r.profile?.name && <div className="muted" style={{ fontSize: 10, marginTop: 1 }}>{r.profile.name}</div>}
                      </div>
                      <div style={{
                        fontSize: 22, fontWeight: 900,
                        color: score === null ? 'var(--text-muted)'
                          : score >= 70 ? 'var(--accent-green)'
                          : score >= 50 ? 'var(--accent-yellow)'
                          : 'var(--accent-red)',
                      }}>
                        {isDone && score !== null ? <>{score}<span style={{ fontSize: 10, fontWeight: 400 }}>/100</span></> : '…'}
                      </div>
                    </div>

                    {isDone ? (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          {r.win_rate !== undefined && (
                            <span style={{ fontSize: 12, color: r.win_rate >= 0.5 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              WR {pct(r.win_rate)}
                            </span>
                          )}
                          {r.profit_factor !== undefined && (
                            <span style={{ fontSize: 12, color: r.profit_factor >= 1.2 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                              PF {num(r.profit_factor)}
                            </span>
                          )}
                          {r.drawdown !== undefined && (
                            <span style={{ fontSize: 12, color: r.drawdown <= 0.1 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              DD {pct(r.drawdown)}
                            </span>
                          )}
                        </div>
                        {r.verdict && (
                          <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginBottom: 6 }}>
                            "{r.verdict}"
                          </div>
                        )}
                        {(r.suggestions ?? []).slice(0, 2).map((s, i) => (
                          <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                            • {s.titre}
                          </div>
                        ))}
                      </>
                    ) : r.status === 'error' ? (
                      <div style={{ fontSize: 11, color: 'var(--accent-red)' }}>
                        ❌ {r.error ?? 'Erreur analyse'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ animation: 'pulse 1.2s ease-in-out infinite', display: 'inline-block' }}>🤖</span>
                        Analyse IA en cours…
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AiWorkshopPage() {
  const { data: backtestData } = useApi(() => api.backtests());
  const { data: profilesData } = useApi(() => api.strategyProfiles());

  const [tab, setTab] = useState<'single' | 'workshop'>('single');

  const rows: BacktestResult[] = backtestData?.rows ?? [];
  const profiles: Array<Record<string, unknown>> = (profilesData?.rows as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <section>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, marginBottom: 4 }}>Workshop IA</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          Analyse IA de vos backtests · Génération de profils optimisés · Workshop multi-crypto
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20, width: 'fit-content' }}>
        {([
          { key: 'single',   label: '🔬 Analyser un backtest' },
          { key: 'workshop', label: '🚀 Workshop multi-crypto' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: tab === t.key ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'var(--surface)',
              color: tab === t.key ? '#fff' : 'var(--text-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'single' && <SingleAnalyzePanel rows={rows} />}
      {tab === 'workshop' && <WorkshopPanel profiles={profiles} />}
    </section>
  );
}

function _nextVer(name: string): string {
  const m = name.match(/-v(\d+)$/i);
  if (m) return name.slice(0, m.index) + `-v${Number(m[1]) + 1}`;
  return name + '-v2';
}
