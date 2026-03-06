import React from 'react';
import type { BuildQueueItem as BQItem } from '../../types';
import { BuildQueueItem } from './BuildQueueItem';
import styles from './BuildQueueSidebar.module.css';

interface BuildQueueSidebarProps {
  items: BQItem[];
}

export function BuildQueueSidebar({ items }: BuildQueueSidebarProps) {
  if (items.length === 0) return null;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>Build Queue</span>
        <span className={styles.count}>{items.length}</span>
      </div>
      <div className={styles.list}>
        {items.map((item) => (
          <BuildQueueItem key={item.name} item={item} />
        ))}
      </div>
    </aside>
  );
}
