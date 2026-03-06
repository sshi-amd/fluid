import React from 'react';
import type { PageName } from '../../types';
import styles from './Sidebar.module.css';

interface SidebarProps {
  activePage: PageName;
  onNavigate: (page: PageName) => void;
}

const PAGES: { id: PageName; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'images', label: 'Images' },
  { id: 'settings', label: 'Settings' },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoDot} />
        <span className={styles.logoText}>Fluid</span>
      </div>
      <nav className={styles.nav}>
        {PAGES.map((p) => (
          <button
            key={p.id}
            className={[styles.navItem, activePage === p.id ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => onNavigate(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div className={styles.footer}>v0.1.0</div>
    </aside>
  );
}
