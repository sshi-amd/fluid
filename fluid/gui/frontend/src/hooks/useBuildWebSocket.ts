import { useRef, useCallback } from 'react';
import type { BuildMessage } from '../types';
import { useBuildQueue } from '../context/BuildQueueContext';
import { useApp } from '../context/AppContext';

export function useBuildWebSocket() {
  const { addItem, updateItem } = useBuildQueue();
  const { refreshContainers } = useApp();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(
    (wsPath: string) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}${wsPath}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let containerName = '';
      let logLines: string[] = [];

      ws.onmessage = (ev) => {
        let msg: BuildMessage;
        try {
          msg = JSON.parse(ev.data as string) as BuildMessage;
        } catch {
          return;
        }

        if (msg.type === 'init') {
          containerName = msg.name;
          logLines = [];
          addItem({
            name: msg.name,
            display_name: msg.display_name,
            rocm_version: msg.rocm_version,
            phase: 'Starting\u2026',
            progress: 0,
            log: '',
            status: 'building',
          });
        } else if (msg.type === 'log') {
          logLines.push(msg.line);
          updateItem(containerName, { log: logLines.join('\n') });
        } else if (msg.type === 'phase') {
          updateItem(containerName, { phase: msg.phase, progress: msg.progress });
        } else if (msg.type === 'done') {
          updateItem(containerName, { status: 'done', progress: 100 });
          refreshContainers();
          ws.close();
        } else if (msg.type === 'error') {
          updateItem(containerName, { status: 'error', errorMessage: msg.message });
          ws.close();
        }
      };

      ws.onerror = () => {
        if (containerName) {
          updateItem(containerName, { status: 'error', errorMessage: 'WebSocket error' });
        }
      };
    },
    [addItem, updateItem, refreshContainers]
  );

  return { connect };
}
