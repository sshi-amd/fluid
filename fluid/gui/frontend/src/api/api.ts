import type {
  AppConfig,
  ContainerInfo,
  ImageInfo,
  Settings,
  SettingsUpdate,
  CreateContainerRequest,
} from '../types';

async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  return res.json() as Promise<T>;
}

// Config
export const getConfig = () => apiFetch<AppConfig>('GET', '/config');

// Containers
export const getContainers = () => apiFetch<ContainerInfo[]>('GET', '/containers');
export const startContainer = (name: string) =>
  apiFetch<{ status: string }>('POST', `/containers/${name}/start`);
export const stopContainer = (name: string) =>
  apiFetch<{ status: string }>('POST', `/containers/${name}/stop`);
export const removeContainer = (name: string) =>
  apiFetch<{ status: string }>('DELETE', `/containers/${name}`);
export const addContainer = (name: string) =>
  apiFetch<{ status: string }>('POST', `/containers/${name}/add`);
export const getAllContainers = () => apiFetch<ContainerInfo[]>('GET', '/containers/all');

// Images
export const getImages = () => apiFetch<ImageInfo[]>('GET', '/images');
export const removeImage = (id: string) =>
  apiFetch<{ status: string }>('DELETE', `/images/${id}`);
export const cleanImages = (force: boolean) =>
  apiFetch<{ removed: number }>('POST', '/images/clean', { force });

// Settings
export const getSettings = () => apiFetch<Settings>('GET', '/settings');
export const updateSettings = (data: SettingsUpdate) =>
  apiFetch<{ status: string }>('POST', '/settings', data);

// Create container (returns build WS URL)
export const createContainer = (req: CreateContainerRequest) =>
  apiFetch<{ ws_url: string; name: string }>('POST', '/containers/create', req);

// WebSocket URL builder
export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}
