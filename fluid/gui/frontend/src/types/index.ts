export interface ContainerInfo {
  name: string;
  display_name: string;
  status: string;
  rocm_version: string;
  workspace: string | null;
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

export interface ImageInfo {
  id: string;
  short_id: string;
  tag: string;
  rocm_version: string;
  size_mb: number;
  created: string;
  in_use: boolean;
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
}

export interface SettingsUpdate {
  anthropic_api_key?: string;
  github_token?: string;
  amd_gateway_key?: string;
  anthropic_base_url?: string;
  anthropic_model?: string;
}

export interface CreateContainerRequest {
  name?: string;
  rocm_version: string;
  distro: string;
  workspace?: string;
  gpu_family?: string;
  release_type: string;
}

export type PageName = 'home' | 'images' | 'settings';

// Build WebSocket messages
export interface InitMsg {
  type: 'init';
  name: string;
  display_name: string;
  rocm_version: string;
}

export interface LogMsg {
  type: 'log';
  line: string;
}

export interface PhaseMsg {
  type: 'phase';
  phase: string;
  progress: number;
}

export interface DoneMsg {
  type: 'done';
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

export type BuildMessage = InitMsg | LogMsg | PhaseMsg | DoneMsg | ErrorMsg;

export interface BuildQueueItem {
  name: string;
  display_name: string;
  rocm_version: string;
  phase: string;
  progress: number;
  log: string;
  status: 'building' | 'done' | 'error';
  errorMessage?: string;
}
