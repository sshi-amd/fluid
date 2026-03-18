import { useState } from "react";
import {
  useStartContainer,
  useStopContainer,
  useRemoveContainer,
  useOpenInEditor,
  type ContainerInfo,
} from "../api/hooks";
import { WS_BASE } from "../api/client";
import TerminalPanel from "./TerminalPanel";
import styles from "./ContainerCard.module.css";

interface Props {
  container: ContainerInfo;
}

type SessionTab = "bash" | "claude";

export default function ContainerCard({ container }: Props) {
  const [activeTab, setActiveTab] = useState<SessionTab>("bash");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [bashKey, setBashKey] = useState(0);
  const [claudeKey, setClaudeKey] = useState(0);

  const start = useStartContainer();
  const stop = useStopContainer();
  const remove = useRemoveContainer();
  const openEditor = useOpenInEditor();

  const isRunning = container.status === "running";

  function terminalWsUrl(cmd: string) {
    return `${WS_BASE}/ws/terminal/${encodeURIComponent(container.name)}?cmd=${encodeURIComponent(cmd)}`;
  }

  const statusClass =
    container.status === "running"
      ? "running"
      : container.status === "exited"
      ? "exited"
      : "created";

  return (
    <div className={`${styles.card} ${terminalOpen && isRunning ? styles.cardWithTerminal : ""}`}>
      {/* ── Card header ── */}
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span className={`status-dot ${statusClass}`} />
          <span className={styles.name}>{container.display_name}</span>
          <span className={`badge badge-${statusClass}`}>{container.status}</span>
        </div>
        <div className={styles.meta}>
          <span>ROCm {container.rocm_version}</span>
          {container.workspace && (
            <span className={styles.workspace} title={container.workspace}>
              {container.workspace.replace(/^.*\//, "…/")}
            </span>
          )}
        </div>
      </div>

      {/* ── Terminal area ── */}
      {terminalOpen && isRunning && (
        <div className={styles.terminalArea}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === "bash" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("bash")}
            >
              Shell
            </button>
            {activeTab === "bash" && (
              <button
                className={styles.restartBtn}
                onClick={() => setBashKey((k) => k + 1)}
                title="Restart shell session"
              >
                ↻
              </button>
            )}
            <button
              className={`${styles.tab} ${activeTab === "claude" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("claude")}
            >
              Claude
            </button>
            {activeTab === "claude" && (
              <button
                className={styles.restartBtn}
                onClick={() => setClaudeKey((k) => k + 1)}
                title="Restart Claude session"
              >
                ↻
              </button>
            )}
          </div>
          <div className={styles.terminalWrap}>
            {/* Keep both panels mounted but show only the active one so sessions persist */}
            <div style={{ display: activeTab === "bash" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}>
              <TerminalPanel
                key={`bash-${bashKey}`}
                wsUrl={terminalWsUrl("/bin/bash")}
                active={activeTab === "bash"}
              />
            </div>
            <div style={{ display: activeTab === "claude" ? "flex" : "none", flex: 1, minHeight: 0, minWidth: 0 }}>
              <TerminalPanel
                key={`claude-${claudeKey}`}
                wsUrl={terminalWsUrl("claude")}
                active={activeTab === "claude"}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Footer actions ── */}
      <div className={styles.footer}>
        {isRunning ? (
          <>
            <button
              className={`${styles.footerBtn} ${terminalOpen ? styles.active : ""}`}
              onClick={() => setTerminalOpen((v) => !v)}
              title="Toggle terminal"
            >
              ⌨ Terminal
            </button>
            <button
              className={styles.footerBtn}
              onClick={() => openEditor.mutate(container.name)}
              title="Open in VS Code / Cursor"
            >
              ✎ Open Editor
            </button>
            <button
              className={`${styles.footerBtn} ${styles.danger}`}
              onClick={() => stop.mutate(container.name)}
              disabled={stop.isPending}
            >
              ■ Stop
            </button>
          </>
        ) : (
          <>
            <button
              className={`${styles.footerBtn} ${styles.primary}`}
              onClick={() => start.mutate(container.name)}
              disabled={start.isPending}
            >
              ▶ Start
            </button>
            <button
              className={`${styles.footerBtn} ${styles.danger}`}
              onClick={() => {
                if (confirm(`Remove container "${container.display_name}"?`)) {
                  remove.mutate(container.name);
                }
              }}
              disabled={remove.isPending}
            >
              ✕ Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
