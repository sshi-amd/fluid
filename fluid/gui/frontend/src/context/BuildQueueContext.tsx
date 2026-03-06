import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BuildQueueItem } from '../types';

interface BuildQueueContextValue {
  queue: BuildQueueItem[];
  addItem: (item: BuildQueueItem) => void;
  updateItem: (name: string, patch: Partial<BuildQueueItem>) => void;
  removeItem: (name: string) => void;
}

const BuildQueueContext = createContext<BuildQueueContextValue | null>(null);

export function BuildQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<BuildQueueItem[]>([]);

  const addItem = useCallback((item: BuildQueueItem) => {
    setQueue((q) => [...q, item]);
  }, []);

  const updateItem = useCallback((name: string, patch: Partial<BuildQueueItem>) => {
    setQueue((q) => q.map((i) => (i.name === name ? { ...i, ...patch } : i)));
  }, []);

  const removeItem = useCallback((name: string) => {
    setQueue((q) => q.filter((i) => i.name !== name));
  }, []);

  return (
    <BuildQueueContext.Provider value={{ queue, addItem, updateItem, removeItem }}>
      {children}
    </BuildQueueContext.Provider>
  );
}

export function useBuildQueue() {
  const ctx = useContext(BuildQueueContext);
  if (!ctx) throw new Error('useBuildQueue must be used inside BuildQueueProvider');
  return ctx;
}
