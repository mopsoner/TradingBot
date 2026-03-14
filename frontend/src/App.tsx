import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { AdminPage } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { StrategySettingsPage } from './pages/StrategySettingsPage';
import { DataManagerPage } from './pages/DataManagerPage';
import { BacktestsPage } from './pages/BacktestsPage';
import { LiveTradesPage } from './pages/LiveTradesPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { SignalsPage } from './pages/SignalsPage';
import { LogsPage } from './pages/LogsPage';

export default function App() {
  const [page, setPage] = useState<AdminPage>('Dashboard');

  const render = () => {
    switch (page) {
      case 'Dashboard': return <DashboardPage />;
      case 'Strategy settings': return <StrategySettingsPage />;
      case 'Data manager': return <DataManagerPage />;
      case 'Backtests': return <BacktestsPage />;
      case 'Live trades': return <LiveTradesPage />;
      case 'Admin': return <SystemSettingsPage />;
      case 'Signals': return <SignalsPage />;
      case 'Logs': return <LogsPage />;
    }
  };

  return (
    <>
      <Sidebar onSelect={setPage} selected={page} />
      <main>{render()}</main>
    </>
  );
}
