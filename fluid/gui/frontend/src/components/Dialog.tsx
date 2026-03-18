import { useEffect, useRef, useState } from "react";
import { useConfig, type DockerfileTemplate } from "../api/hooks";
import { submitCreate } from "./BuildQueue";
import styles from "./Dialog.module.css";

interface Props {
  onClose: () => void;
}

type Mode = "standard" | "custom";

export default function Dialog({ onClose }: Props) {
  const { data: config } = useConfig();
  const [mode, setMode] = useState<Mode>("standard");
  const [form, setForm] = useState({
    name: "",
    rocm_version: "",
    distro: "",
    workspace: "",
    gpu_family: "",
    release_type: "nightlies",
  });
  const [selectedTemplate, setSelectedTemplate] =
    useState<DockerfileTemplate | null>(null);
  const [templateArgs, setTemplateArgs] = useState<Record<string, string>>({});
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
      setForm((f) => ({
        ...f,
        rocm_version: f.rocm_version || config.default_rocm_version,
        distro: f.distro || config.default_distro,
        gpu_family: f.gpu_family || config.therock_gpu_families?.[0] || "",
      }));
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
    if (mode === "custom" && selectedTemplate) {
      submitCreate({
        name: form.name || undefined,
        workspace: form.workspace || undefined,
        template_id: selectedTemplate.id,
        template_args: templateArgs,
      });
    } else {
      submitCreate({
        name: form.name || undefined,
        rocm_version: form.rocm_version,
        distro: form.distro,
        workspace: form.workspace || undefined,
        gpu_family: form.gpu_family || undefined,
        release_type: form.release_type,
      });
    }
    onClose();
  }

  const isTheRock = form.distro?.startsWith("therock");
  const templates = config?.templates ?? [];
  const hasTemplates = templates.length > 0;

  return (
    <div className={styles.backdrop} ref={backdropRef} onClick={handleBackdrop}>
      <div
        className={`${styles.dialog} ${mode === "custom" && selectedTemplate ? styles.dialogWide : ""}`}
        role="dialog"
        aria-modal
      >
        <div className={styles.header}>
          <h2 className={styles.title}>New Container</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {hasTemplates && (
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeTab} ${mode === "standard" ? styles.modeTabActive : ""}`}
              onClick={() => setMode("standard")}
            >
              Standard
            </button>
            <button
              className={`${styles.modeTab} ${mode === "custom" ? styles.modeTabActive : ""}`}
              onClick={() => setMode("custom")}
            >
              From Template
            </button>
          </div>
        )}

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

          {mode === "custom" ? (
            <CustomModeFields
              templates={templates}
              selected={selectedTemplate}
              onSelect={selectTemplate}
              argValues={templateArgs}
              onArgChange={(name, value) =>
                setTemplateArgs((prev) => ({ ...prev, [name]: value }))
              }
            />
          ) : (
            <StandardModeFields
              form={form}
              setForm={setForm}
              config={config}
              isTheRock={isTheRock}
            />
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
              disabled={mode === "custom" && !selectedTemplate}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StandardModeFields({
  form,
  setForm,
  config,
  isTheRock,
}: {
  form: {
    distro: string;
    rocm_version: string;
    gpu_family: string;
    release_type: string;
  };
  setForm: (f: typeof form & { name: string; workspace: string }) => void;
  config: ReturnType<typeof useConfig>["data"];
  isTheRock: boolean;
}) {
  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>Distro</span>
        <select
          value={form.distro}
          onChange={(e) =>
            setForm({ ...form, distro: e.target.value } as typeof form & {
              name: string;
              workspace: string;
            })
          }
        >
          {(config?.distros ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {isTheRock ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>TheRock Version</span>
            <select
              value={form.rocm_version}
              onChange={(e) =>
                setForm({ ...form, rocm_version: e.target.value } as typeof form & {
                  name: string;
                  workspace: string;
                })
              }
            >
              {(config?.therock_versions ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>GPU Family</span>
            <select
              value={form.gpu_family}
              onChange={(e) =>
                setForm({ ...form, gpu_family: e.target.value } as typeof form & {
                  name: string;
                  workspace: string;
                })
              }
            >
              {(config?.therock_gpu_families ?? []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Release Type</span>
            <select
              value={form.release_type}
              onChange={(e) =>
                setForm({ ...form, release_type: e.target.value } as typeof form & {
                  name: string;
                  workspace: string;
                })
              }
            >
              {(config?.therock_release_types ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <label className={styles.field}>
          <span className={styles.label}>ROCm Version</span>
          <select
            value={form.rocm_version}
            onChange={(e) =>
              setForm({ ...form, rocm_version: e.target.value } as typeof form & {
                name: string;
                workspace: string;
              })
            }
          >
            {(config?.rocm_versions ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

function CustomModeFields({
  templates,
  selected,
  onSelect,
  argValues,
  onArgChange,
}: {
  templates: DockerfileTemplate[];
  selected: DockerfileTemplate | null;
  onSelect: (t: DockerfileTemplate) => void;
  argValues: Record<string, string>;
  onArgChange: (name: string, value: string) => void;
}) {
  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>Template</span>
        <select
          value={selected?.id ?? ""}
          onChange={(e) => {
            const t = templates.find((t) => t.id === e.target.value);
            if (t) onSelect(t);
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

      {selected && selected.args.length > 0 && (
        <div className={styles.argsForm}>
          <div className={styles.argsFormHeader}>
            <span className={styles.argsFormTitle}>Build Inputs</span>
            <span className={styles.argsFormCount}>
              {selected.args.length} configurable{" "}
              {selected.args.length === 1 ? "value" : "values"}
            </span>
          </div>
          <div className={styles.argsFormList}>
            {selected.args.map((arg) => (
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
                  value={argValues[arg.name] ?? ""}
                  onChange={(e) => onArgChange(arg.name, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {selected && selected.args.length === 0 && (
        <div className={styles.noArgsMsg}>
          This template has no configurable ARGs. It will be built as-is.
        </div>
      )}
    </>
  );
}
