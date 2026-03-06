import React, { useState, useEffect } from 'react';
import { DialogOverlay } from './DialogOverlay';
import { ComboBox } from '../shared/ComboBox';
import { Button } from '../shared/Button';
import { useApp } from '../../context/AppContext';
import { createContainer } from '../../api/api';
import { useBuildWebSocket } from '../../hooks/useBuildWebSocket';
import type { CreateContainerRequest } from '../../types';
import styles from './CreateContainerDialog.module.css';

interface CreateContainerDialogProps {
  onClose: () => void;
}

export function CreateContainerDialog({ onClose }: CreateContainerDialogProps) {
  const { config } = useApp();
  const { connect } = useBuildWebSocket();

  const [name, setName] = useState('');
  const [rocmVersion, setRocmVersion] = useState(config?.default_rocm_version ?? '');
  const [distro, setDistro] = useState(config?.default_distro ?? '');
  const [gpuFamily, setGpuFamily] = useState((config?.therock_gpu_families ?? [])[0] ?? '');
  const [releaseType, setReleaseType] = useState('nightlies');
  const [workspace, setWorkspace] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const isTherock = distro.startsWith('therock-');

  useEffect(() => {
    if (config && !rocmVersion) setRocmVersion(config.default_rocm_version);
    if (config && !distro) setDistro(config.default_distro);
  }, [config]);

  async function handleSubmit() {
    if (!rocmVersion || !distro) {
      setError('ROCm Version and Distro are required.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const req: CreateContainerRequest = {
        rocm_version: rocmVersion,
        distro,
        release_type: releaseType,
      };
      if (name.trim()) req.name = name.trim();
      if (workspace.trim()) req.workspace = workspace.trim();
      if (isTherock && gpuFamily) req.gpu_family = gpuFamily;

      const resp = await createContainer(req);
      connect(resp.ws_url);
      onClose();
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  }

  return (
    <DialogOverlay onClose={onClose}>
      <h2 className={styles.title}>Create New Container</h2>
      <p className={styles.subtitle}>Configure a new ROCm development container with Claude Code.</p>

      <label className={styles.label}>Container Name</label>
      <input
        type="text"
        className={styles.input}
        placeholder="e.g. my-project (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className={styles.label}>ROCm Version</label>
      <ComboBox
        value={rocmVersion}
        onChange={setRocmVersion}
        options={config?.rocm_versions ?? []}
        placeholder="e.g. 6.3 or type a custom version"
      />

      <label className={styles.label}>Base Distribution</label>
      <ComboBox
        value={distro}
        onChange={setDistro}
        options={config?.distros ?? []}
        placeholder="e.g. ubuntu-22.04"
      />

      {isTherock && (
        <>
          <label className={styles.label}>GPU Family</label>
          <ComboBox
            value={gpuFamily}
            onChange={setGpuFamily}
            options={config?.therock_gpu_families ?? []}
            placeholder="e.g. gfx110X-all"
          />

          <label className={styles.label}>Release Type</label>
          <ComboBox
            value={releaseType}
            onChange={setReleaseType}
            options={config?.therock_release_types ?? []}
            placeholder="nightlies"
          />
        </>
      )}

      <label className={styles.label}>Workspace Directory</label>
      <input
        type="text"
        className={styles.input}
        placeholder="Leave empty for no mount (container-only workspace)"
        value={workspace}
        onChange={(e) => setWorkspace(e.target.value)}
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={creating}>
          {creating ? 'Creating…' : 'Create Container'}
        </Button>
      </div>
    </DialogOverlay>
  );
}
