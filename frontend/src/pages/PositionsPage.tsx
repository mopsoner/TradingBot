import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { MarginAsset } from '../services/api';
import { fmtSym } from '../utils/dateUtils';

function rateLevel(rate: number): { label: string; color: string; bg: string; blink: boolean } {
  if (rate < 1.06) return { label: 'LIQUIDATION', color: '#ff1744', bg: 'rgba(255,23,68,0.18)', blink: true };
  if (rate < 1.12) return { label: 'DANGER',      color: '#ff5252', bg: 'rgba(255,82,82,0.14)', blink: false };
  if (rate < 1.20) return { label: 'ALERTE',      color: '#ff9800', bg: 'rgba(255,152,0,0.14)', blink: false };
  if (rate < 1.50) return { label: 'PRUDENCE',    color: '#ffc107', bg: 'rgba(255,193,7,0.14)', blink: false };
  return                   { label: 'SÉCURISÉ',   color: '#4caf50', bg: 'rgba(76,175,80,0.14)', blink: false };
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    NORMAL:             { label: 'Normal',     color: 'var(--accent-green)' },
    MARGIN_CALL:        { label: 'Margin Call', color: '#ff9800' },
    FORCE_LIQUIDATION:  { label: 'Liquidation', color: '#ff1744' },
  };
  const s = map[status] ?? { label: status, color: 'var(--text-muted)' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      color: s.color, background: `${s.color}22`,
    }}>
      {s.label}
    </span>
  );
}

function LiquidateGauge({ rate }: { rate: number }) {
  const pct = Math.min(Math.max(((rate - 1.0) / 1.0) * 100, 0), 100);
  const lvl = rateLevel(rate);
  return (
    <div style={{ width: '100%', marginTop: 6 }}>
      <div style={{
        height: 6, borderRadius: 3, background: 'var(--surface2)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          height: '100%', borderRadius: 3, background: lvl.color,
          width: `${pct}%`, transition: 'width 0.4s ease',
        }} />
        <div style={{
          position: 'absolute', top: -2, left: '6%', width: 2, height: 10,
          background: '#ff5252', opacity: 0.5, borderRadius: 1,
        }} title="1.06" />
        <div style={{
          position: 'absolute', top: -2, left: '12%', width: 2, height: 10,
          background: '#ff9800', opacity: 0.5, borderRadius: 1,
        }} title="1.12" />
        <div style={{
          position: 'absolute', top: -2, left: '50%', width: 2, height: 10,
          background: '#4caf50', opacity: 0.5, borderRadius: 1,
        }} title="1.50" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
        <span>1.00</span>
        <span>1.06</span>
        <span>1.12</span>
        <span>1.50</span>
        <span>2.00+</span>
      </div>
    </div>
  );
}

function PositionCard({ asset }: { asset: MarginAsset }) {
  const pct = ((asset.currentPrice - asset.entryPrice) / asset.entryPrice) * 100;
  const lvl = rateLevel(asset.liquidateRate);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{fmtSym(asset.symbol)}</strong>
          <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{asset.side}</span>
          {statusBadge(asset.marginLevelStatus)}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={asset.unrealizedPnl >= 0 ? 'green' : 'red'} style={{ fontWeight: 700, fontSize: 15 }}>
            {asset.unrealizedPnl >= 0 ? '+' : ''}{asset.unrealizedPnl.toFixed(2)} USD
          </div>
          <div className={pct >= 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderRadius: 8, background: lvl.bg, marginBottom: 12,
        animation: lvl.blink ? 'blink-critical 1s ease-in-out infinite' : undefined,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Liquidate Rate</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: lvl.color, lineHeight: 1 }}>
            {asset.liquidateRate.toFixed(4)}
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 12,
          color: '#fff', background: lvl.color, letterSpacing: 0.5,
        }}>
          {lvl.label}
        </span>
      </div>

      <LiquidateGauge rate={asset.liquidateRate} />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        marginTop: 14, padding: '10px 0', borderTop: '1px solid var(--border)',
      }}>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Entrée</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{asset.entryPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Actuel</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{asset.currentPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Liquidation</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ff5252' }}>{asset.liquidatePrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Margin Level</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{asset.marginLevel.toFixed(2)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Emprunté</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{asset.borrowed.toFixed(2)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Intérêts</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{asset.interest.toFixed(4)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Qty</div>
          <div style={{ fontSize: 13 }}>{asset.quantity}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Notionnel</div>
          <div style={{ fontSize: 13 }}>{asset.notional.toFixed(2)} USD</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 10 }}>Margin Ratio</div>
          <div style={{ fontSize: 13 }}>{(asset.marginRatio * 100).toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

export function PositionsPage() {
  const { data: marginData, loading, error } = useApi(() => api.marginAccount());

  const assets = marginData?.assets ?? [];
  const totalPnl = assets.reduce((s, a) => s + a.unrealizedPnl, 0);
  const totalNotional = assets.reduce((s, a) => s + a.notional, 0);

  const worstRate = marginData?.worstLiquidateRate ?? 999;
  const worstLvl = rateLevel(worstRate);

  return (
    <section>
      <style>{`
        @keyframes blink-critical {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-16">
        <h2 style={{ margin: 0 }}>Positions Margin Isolé</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {marginData && <span className="tag" style={{ fontSize: 10 }}>{marginData.mode.toUpperCase()}</span>}
          {assets.length > 0 && (
            <span className={`stat-value ${totalPnl >= 0 ? 'green' : 'red'}`} style={{ fontSize: 20 }}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USD
            </span>
          )}
        </div>
      </div>

      {loading && <p className="muted">Chargement…</p>}
      {error   && <p className="red">Erreur: {error}</p>}

      {marginData && assets.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48, opacity: 0.6 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <p>Aucune position margin isolée ouverte.</p>
          <p className="muted" style={{ fontSize: 12 }}>Les positions apparaîtront ici avec leur taux de liquidation coloré.</p>
        </div>
      )}

      {assets.length > 0 && (
        <>
          <div className="grid-3 mb-16">
            <div className="card">
              <div className="stat-value">{assets.length}</div>
              <div className="stat-label">Positions ouvertes</div>
            </div>
            <div className="card">
              <div className="stat-value">{totalNotional.toFixed(0)} USD</div>
              <div className="stat-label">Notionnel total</div>
            </div>
            <div className="card">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
              }}>
                <span className="stat-value" style={{ color: worstLvl.color }}>
                  {worstRate < 100 ? worstRate.toFixed(4) : '—'}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
                  color: '#fff', background: worstLvl.color,
                }}>
                  {worstLvl.label}
                </span>
              </div>
              <div className="stat-label">Pire taux liquidation</div>
            </div>
          </div>

          <div className="card" style={{ padding: '12px 16px', marginBottom: 16, fontSize: 11 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ff1744', marginRight: 4 }} /> &lt;1.06 LIQUIDATION</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ff5252', marginRight: 4 }} /> 1.06–1.11 DANGER</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ff9800', marginRight: 4 }} /> 1.12–1.19 ALERTE</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ffc107', marginRight: 4 }} /> 1.20–1.49 PRUDENCE</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#4caf50', marginRight: 4 }} /> ≥1.50 SÉCURISÉ</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
            {assets.map((a, i) => <PositionCard key={i} asset={a} />)}
          </div>

          <div className="card" style={{ marginTop: 16, padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span className="muted">Actifs totaux: <strong>{marginData!.totalAsset.toFixed(2)} USD</strong></span>
              <span className="muted">Dette totale: <strong>{marginData!.totalDebt.toFixed(4)} USD</strong></span>
              <span className="muted">Margin Level global: <strong>{marginData!.totalMarginLevel.toFixed(2)}</strong></span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
