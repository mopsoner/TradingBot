import { useState } from 'react';
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

export default function App() {
  const [page, setPage] = useState<AdminPage>('Tableau de bord');

  const render = () => {
    switch (page) {
      case 'Tableau de bord':   return <DashboardPage />;
      case 'Données de marché': return <DataManagerPage onNavigate={setPage} />;
      case 'Stratégie':         return <StrategySettingsPage onNavigate={setPage} />;
      case 'Backtests':         return <BacktestsPage />;
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
      <Sidebar onSelect={setPage} selected={page} />
      <main>{render()}</main>
    </>
  );
}
