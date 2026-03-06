import React from 'react';
import type { ContainerInfo, BuildQueueItem } from '../../types';
import { ContainerCard } from './ContainerCard';
import styles from './ContainerGrid.module.css';

interface ContainerGridProps {
  containers: ContainerInfo[];
  buildingItems: BuildQueueItem[];
}

export function ContainerGrid({ containers, buildingItems }: ContainerGridProps) {
  if (containers.length === 0 && buildingItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>◇</div>
        <div className={styles.emptyText}>No containers on the dashboard yet</div>
        <div className={styles.emptyHint}>Click "+ New Container" or "Add Existing" to get started.</div>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {containers.map((c) => (
        <ContainerCard key={c.name} container={c} />
      ))}
      {buildingItems.map((item) => (
        <BuildingCard key={item.name} item={item} />
      ))}
    </div>
  );
}

function BuildingCard({ item }: { item: BuildQueueItem }) {
  return (
    <div className={`${styles.card} ${styles.buildingCard}`}>
      <div className={styles.cardHeader}>
        <span className={styles.buildingDot} />
        <div className={styles.cardInfo}>
          <div className={styles.cardTitle}>{item.display_name}</div>
          <div className={styles.cardSubtitle}>{item.rocm_version}</div>
        </div>
        <span className={styles.cardStatus}>building</span>
      </div>
      <div className={styles.buildLog}>
        <pre className={styles.buildLogPre}>{item.log}</pre>
      </div>
      <div className={styles.buildFooter}>
        <div className={styles.buildPhase}>{item.phase}</div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${item.progress}%` }} />
        </div>
      </div>
    </div>
  );
}
