import { useEffect, useRef, useState } from "react";
import { useConfig } from "../api/hooks";
import { submitCreate } from "./BuildQueue";
import styles from "./Dialog.module.css";

interface Props {
  onClose: () => void;
}

export default function Dialog({ onClose }: Props) {
  const { data: config } = useConfig();
  const [form, setForm] = useState({
    name: "",
    rocm_version: "",
    distro: "",
    workspace: "",
    gpu_family: "",
    release_type: "nightlies",
  });
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Populate defaults from config
  useEffect(() => {
    if (config) {
      setForm((f) => ({
        ...f,
        rocm_version: f.rocm_version || config.default_rocm_version,
        distro: f.distro || config.default_distro,
        gpu_family: f.gpu_family || config.therock_gpu_families?.[0] || "",
      }));
    }
  }, [config]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitCreate({
      name: form.name || undefined,
      rocm_version: form.rocm_version,
      distro: form.distro,
      workspace: form.workspace || undefined,
      gpu_family: form.gpu_family || undefined,
      release_type: form.release_type,
    });
    onClose();
  }

  const isTheRock = form.distro?.startsWith("therock");

  return (
    <div className={styles.backdrop} ref={backdropRef} onClick={handleBackdrop}>
      <div className={styles.dialog} role="dialog" aria-modal>
        <div className={styles.header}>
          <h2 className={styles.title}>New Container</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Name (optional)</span>
            <input
              type="text"
              placeholder="e.g. my-dev"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Distro</span>
            <select
              value={form.distro}
              onChange={(e) => setForm({ ...form, distro: e.target.value })}
            >
              {(config?.distros ?? []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>

          {isTheRock ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>TheRock Version</span>
                <select
                  value={form.rocm_version}
                  onChange={(e) => setForm({ ...form, rocm_version: e.target.value })}
                >
                  {(config?.therock_versions ?? []).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>GPU Family</span>
                <select
                  value={form.gpu_family}
                  onChange={(e) => setForm({ ...form, gpu_family: e.target.value })}
                >
                  {(config?.therock_gpu_families ?? []).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Release Type</span>
                <select
                  value={form.release_type}
                  onChange={(e) => setForm({ ...form, release_type: e.target.value })}
                >
                  {(config?.therock_release_types ?? []).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className={styles.field}>
              <span className={styles.label}>ROCm Version</span>
              <select
                value={form.rocm_version}
                onChange={(e) => setForm({ ...form, rocm_version: e.target.value })}
              >
                {(config?.rocm_versions ?? []).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.label}>Workspace path (optional)</span>
            <input
              type="text"
              placeholder="/home/user/projects/my-repo"
              value={form.workspace}
              onChange={(e) => setForm({ ...form, workspace: e.target.value })}
            />
          </label>

          <div className={styles.actions}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
