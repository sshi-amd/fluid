import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "../api/hooks";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [form, setForm] = useState({
    anthropic_api_key: "",
    amd_gateway_key: "",
    github_token: "",
    anthropic_base_url: "",
    anthropic_model: "",
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        anthropic_api_key: "",
        amd_gateway_key: "",
        github_token: "",
        anthropic_base_url: settings.anthropic_base_url ?? "",
        anthropic_model: settings.anthropic_model ?? "",
      });
    }
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, string> = {};
    if (form.anthropic_api_key) payload.anthropic_api_key = form.anthropic_api_key;
    if (form.amd_gateway_key) payload.amd_gateway_key = form.amd_gateway_key;
    if (form.github_token) payload.github_token = form.github_token;
    payload.anthropic_base_url = form.anthropic_base_url;
    payload.anthropic_model = form.anthropic_model;
    await updateSettings.mutateAsync(payload);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (isLoading) return <div className={styles.loading}>Loading…</div>;

  return (
    <div className={styles.page}>
      <form className={styles.form} onSubmit={handleSave}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>API Keys</h2>

          <label className={styles.field}>
            <span className={styles.label}>
              Anthropic API Key
              {settings?.anthropic_api_key_set && (
                <span className={styles.set}>set</span>
              )}
            </span>
            <input
              type="password"
              placeholder={settings?.anthropic_api_key_set ? "••••••••" : "sk-ant-…"}
              value={form.anthropic_api_key}
              onChange={(e) => setForm({ ...form, anthropic_api_key: e.target.value })}
              autoComplete="off"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              AMD Gateway Key
              {settings?.amd_gateway_key_set && (
                <span className={styles.set}>set</span>
              )}
            </span>
            <input
              type="password"
              placeholder={settings?.amd_gateway_key_set ? "••••••••" : "Optional"}
              value={form.amd_gateway_key}
              onChange={(e) => setForm({ ...form, amd_gateway_key: e.target.value })}
              autoComplete="off"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              GitHub Token
              {settings?.github_token_set && (
                <span className={styles.set}>set</span>
              )}
            </span>
            <input
              type="password"
              placeholder={settings?.github_token_set ? "••••••••" : "ghp_…"}
              value={form.github_token}
              onChange={(e) => setForm({ ...form, github_token: e.target.value })}
              autoComplete="off"
            />
          </label>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Model Settings</h2>

          <label className={styles.field}>
            <span className={styles.label}>Anthropic Base URL</span>
            <input
              type="text"
              placeholder="https://api.anthropic.com (default)"
              value={form.anthropic_base_url}
              onChange={(e) => setForm({ ...form, anthropic_base_url: e.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Model Override</span>
            <input
              type="text"
              placeholder="claude-opus-4-5 (default)"
              value={form.anthropic_model}
              onChange={(e) => setForm({ ...form, anthropic_model: e.target.value })}
            />
          </label>
        </section>

        <div className={styles.actions}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? "Saving…" : "Save"}
          </button>
          {saved && <span className={styles.savedMsg}>Saved!</span>}
        </div>
      </form>
    </div>
  );
}
