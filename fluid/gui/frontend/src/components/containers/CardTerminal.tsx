import React, { useRef } from 'react';
import { useContainerTerminal } from '../../hooks/useContainerTerminal';
import styles from './CardTerminal.module.css';

interface CardTerminalProps {
  wsPath: string;
  enabled: boolean;
}

export function CardTerminal({ wsPath, enabled }: CardTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  useContainerTerminal(containerRef, wsPath, enabled);

  return <div ref={containerRef} className={styles.terminal} />;
}
