import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createHostTab, destroyHostTab, type HostTab } from '../../hooks/useHostTerminal';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { HostTerminalTab } from './HostTerminalTab';
import styles from './HostTerminalPanel.module.css';

export function HostTerminalPanel() {
  const [tabs, setTabs] = useState<HostTab[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null!);
  const wrapRef = useRef<HTMLDivElement>(null!);

  const fitActive = useCallback(() => {
    const active = tabs.find((t) => t.id === activeId);
    if (active) {
      requestAnimationFrame(() => active.fitAddon.fit());
    }
  }, [tabs, activeId]);

  const { onMouseDown } = useResizablePanel(panelRef, fitActive);

  function addTab() {
    const tab = createHostTab();
    const fullTab: HostTab = { ...tab, paneEl: null };
    setTabs((prev) => [...prev, fullTab]);
    setActiveId(fullTab.id);
    if (collapsed) setCollapsed(false);
  }

  function killActiveTab() {
    if (activeId === null) return;
    const tab = tabs.find((t) => t.id === activeId);
    if (tab) destroyHostTab(tab);
    const remaining = tabs.filter((t) => t.id !== activeId);
    setTabs(remaining);
    setActiveId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
  }

  function closeTab(id: number) {
    const tab = tabs.find((t) => t.id === id);
    if (tab) destroyHostTab(tab);
    const remaining = tabs.filter((t) => t.id !== id);
    setTabs(remaining);
    if (activeId === id) {
      setActiveId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  }

  // Auto-open first tab
  useEffect(() => {
    if (tabs.length === 0) addTab();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit when switching tabs
  useEffect(() => {
    fitActive();
  }, [activeId, fitActive]);

  return (
    <div
      ref={panelRef}
      className={[styles.panel, collapsed ? styles.collapsed : ''].filter(Boolean).join(' ')}
      style={{ height: '220px' }}
    >
      {!collapsed && (
        <div className={styles.drag} onMouseDown={onMouseDown} />
      )}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft} onClick={() => setCollapsed((c) => !c)}>
          <span className={[styles.chevron, collapsed ? styles.chevronCollapsed : ''].filter(Boolean).join(' ')}>▾</span>
          <span className={styles.title}>Terminal</span>
        </div>
        <div className={styles.tabStrip}>
          {tabs.map((tab) => (
            <HostTerminalTab
              key={tab.id}
              label={tab.label}
              active={tab.id === activeId}
              onSelect={() => setActiveId(tab.id)}
              onClose={() => closeTab(tab.id)}
            />
          ))}
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.addBtn} onClick={addTab} title="New Terminal">+</button>
          <button className={styles.killBtn} onClick={killActiveTab} title="Kill Terminal">✕</button>
        </div>
      </div>
      {!collapsed && (
        <div ref={wrapRef} className={styles.wrap}>
          {tabs.map((tab) => (
            <HostPane
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HostPane({ tab, active }: { tab: HostTab; active: boolean }) {
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paneRef.current) return;
    if (!paneRef.current.contains(tab.term.element ?? null)) {
      tab.term.open(paneRef.current);
      tab.fitAddon.fit();
    }
  }, [tab]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => tab.fitAddon.fit());
    }
  }, [active, tab]);

  useEffect(() => {
    if (!paneRef.current) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => tab.fitAddon.fit());
    });
    ro.observe(paneRef.current);
    return () => ro.disconnect();
  }, [tab]);

  return (
    <div
      ref={paneRef}
      className={[styles.pane, active ? styles.paneActive : ''].filter(Boolean).join(' ')}
    />
  );
}
