import React, { useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/shared/Button';
import { ContainerGrid } from '../components/containers/ContainerGrid';
import { BuildQueueSidebar } from '../components/buildQueue/BuildQueueSidebar';
import { HostTerminalPanel } from '../components/hostTerminal/HostTerminalPanel';
import { CreateContainerDialog } from '../components/dialogs/CreateContainerDialog';
import { AddExistingDialog } from '../components/dialogs/AddExistingDialog';
import { useApp } from '../context/AppContext';
import { useBuildQueue } from '../context/BuildQueueContext';
import { useContainerPoll } from '../hooks/useContainerPoll';
import styles from './HomePage.module.css';

export function HomePage() {
  const { containers, refreshContainers } = useApp();
  const { queue } = useBuildQueue();
  const [showCreate, setShowCreate] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);

  useContainerPoll();

  const buildingItems = queue.filter((i) => i.status === 'building');
  const count = containers.length;
  const subtitle = `${count} container${count !== 1 ? 's' : ''}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Containers"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={refreshContainers}>Refresh</Button>
            <Button variant="secondary" onClick={() => setShowAddExisting(true)}>Add Existing</Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Container</Button>
          </>
        }
      />
      <div className={styles.contentRow}>
        <div className={styles.content}>
          <ContainerGrid containers={containers} buildingItems={buildingItems} />
        </div>
        <BuildQueueSidebar items={queue} />
      </div>
      <HostTerminalPanel />

      {showCreate && <CreateContainerDialog onClose={() => setShowCreate(false)} />}
      {showAddExisting && <AddExistingDialog onClose={() => setShowAddExisting(false)} />}
    </div>
  );
}
