import React from 'react';
import styles from './DialogOverlay.module.css';

interface DialogOverlayProps {
  onClose: () => void;
  children: React.ReactNode;
}

export function DialogOverlay({ onClose, children }: DialogOverlayProps) {
  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog}>
        {children}
      </div>
    </div>
  );
}
