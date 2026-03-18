import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const WS_URL = "ws://localhost:5000/ws/terminal/fluid-rocm-examples-makefile-testing-v2?cmd=claude";

export default function TerminalTestPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current!;
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
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      fit.fit();
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    let pending: Uint8Array[] = [];
    let rafId = 0;

    function flush() {
      rafId = 0;
      if (pending.length === 0) return;
      if (pending.length === 1) {
        term.write(pending[0]);
      } else {
        const total = pending.reduce((n, c) => n + c.length, 0);
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of pending) { merged.set(c, off); off += c.length; }
        term.write(merged);
      }
      pending = [];
    }

    ws.onmessage = (ev) => {
      const chunk = ev.data instanceof ArrayBuffer
        ? new Uint8Array(ev.data)
        : new TextEncoder().encode(ev.data as string);
      pending.push(chunk);
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    ws.onclose = () => term.writeln("\r\n\x1b[2m[session closed]\x1b[0m");
    ws.onerror = () => term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
    term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Uint8Array.from(data, (c) => c.charCodeAt(0)));
      }
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#09090b",
        padding: "4px",
      }}
    />
  );
}
