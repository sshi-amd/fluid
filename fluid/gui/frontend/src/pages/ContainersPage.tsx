import { useState } from "react";
import { useContainers } from "../api/hooks";
import ContainerCard from "../components/ContainerCard";
import BuildQueue from "../components/BuildQueue";
import HostTerminal from "../components/HostTerminal";
import Dialog from "../components/Dialog";
import styles from "./ContainersPage.module.css";

export default function ContainersPage() {
  const { data: containers = [], isError } = useContainers();
  const [showCreate, setShowCreate] = useState(false);
  const [currentPanel, setCurrentPanel] = useState<"containers" | "host">("containers");

  

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + New Container
        </button>
        <BuildQueue />
      </div>

      {isError && (
        <div className={styles.error}>
          Cannot connect to the Fluid server. Make sure the backend is running.
        </div>
      )}

      <div className={styles.grid}>
        {containers.map((c) => (
          <ContainerCard key={c.name} container={c} />
        ))}
        {containers.length === 0 && !isError && (
          <div className={styles.empty}>
            No containers yet.{" "}
            <button
              className={styles.emptyLink}
              onClick={() => setShowCreate(true)}
            >
              Create one
            </button>{" "}
            to get started.
          </div>
        )}
      </div>

      <HostTerminal />

      {showCreate && <Dialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
