import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "../api/client";
import TerminalPanel from "./TerminalPanel";
import styles from "./HostTerminal.module.css";

interface HostTab {
  id: number;
  wsUrl: string;
}

let _tabSeq = 0;

function newTab(): HostTab {
  return { id: ++_tabSeq, wsUrl: `${WS_BASE}/ws/host-terminal` };
}

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 220;

export default function HostTerminal() {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<HostTab[]>([newTab()]);
  const [activeTab, setActiveTab] = useState<number>(tabs[0].id);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // ── Drag-to-resize ────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
  }, [height]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - e.clientY;
      const tabBarHeight = panelRef.current
        ? panelRef.current.querySelector<HTMLElement>("[data-tabbar]")?.offsetHeight ?? 40
        : 40;
      const maxHeight = window.innerHeight - tabBarHeight;
      setHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT, dragRef.current.startH + delta)));
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Tab management ────────────────────────────────────────────────────────

  function addTab() {
    const t = newTab();
    setTabs((prev) => [...prev, t]);
    setActiveTab(t.id);
  }

  function closeTab(id: number) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        setOpen(false);
        return [newTab()];
      }
      if (id === activeTab) setActiveTab(next[next.length - 1].id);
      return next;
    });
  }

  return (
    <div className={styles.host} ref={panelRef}>
      {/* ── Drag handle ── */}
      {open && (
        <div className={styles.dragHandle} onMouseDown={onMouseDown} />
      )}

      {/* ── Tab bar ── */}
      <div className={styles.tabBar} data-tabbar>
        <button
          className={`${styles.toggleBtn} ${open ? styles.active : ""}`}
          onClick={() => setOpen((v) => !v)}
          title="Toggle host terminal"
        >
          ⌨ Host Terminal
        </button>

        {open && (
          <>
            <div className={styles.tabs}>
              {tabs.map((t) => (
                <div
                  key={t.id}
                  className={`${styles.tab} ${activeTab === t.id ? styles.activeTab : ""}`}
                >
                  <button
                    className={styles.tabLabel}
                    onClick={() => setActiveTab(t.id)}
                  >
                    shell {t.id}
                  </button>
                  {tabs.length > 1 && (
                    <button
                      className={styles.tabClose}
                      onClick={() => closeTab(t.id)}
                      title="Close tab"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className={styles.addTab} onClick={addTab} title="New tab">
              +
            </button>
          </>
        )}
      </div>

      {/* ── Terminals ── */}
      {open && (
        <div className={styles.terminals} style={{ height }}>
          {tabs.map((t) => (
            <div
              key={t.id}
              style={{
                display: activeTab === t.id ? "flex" : "none",
                flex: 1,
                minHeight: 0,
              }}
            >
              <TerminalPanel wsUrl={t.wsUrl} active={activeTab === t.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
