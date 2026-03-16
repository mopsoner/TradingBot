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
  const [draft, setDraft] = useState<Cfg | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setDraft(data as Cfg); }, [data]);

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

  const sys = grp('system');
  const dat = grp('data');

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Paramètres système</h2>
          <p className="page-description" style={{ margin: '4px 0 0' }}>
            Mode d'exécution, clés API et source de données. Toute la configuration trading est dans les profils.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {status && <span style={{ fontSize: 13, color: status.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{status}</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>
            {saving ? 'Sauvegarde…' : '💾 Sauvegarder'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.15)', fontSize: 12, color: 'var(--text-muted)' }}>
        La configuration de trading (symbol, direction, risque, sessions, timeframe…) se gère désormais exclusivement dans chaque <strong>profil de stratégie</strong>. Un profil = une crypto, une direction, une configuration complète.
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
          {saving ? 'Sauvegarde…' : '💾 Sauvegarder'}
        </button>
        {status && <span style={{ fontSize: 13, color: status.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{status}</span>}
      </div>
    </section>
  );
}
