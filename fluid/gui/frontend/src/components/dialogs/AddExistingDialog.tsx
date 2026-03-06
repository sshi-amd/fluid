import React, { useState, useEffect } from 'react';
import { DialogOverlay } from './DialogOverlay';
import { Button } from '../shared/Button';
import { getAllContainers, addContainer } from '../../api/api';
import { useApp } from '../../context/AppContext';
import type { ContainerInfo } from '../../types';
import styles from './AddExistingDialog.module.css';

interface AddExistingDialogProps {
  onClose: () => void;
}

export function AddExistingDialog({ onClose }: AddExistingDialogProps) {
  const { containers, refreshContainers } = useApp();
  const [allContainers, setAllContainers] = useState<ContainerInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const dashboardNames = new Set(containers.map((c) => c.name));

  useEffect(() => {
    getAllContainers()
      .then((all) => {
        const notOnDashboard = all.filter((c) => !dashboardNames.has(c.name));
        setAllContainers(notOnDashboard);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSubmit() {
    setAdding(true);
    for (const name of selected) {
      await addContainer(name);
    }
    await refreshContainers();
    onClose();
  }

  return (
    <DialogOverlay onClose={onClose}>
      <h2 className={styles.title}>Add Existing Containers</h2>
      <p className={styles.subtitle}>Select Fluid containers to add to your dashboard.</p>

      <div className={styles.list}>
        {loading && <div className={styles.status}>Loading…</div>}
        {!loading && allContainers.length === 0 && (
          <div className={styles.empty}>No additional Fluid containers found.</div>
        )}
        {allContainers.map((c) => (
          <div
            key={c.name}
            className={[styles.item, selected.has(c.name) ? styles.selected : ''].filter(Boolean).join(' ')}
            onClick={() => toggle(c.name)}
          >
            <input
              type="checkbox"
              checked={selected.has(c.name)}
              onChange={() => toggle(c.name)}
              onClick={(e) => e.stopPropagation()}
            />
            <div>
              <div className={styles.itemName}>{c.display_name}</div>
              <div className={styles.itemSub}>{c.rocm_version} · {c.status}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={adding || selected.size === 0}>
          {adding ? 'Adding…' : 'Add Selected'}
        </Button>
      </div>
    </DialogOverlay>
  );
}
