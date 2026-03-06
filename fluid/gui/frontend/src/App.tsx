import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { HomePage } from './pages/HomePage';
import { ImagesPage } from './pages/ImagesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useApp } from './context/AppContext';
import { getConfig } from './api/api';
import type { PageName } from './types';
import styles from './App.module.css';

export function App() {
  const [activePage, setActivePage] = useState<PageName>('home');
  const { setConfig, refreshContainers } = useApp();

  useEffect(() => {
    getConfig().then((cfg) => {
      setConfig(cfg);
    });
    refreshContainers();
  }, [setConfig, refreshContainers]);

  return (
    <div className={styles.app}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.main}>
        {activePage === 'home' && <HomePage />}
        {activePage === 'images' && <ImagesPage />}
        {activePage === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
