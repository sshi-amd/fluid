import React from 'react';
import styles from './HostTerminalTab.module.css';

interface HostTerminalTabProps {
  label: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export function HostTerminalTab({ label, active, onSelect, onClose }: HostTerminalTabProps) {
  return (
    <button
      className={[styles.tab, active ? styles.active : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      {label}
      <span
        className={styles.close}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ✕
      </span>
    </button>
  );
}
