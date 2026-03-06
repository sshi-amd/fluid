import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export function useContainerPoll(intervalMs = 3000) {
  const { refreshContainers } = useApp();
  const idRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    idRef.current = setInterval(() => {
      refreshContainers();
    }, intervalMs);
    return () => {
      if (idRef.current !== null) clearInterval(idRef.current);
    };
  }, [refreshContainers, intervalMs]);
}
