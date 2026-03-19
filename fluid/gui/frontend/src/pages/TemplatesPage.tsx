import { useCallback, useEffect, useRef, useState } from "react";
import {
  useTemplates,
  useImportTemplate,
  useDeleteTemplate,
  useUpdateTemplate,
  useTemplate,
  useParseDockerfile,
  type DockerfileTemplate,
  type ArgDefinition,
} from "../api/hooks";
import styles from "./TemplatesPage.module.css";

export default function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <button
          className="btn btn-primary"
          onClick={() => setShowImport(true)}
        >
          + Import Dockerfile
        </button>
      </div>

      <div className={styles.grid}>
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onEdit={() => setEditingId(t.id)}
            onDelete={() => {
              if (confirm(`Delete template "${t.name}"?`)) {
                deleteTemplate.mutate(t.id);
              }
            }}
          />
        ))}
        {templates.length === 0 && !isLoading && (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>No templates found</div>
            <div className={styles.emptyHint}>
              Import a Dockerfile with ARG instructions to create reusable
              container templates. ARGs become configurable inputs — like
              GitHub Actions workflow inputs.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setShowImport(true)}
            >
              Import a Dockerfile
            </button>
          </div>
        )}
      </div>

      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
      {editingId && (
        <EditDialog
          templateId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: DockerfileTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardNameRow}>
          <span className={styles.cardName}>{template.name}</span>
          {template.builtin && (
            <span className={styles.builtinBadge}>built-in</span>
          )}
        </div>
        {template.description && (
          <div className={styles.cardDesc}>{template.description}</div>
        )}
        {template.source && !template.builtin && (
          <div className={styles.cardSource}>{template.source}</div>
        )}
      </div>

      <div className={styles.argsSection}>
        <div className={styles.argsTitle}>
          Configurable Inputs ({template.args.length})
        </div>
        {template.args.length > 0 ? (
          <div className={styles.argsList}>
            {template.args.map((arg) => (
              <div key={arg.name} className={styles.argItem}>
                <span className={styles.argName}>{arg.name}</span>
                {arg.default && (
                  <span className={styles.argDefault}>= {arg.default}</span>
                )}
                {arg.description && (
                  <span className={styles.argDesc}>{arg.description}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.noArgs}>No ARG instructions found</div>
        )}
      </div>

      {!template.builtin && (
        <div className={styles.cardFooter}>
          <button className={styles.cardBtn} onClick={onEdit}>
            Edit
          </button>
          <button
            className={`${styles.cardBtn} ${styles.danger}`}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function EditDialog({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const { data: template, isLoading } = useTemplate(templateId);
  const updateTemplate = useUpdateTemplate();
  const parseDockerfile = useParseDockerfile();
  const backdropRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [parsedArgs, setParsedArgs] = useState<ArgDefinition[]>([]);
  const didInit = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (template && !didInit.current) {
      didInit.current = true;
      setName(template.name);
      setDescription(template.description ?? "");
      setContent(template.content ?? "");
      setParsedArgs(template.args);
    }
  }, [template]);

  const doParse = useCallback(
    (dockerfileContent: string) => {
      if (!dockerfileContent.trim()) {
        setParsedArgs([]);
        return;
      }
      parseDockerfile.mutate(
        { content: dockerfileContent, name: "preview" },
        { onSuccess: (data) => setParsedArgs(data.args) }
      );
    },
    [parseDockerfile]
  );

  const parseTimer = useRef<ReturnType<typeof setTimeout>>();
  function handleContentChange(value: string) {
    setContent(value);
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => doParse(value), 500);
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !name.trim()) return;
    await updateTemplate.mutateAsync({
      id: templateId,
      name,
      description: description || undefined,
      content,
    });
    onClose();
  }

  if (isLoading || !template) {
    return (
      <div className={styles.importBackdrop} ref={backdropRef} onClick={handleBackdrop}>
        <div className={styles.importDialog} role="dialog" aria-modal>
          <div className={styles.importHeader}>
            <h2 className={styles.importTitle}>Edit Template</h2>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div className={styles.importBody} style={{ color: "var(--text-dim)" }}>
            Loading…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.importBackdrop}
      ref={backdropRef}
      onClick={handleBackdrop}
    >
      <div className={styles.importDialog} role="dialog" aria-modal>
        <div className={styles.importHeader}>
          <h2 className={styles.importTitle}>Edit Template</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form className={styles.importBody} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Template Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Description (optional)</span>
            <input
              type="text"
              placeholder="What this template builds"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Dockerfile content</span>
            <textarea
              className={styles.dockerfileInput}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
              required
            />
          </label>

          {parsedArgs.length > 0 && (
            <div className={styles.previewSection}>
              <div className={styles.previewTitle}>
                Detected Inputs ({parsedArgs.length})
              </div>
              <div className={styles.previewArgList}>
                {parsedArgs.map((arg) => (
                  <div key={arg.name} className={styles.previewArg}>
                    <span className={styles.previewArgName}>{arg.name}</span>
                    <span className={styles.previewArgMeta}>
                      {arg.default ? `default: ${arg.default}` : "required"}
                      {arg.description ? ` — ${arg.description}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.importActions}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !content.trim() ||
                !name.trim() ||
                updateTemplate.isPending
              }
            >
              {updateTemplate.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const importTemplate = useImportTemplate();
  const parseDockerfile = useParseDockerfile();
  const backdropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [parsedArgs, setParsedArgs] = useState<ArgDefinition[]>([]);
  const [dragover, setDragover] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doParse = useCallback(
    (dockerfileContent: string) => {
      if (!dockerfileContent.trim()) {
        setParsedArgs([]);
        return;
      }
      parseDockerfile.mutate(
        { content: dockerfileContent, name: "preview" },
        { onSuccess: (data) => setParsedArgs(data.args) }
      );
    },
    [parseDockerfile]
  );

  const parseTimer = useRef<ReturnType<typeof setTimeout>>();
  function handleContentChange(value: string) {
    setContent(value);
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => doParse(value), 500);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setContent(text);
      if (!name) setName(file.name.replace(/\.dockerfile$/i, "").replace(/^Dockerfile\.?/i, "") || file.name);
      setSource(file.name);
      doParse(text);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !name.trim()) return;
    await importTemplate.mutateAsync({
      content,
      name,
      description: description || undefined,
      source: source || undefined,
    });
    onClose();
  }

  return (
    <div
      className={styles.importBackdrop}
      ref={backdropRef}
      onClick={handleBackdrop}
    >
      <div className={styles.importDialog} role="dialog" aria-modal>
        <div className={styles.importHeader}>
          <h2 className={styles.importTitle}>Import Dockerfile Template</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <form className={styles.importBody} onSubmit={handleSubmit}>
          <div
            className={`${styles.fileDropZone} ${dragover ? styles.fileDropZoneDragover : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragover(true);
            }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleDrop}
          >
            Drop a Dockerfile here, or click to browse
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".dockerfile,Dockerfile*,*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          <label className={styles.field}>
            <span className={styles.label}>Template Name</span>
            <input
              type="text"
              placeholder="e.g. pytorch-rocm, my-base-image"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Description (optional)</span>
            <input
              type="text"
              placeholder="What this template builds"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Dockerfile content</span>
            <textarea
              className={styles.dockerfileInput}
              placeholder={`FROM ubuntu:22.04\n\n# The ROCm version to install\nARG ROCM_VERSION=6.3\n# Python version\nARG PYTHON_VERSION=3.11\n\nRUN apt-get update && ...`}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              spellCheck={false}
              required
            />
          </label>

          {parsedArgs.length > 0 && (
            <div className={styles.previewSection}>
              <div className={styles.previewTitle}>
                Detected Inputs ({parsedArgs.length})
              </div>
              <div className={styles.previewArgList}>
                {parsedArgs.map((arg) => (
                  <div key={arg.name} className={styles.previewArg}>
                    <span className={styles.previewArgName}>{arg.name}</span>
                    <span className={styles.previewArgMeta}>
                      {arg.default ? `default: ${arg.default}` : "required"}
                      {arg.description ? ` — ${arg.description}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.importActions}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                !content.trim() ||
                !name.trim() ||
                importTemplate.isPending
              }
            >
              {importTemplate.isPending ? "Importing…" : "Import Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
