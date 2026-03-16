import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  /** WebSocket URL for the PTY session. */
  wsUrl: string;
  /** Whether this panel is currently visible. Fit is re-run on visibility change. */
  active?: boolean;
}

export default function TerminalPanel({ wsUrl, active = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialise terminal + WebSocket once on mount
  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#7c3aed",
        selectionBackground: "rgba(124, 58, 237, 0.3)",
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    // Connect WebSocket
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      fit.fit();
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      } else {
        term.write(ev.data as string);
      }
    };

    ws.onclose = () => {
      term.writeln("\r\n\x1b[2m[session closed]\x1b[0m");
    };

    ws.onerror = () => {
      term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
    };

    // Forward keyboard input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Forward binary input (e.g. paste as binary)
    term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const bytes = Uint8Array.from(data, (c) => c.charCodeAt(0));
        ws.send(bytes);
      }
    });

    return () => {
      ws.close();
      term.dispose();
      wsRef.current = null;
      termRef.current = null;
      fitRef.current = null;
    };
  }, [wsUrl]); // re-create only if the WS URL changes

  // Re-fit, send resize to PTY, and grab focus when this panel becomes visible
  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      const id = setTimeout(() => {
        const fit = fitRef.current;
        const term = termRef.current;
        const ws = wsRef.current;
        if (!fit || !term) return;
        fit.fit();
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
        term.focus();
      }, 60);
      return () => clearTimeout(id);
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        padding: "4px",
        background: "var(--terminal-bg)",
      }}
    />
  );
}
