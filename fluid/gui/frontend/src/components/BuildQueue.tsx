import { useState, useCallback } from "react";
import { openCreateWs } from "../api/client";
import { useInvalidateContainers, useConfig, type CreateContainerRequest } from "../api/hooks";
import styles from "./BuildQueue.module.css";

interface BuildItem {
  id: string;
  name: string;
  displayName: string;
  phase: "queued" | "building_image" | "creating_container" | "done" | "error";
  log: string;
  error?: string;
}

let _buildSeq = 0;

export default function BuildQueue() {
  const [builds, setBuilds] = useState<Map<string, BuildItem>>(new Map());
  const [panelOpen, setPanelOpen] = useState(false);
  const invalidate = useInvalidateContainers();
  const { data: config } = useConfig();

  const updateBuild = useCallback((id: string, patch: Partial<BuildItem>) => {
    setBuilds((prev) => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  function submitCreate(req: CreateContainerRequest) {
    const buildId = `build-${++_buildSeq}`;
    const item: BuildItem = {
      id: buildId,
      name: "",
      displayName: req.name || "new container",
      phase: "queued",
      log: "",
    };
    setBuilds((prev) => new Map(prev).set(buildId, item));
    setPanelOpen(true);

    const ws = openCreateWs();

    ws.onopen = () => ws.send(JSON.stringify(req));

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      switch (msg.type) {
        case "init":
          updateBuild(buildId, {
            name: msg.name,
            displayName: msg.display_name,
          });
          break;
        case "phase":
          updateBuild(buildId, { phase: msg.phase });
          break;
        case "log":
          setBuilds((prev) => {
            const next = new Map(prev);
            const b = next.get(buildId);
            if (b) next.set(buildId, { ...b, log: b.log + msg.text });
            return next;
          });
          break;
        case "done":
          updateBuild(buildId, { phase: "done" });
          invalidate();
          break;
        case "error":
          updateBuild(buildId, { phase: "error", error: msg.message });
          break;
      }
    };

    ws.onclose = () => {
      setBuilds((prev) => {
        const b = prev.get(buildId);
        if (b && b.phase !== "done" && b.phase !== "error") {
          const next = new Map(prev);
          next.set(buildId, { ...b, phase: "error", error: "Connection closed" });
          return next;
        }
        return prev;
      });
    };
  }

  const activeBuilds = [...builds.values()].filter(
    (b) => b.phase !== "done" && b.phase !== "error"
  );
  const hasActive = activeBuilds.length > 0;

  return (
    <>
      {/* Trigger button — shown when there are active builds */}
      {hasActive && (
        <button
          className={`btn btn-ghost ${styles.trigger}`}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className={styles.spinner} />
          Building ({activeBuilds.length})
        </button>
      )}

      {/* Panel */}
      {panelOpen && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Build Queue</span>
            <button onClick={() => setPanelOpen(false)} className={styles.closeBtn}>
              ✕
            </button>
          </div>
          <div className={styles.items}>
            {[...builds.values()].map((b) => (
              <div key={b.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <span className={styles.itemName}>{b.displayName}</span>
                  <span
                    className={`${styles.phase} ${
                      b.phase === "done"
                        ? styles.done
                        : b.phase === "error"
                        ? styles.err
                        : styles.active
                    }`}
                  >
                    {PHASE_LABELS[b.phase] ?? b.phase}
                  </span>
                </div>
                {b.error && <div className={styles.error}>{b.error}</div>}
                <pre className={styles.log}>{b.log}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export submitCreate for ContainersPage to call via Dialog */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <BuildQueueContext submit={submitCreate} config={config} />
    </>
  );
}

const PHASE_LABELS: Record<BuildItem["phase"], string> = {
  queued: "Queued",
  building_image: "Building image…",
  creating_container: "Creating container…",
  done: "Done",
  error: "Error",
};

// This tiny hidden component wires the submitCreate function into
// the module-level export so Dialog can call it without prop-drilling.
// In a real app you'd use Context; this keeps the file self-contained.
type SubmitFn = (req: CreateContainerRequest) => void;

let _globalSubmit: SubmitFn | null = null;

export function submitCreate(req: CreateContainerRequest) {
  _globalSubmit?.(req);
}

function BuildQueueContext({
  submit,
  config,
}: {
  submit: SubmitFn;
  config: ReturnType<typeof useConfig>["data"];
}) {
  _globalSubmit = submit;
  void config; // config passed in for future use
  return null;
}
