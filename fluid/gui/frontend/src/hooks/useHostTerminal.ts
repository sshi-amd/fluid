import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { wsUrl } from '../api/api';

export interface HostTab {
  id: number;
  label: string;
  term: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket;
  paneEl: HTMLDivElement | null;
}

let tabCounter = 0;

export function createHostTab(): Omit<HostTab, 'paneEl'> {
  tabCounter += 1;
  const id = tabCounter;
  const label = `Terminal ${id}`;

  const term = new Terminal({
    theme: { background: '#09090b' },
    fontSize: 12,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    cursorBlink: true,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const ws = new WebSocket(wsUrl('/ws/host'));
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    const { cols, rows } = term;
    ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      term.write(ev.data);
    } else {
      term.write(new Uint8Array(ev.data));
    }
  };

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  term.onResize(({ cols, rows }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });

  return { id, label, term, fitAddon, ws };
}

export function destroyHostTab(tab: HostTab) {
  tab.ws.close();
  tab.term.dispose();
}

export function useHostTabResizeObserver(
  tab: HostTab | null,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!tab || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => tab.fitAddon.fit());
    });
    ro.observe(containerRef.current);
    roRef.current = ro;
    return () => ro.disconnect();
  }, [tab, containerRef]);
}
