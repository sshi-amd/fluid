import { useEffect, useRef, useState } from "react";
import { useConfig } from "../api/hooks";
import { submitCreate } from "./BuildQueue";
import styles from "./Dialog.module.css";

interface Props {
  onClose: () => void;
}

export default function Dialog({ onClose }: Props) {
  const { data: config } = useConfig();
  const [form, setForm] = useState({ name: "", distro: "", workspace: "" });
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (config) {
      setForm((f) => ({ ...f, distro: f.distro || config.default_distro }));
    }
  }, [config]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitCreate({
      name: form.name || undefined,
      distro: form.distro,
      workspace: form.workspace || undefined,
    });
    onClose();
  }

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
