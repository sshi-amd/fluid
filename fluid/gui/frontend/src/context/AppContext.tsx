import React, { createContext, useContext, useState, useCallback } from 'react';
import type { AppConfig, ContainerInfo } from '../types';
import { getContainers } from '../api/api';

interface AppContextValue {
  config: AppConfig | null;
  setConfig: (c: AppConfig) => void;
  containers: ContainerInfo[];
  refreshContainers: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);

  const refreshContainers = useCallback(async () => {
    const list = await getContainers();
    setContainers(list);
  }, []);

  return (
    <AppContext.Provider value={{ config, setConfig, containers, refreshContainers }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
