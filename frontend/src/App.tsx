import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { AdminPage } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { LiveTradesPage } from './pages/LiveTradesPage';
import { SignalsPage } from './pages/SignalsPage';
import { PositionsPage } from './pages/PositionsPage';
import { BacktestsPage } from './pages/BacktestsPage';
import { MarketScannerPage } from './pages/MarketScannerPage';
import { RiskSettingsPage } from './pages/RiskSettingsPage';
import { StrategySettingsPage } from './pages/StrategySettingsPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { LogsPage } from './pages/LogsPage';
import { BotControlPage } from './pages/BotControlPage';
import { DataManagerPage } from './pages/DataManagerPage';

export default function App() {
  const [page, setPage] = useState<AdminPage>('Dashboard');
  const render = () => {
    switch (page) {
      case 'Dashboard': return <DashboardPage />;
      case 'Bot control': return <BotControlPage />;
      case 'Data manager': return <DataManagerPage />;
      case 'Live trades': return <LiveTradesPage />;
      case 'Signals': return <SignalsPage />;
      case 'Positions': return <PositionsPage />;
      case 'Backtests': return <BacktestsPage />;
      case 'Market scanner': return <MarketScannerPage />;
      case 'Risk settings': return <RiskSettingsPage />;
      case 'Strategy settings': return <StrategySettingsPage />;
      case 'System settings': return <SystemSettingsPage />;
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
