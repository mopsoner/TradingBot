import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import type { AdminPage } from './types';
import { BotControlPage } from './pages/BotControlPage';
import { StrategySettingsPage } from './pages/StrategySettingsPage';
import { LogsPage } from './pages/LogsPage';
import { DataManagerPage } from './pages/DataManagerPage';

export default function App() {
  const [page, setPage] = useState<AdminPage>('Live cockpit');

  const render = () => {
    switch (page) {
      case 'Live cockpit':
        return <BotControlPage />;
      case 'Strategy lab':
        return <StrategySettingsPage />;
      case 'Journal':
        return <LogsPage />;
    }
  };

  return (
    <>
      <Sidebar onSelect={setPage} selected={page} />
      <main>{render()}</main>
    </>
  );
}
