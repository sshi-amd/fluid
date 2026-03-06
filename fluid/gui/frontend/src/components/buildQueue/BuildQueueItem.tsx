import React, { useState, useEffect, useRef } from 'react';
import type { BuildQueueItem as BQItem } from '../../types';
import styles from './BuildQueueItem.module.css';

interface BuildQueueItemProps {
  item: BQItem;
}

export function BuildQueueItem({ item }: BuildQueueItemProps) {
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [item.log]);

  const spinnerClass = [
    styles.spinner,
    item.status === 'done' ? styles.done : '',
    item.status === 'error' ? styles.error : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={[styles.item, expanded ? styles.expanded : ''].filter(Boolean).join(' ')}>
      <div className={styles.itemHeader} onClick={() => setExpanded((e) => !e)}>
        <div className={spinnerClass} />
        <div className={styles.info}>
          <div className={styles.name}>{item.display_name}</div>
          <div className={styles.phase}>
            {item.status === 'error' ? item.errorMessage ?? 'Error' : item.phase}
          </div>
        </div>
        <button className={styles.toggle} type="button">▾</button>
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${item.progress}%` }} />
      </div>
      <div className={styles.log}>
        <div ref={logRef} className={styles.logInner}>
          {item.log}
        </div>
      </div>
    </div>
  );
}
