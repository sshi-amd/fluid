import { useEffect, useRef, useState } from "react";
import { useConfig, type DockerfileTemplate } from "../api/hooks";
import { submitCreate } from "./BuildQueue";
import styles from "./Dialog.module.css";

interface Props {
  onClose: () => void;
}

export default function Dialog({ onClose }: Props) {
  const { data: config, isLoading } = useConfig();
  const templates = config?.templates ?? [];
  const [form, setForm] = useState({ name: "", workspace: "" });
  const [selectedTemplate, setSelectedTemplate] =
    useState<DockerfileTemplate | null>(null);
  const [templateArgs, setTemplateArgs] = useState<Record<string, string>>({});
  const backdropRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!config || didInit.current) return;
    didInit.current = true;

    if (config.templates.length > 0) {
      selectTemplate(config.templates[0]);
    }
  }, [config]);

  function selectTemplate(template: DockerfileTemplate) {
    setSelectedTemplate(template);
    const defaults: Record<string, string> = {};
    for (const arg of template.args) {
      defaults[arg.name] = arg.default ?? "";
    }
    setTemplateArgs(defaults);
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;
    submitCreate({
      name: form.name || undefined,
      workspace: form.workspace || undefined,
      template_id: selectedTemplate.id,
      template_args: templateArgs,
    });
    onClose();
  }

  if (isLoading || !config) {
    return (
      <div className={styles.backdrop} ref={backdropRef} onClick={handleBackdrop}>
        <div className={styles.dialog} role="dialog" aria-modal>
          <div className={styles.header}>
            <h2 className={styles.title}>New Container</h2>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div className={styles.form} style={{ color: "var(--text-dim)" }}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop} ref={backdropRef} onClick={handleBackdrop}>
      <div
        className={`${styles.dialog} ${selectedTemplate ? styles.dialogWide : ""}`}
        role="dialog"
        aria-modal
      >
        <div className={styles.header}>
          <h2 className={styles.title}>New Container</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
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
            <span className={styles.label}>Template</span>
            <select
              value={selectedTemplate?.id ?? ""}
              onChange={(e) => {
                const t = templates.find((t) => t.id === e.target.value);
                if (t) selectTemplate(t);
              }}
            >
              <option value="" disabled>
                Select a template…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.description ? ` — ${t.description}` : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplate && selectedTemplate.args.length > 0 && (
            <div className={styles.argsForm}>
              <div className={styles.argsFormHeader}>
                <span className={styles.argsFormTitle}>Build Inputs</span>
                <span className={styles.argsFormCount}>
                  {selectedTemplate.args.length} configurable{" "}
                  {selectedTemplate.args.length === 1 ? "value" : "values"}
                </span>
              </div>
              <div className={styles.argsFormList}>
                {selectedTemplate.args.map((arg) => (
                  <label key={arg.name} className={styles.argField}>
                    <div className={styles.argFieldHeader}>
                      <span className={styles.argFieldName}>{arg.name}</span>
                      {!arg.default && (
                        <span className={styles.argFieldRequired}>required</span>
                      )}
                    </div>
                    {arg.description && (
                      <span className={styles.argFieldDesc}>{arg.description}</span>
                    )}
                    <input
                      type="text"
                      placeholder={arg.default || `Enter ${arg.name}`}
                      value={templateArgs[arg.name] ?? ""}
                      onChange={(e) =>
                        setTemplateArgs((prev) => ({
                          ...prev,
                          [arg.name]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedTemplate && selectedTemplate.args.length === 0 && (
            <div className={styles.noArgsMsg}>
              This template has no configurable ARGs. It will be built as-is.
            </div>
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedTemplate}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
