import React, { useState } from 'react';
import type { ContainerInfo } from '../../types';
import { StatusDot } from './StatusDot';
import { CardTerminal } from './CardTerminal';
import { Button } from '../shared/Button';
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu';
import { startContainer, stopContainer, removeContainer } from '../../api/api';
import { useApp } from '../../context/AppContext';
import styles from './ContainerCard.module.css';

export interface ContainerCardProps {
  container: ContainerInfo;
}

type Tab = 'claude' | 'shell';

interface MenuState {
  x: number;
  y: number;
}

export function ContainerCard({ container }: ContainerCardProps) {
  const { refreshContainers } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('claude');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const isRunning = container.status === 'running' || container.status === 'claude-active' || container.status === 'waiting';

  const claudePath = `/ws/containers/${container.name}/claude`;
  const shellPath = `/ws/containers/${container.name}/shell`;

  async function handleStart() {
    await startContainer(container.name);
    await refreshContainers();
  }

  async function handleStop() {
    await stopContainer(container.name);
    await refreshContainers();
  }

  async function handleRemove() {
    if (!confirm(`Remove container "${container.display_name}"?`)) return;
    await removeContainer(container.name);
    await refreshContainers();
  }

  function handleMenuOpen(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function openCode() {
    fetch(`/api/containers/${container.name}/code`, { method: 'POST' });
  }

  const menuItems: ContextMenuItem[] = [
    { label: 'Open VS Code', onClick: openCode },
    { label: '', separator: true, onClick: () => {} },
    { label: 'Start', onClick: handleStart },
    { label: 'Stop', onClick: handleStop },
    { label: '', separator: true, onClick: () => {} },
    { label: 'Remove', danger: true, onClick: handleRemove },
  ];

  const subtitleParts = [container.rocm_version];
  if (container.workspace) subtitleParts.push(container.workspace);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <StatusDot status={container.status} />
        <div className={styles.cardInfo}>
          <div className={styles.cardTitle}>{container.display_name}</div>
          <div className={styles.cardSubtitle}>{subtitleParts.join(' · ')}</div>
        </div>
        <span className={styles.cardStatus}>{container.status}</span>
        <button className={styles.menuBtn} onClick={handleMenuOpen}>⋮</button>
      </div>

      <div className={styles.cardTerminal}>
        {isRunning ? (
          <CardTerminal
            key={`${container.name}-${activeTab}`}
            wsPath={activeTab === 'claude' ? claudePath : shellPath}
            enabled={true}
          />
        ) : (
          <div className={styles.terminalPlaceholder}>Container is stopped</div>
        )}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.tabGroup}>
          <Button
            variant="secondary"
            className={[styles.tabBtn, activeTab === 'claude' ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('claude')}
            disabled={!isRunning}
          >
            Claude
          </Button>
          <Button
            variant="secondary"
            className={[styles.tabBtn, activeTab === 'shell' ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('shell')}
            disabled={!isRunning}
          >
            Shell
          </Button>
        </div>
        {isRunning ? (
          <Button variant="secondary" onClick={handleStop}>Stop</Button>
        ) : (
          <Button variant="secondary" onClick={handleStart}>Start</Button>
        )}
        <Button variant="secondary" onClick={openCode} disabled={!isRunning}>
          Code
        </Button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

