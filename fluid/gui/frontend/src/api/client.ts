/** Base URL for the FastAPI backend. In dev, Vite proxies /api → localhost:5000. */
const BASE = "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}/api${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

// ─── WebSocket helpers ────────────────────────────────────────────────────────

const WS_PROTOCOL = location.protocol === "https:" ? "wss:" : "ws:";
export const WS_BASE = `${WS_PROTOCOL}//${location.host}`;

export function openTerminalWs(
  containerName: string,
  cmd = "/bin/bash"
): WebSocket {
  return new WebSocket(
    `${WS_BASE}/ws/terminal/${encodeURIComponent(containerName)}?cmd=${encodeURIComponent(cmd)}`
  );
}

export function openHostTerminalWs(): WebSocket {
  return new WebSocket(`${WS_BASE}/ws/host-terminal`);
}

export function openCreateWs(): WebSocket {
  return new WebSocket(`${WS_BASE}/ws/create`);
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface ContainerInfo {
  name: string;
  display_name: string;
  status: string;
  rocm_version: string;
  workspace: string;
}

export interface ImageInfo {
  id: string;
  short_id: string;
  tag: string;
  rocm_version: string;
  size_mb: number;
  created: string;
  in_use: boolean;
}

export interface AppConfig {
  default_rocm_version: string;
  default_distro: string;
  distros: string[];
  rocm_versions: string[];
  therock_versions: string[];
  therock_gpu_families: string[];
  therock_release_types: string[];
}

export interface Settings {
  anthropic_api_key: string;
  anthropic_api_key_set: boolean;
  github_token: string;
  github_token_set: boolean;
  amd_gateway_key: string;
  amd_gateway_key_set: boolean;
  anthropic_base_url: string;
  anthropic_model: string;
  claude_skip_permissions: boolean;
}

export interface CreateContainerRequest {
  name?: string;
  rocm_version?: string;
  distro?: string;
  workspace?: string;
  gpu_family?: string;
  release_type?: string;
}
