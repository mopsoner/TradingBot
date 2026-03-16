import { useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import type { AdminPage } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { StrategySettingsPage } from './pages/StrategySettingsPage';
import { DataManagerPage } from './pages/DataManagerPage';
import { BacktestsPage } from './pages/BacktestsPage';
import { AiWorkshopPage } from './pages/AiWorkshopPage';
import { PipelinePage } from './pages/PipelinePage';
import { LiveTradesPage } from './pages/LiveTradesPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { SignalsPage } from './pages/SignalsPage';
import { LogsPage } from './pages/LogsPage';
import { JournalPage } from './pages/JournalPage';
import { PositionsPage } from './pages/PositionsPage';
import { useSignalAlert } from './hooks/useSignalAlert';
import { NotificationService } from './services/notificationService';

function readBool(key: string, fallback: boolean): boolean {
  const val = localStorage.getItem(key);
  if (val === null) return fallback;
  return val !== 'false';
}

export default function App() {
  const [page, setPage] = useState<AdminPage>('Tableau de bord');

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    readBool('alertSoundEnabled', true),
  );
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() =>
    readBool('alertNotifEnabled', false),
  );

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('alertSoundEnabled', String(next));
      return next;
    });
  }, []);

  const toggleNotif = useCallback(async () => {
    const next = !notifEnabled;
    if (next) {
      const granted = await NotificationService.requestPermission();
      if (!granted) return;
    }
    setNotifEnabled(next);
    localStorage.setItem('alertNotifEnabled', String(next));
  }, [notifEnabled]);

  const goToSignals = useCallback(() => setPage('Signaux'), []);

  useSignalAlert(soundEnabled, notifEnabled, goToSignals);

  const render = () => {
    switch (page) {
      case 'Tableau de bord':   return <DashboardPage />;
      case 'Données de marché': return <DataManagerPage onNavigate={setPage} />;
      case 'Stratégie':         return <StrategySettingsPage onNavigate={setPage} />;
      case 'Backtests':         return <BacktestsPage onNavigate={setPage} />;
      case 'Workshop IA':       return <AiWorkshopPage />;
      case 'Pipeline Live':     return <PipelinePage />;
      case 'Signaux':           return <SignalsPage />;
      case 'Trades':            return <LiveTradesPage />;
      case 'Positions':         return <PositionsPage />;
      case 'Journal Setups':    return <JournalPage />;
      case 'Journaux':          return <LogsPage />;
      case 'Paramètres':        return <SystemSettingsPage />;
    }
  };

  return (
    <>
      <Sidebar
        onSelect={setPage}
        selected={page}
        soundEnabled={soundEnabled}
        notifEnabled={notifEnabled}
        onToggleSound={toggleSound}
        onToggleNotif={toggleNotif}
      />
      <main>{render()}</main>
    </>
  );
}
