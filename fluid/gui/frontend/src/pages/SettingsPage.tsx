import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/shared/Button';
import { getSettings, updateSettings } from '../api/api';
import type { Settings, SettingsUpdate } from '../types';
import styles from './SettingsPage.module.css';

function isMasked(v: string) {
  return /^\*+$/.test(v.trim());
}

interface KeyFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  isSet: boolean;
  statusId?: string;
}

function KeyField({ label, value, onChange, placeholder, isSet }: KeyFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.fieldRow}>
        <input
          type={visible ? 'text' : 'password'}
          className={`${styles.fieldInput} ${styles.keyInput}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="secondary" className={styles.toggleBtn} onClick={() => setVisible((v) => !v)}>
          {visible ? 'Hide' : 'Show'}
        </Button>
      </div>
      <div className={[styles.keyStatus, isSet ? styles.keySet : ''].filter(Boolean).join(' ')}>
        {isSet ? 'Key is set' : ''}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [amdKey, setAmdKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setAmdKey(s.amd_gateway_key ?? '');
      setBaseUrl(s.anthropic_base_url ?? '');
      setModel(s.anthropic_model ?? '');
      setAnthropicKey(s.anthropic_api_key ?? '');
      setGithubToken(s.github_token ?? '');
    });
  }, []);

  async function handleSave() {
    const update: SettingsUpdate = {};
    if (!isMasked(amdKey)) update.amd_gateway_key = amdKey;
    if (!isMasked(anthropicKey)) update.anthropic_api_key = anthropicKey;
    if (!isMasked(githubToken)) update.github_token = githubToken;
    if (baseUrl.trim()) update.anthropic_base_url = baseUrl.trim();
    if (model.trim()) update.anthropic_model = model.trim();

    await updateSettings(update);
    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 3000);

    // Refresh
    const fresh = await getSettings();
    setSettings(fresh);
    setAmdKey(fresh.amd_gateway_key ?? '');
    setAnthropicKey(fresh.anthropic_api_key ?? '');
    setGithubToken(fresh.github_token ?? '');
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" subtitle="API keys and tokens for your containers" />
      <div className={styles.content}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>AMD LLM Gateway</h3>
          <p className={styles.sectionDesc}>
            Use the AMD LLM Gateway to access Claude Code. Get your key from{' '}
            <a href="https://llm.amd.com" className={styles.link} target="_blank" rel="noreferrer">llm.amd.com</a>.
            When set, this takes priority over a direct Anthropic API key.
          </p>
          <KeyField
            label="Gateway Key"
            value={amdKey}
            onChange={setAmdKey}
            placeholder="Your AMD Gateway key"
            isSet={settings?.amd_gateway_key_set ?? false}
          />
          <label className={styles.fieldLabel}>Base URL</label>
          <input
            type="text"
            className={styles.fieldInput}
            placeholder="https://llm-api.amd.com/Anthropic (default)"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <label className={styles.fieldLabel}>Model</label>
          <input
            type="text"
            className={styles.fieldInput}
            placeholder="Claude-Sonnet-4.6 (default)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Anthropic API Key (Direct)</h3>
          <p className={styles.sectionDesc}>
            Direct Anthropic API key for Claude Code. Only used if AMD Gateway key is not set.
            Get one from{' '}
            <a href="https://console.anthropic.com/" className={styles.link} target="_blank" rel="noreferrer">console.anthropic.com</a>.
          </p>
          <KeyField
            label="API Key"
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder="sk-ant-api03-..."
            isSet={settings?.anthropic_api_key_set ?? false}
          />
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>GitHub Token</h3>
          <p className={styles.sectionDesc}>
            Personal access token for GitHub CLI and Git operations inside containers.
            Create one at{' '}
            <a href="https://github.com/settings/tokens" className={styles.link} target="_blank" rel="noreferrer">github.com/settings/tokens</a>.
          </p>
          <KeyField
            label="Token"
            value={githubToken}
            onChange={setGithubToken}
            placeholder="ghp_..."
            isSet={settings?.github_token_set ?? false}
          />
        </div>

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleSave}>Save Settings</Button>
          {saveStatus && <span className={styles.saveStatus}>{saveStatus}</span>}
        </div>

        <div className={`${styles.section} ${styles.infoSection}`}>
          <h3 className={styles.sectionTitle}>How keys are used</h3>
          <p className={styles.sectionDesc}>
            Keys are written to <code>~/.config/claude-code/env.sh</code> inside new containers and sourced from <code>.bashrc</code>.
            AMD Gateway key takes priority over a direct Anthropic key.
            Existing containers need to be recreated to pick up changed keys.
          </p>
        </div>
      </div>
    </div>
  );
}
