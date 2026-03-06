import React from 'react';
import styles from './StatusDot.module.css';

interface StatusDotProps {
  status: string;
}

function getStatusClass(status: string): string {
  if (status === 'running') return styles.running;
  if (status === 'claude-active') return styles.claudeActive;
  if (status === 'waiting') return styles.waiting;
  if (status === 'building') return styles.building;
  return styles.stopped;
}

export function StatusDot({ status }: StatusDotProps) {
  return <span className={[styles.dot, getStatusClass(status)].join(' ')} />;
}
