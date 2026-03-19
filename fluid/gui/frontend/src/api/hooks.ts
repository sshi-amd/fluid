import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  api,
  type AppConfig,
  type ArgDefinition,
  type ContainerInfo,
  type CreateContainerRequest,
  type DockerfileTemplate,
  type ImageInfo,
  type Settings,
} from "./client";

// ─── Containers ───────────────────────────────────────────────────────────────

export function useContainers(): UseQueryResult<ContainerInfo[]> {
  return useQuery({
    queryKey: ["containers"],
    queryFn: () => api.get<ContainerInfo[]>("/containers"),
    refetchInterval: 3_000,
  });
}

export function useStartContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<{ status: string }>(`/containers/${name}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });
}

export function useStopContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<{ status: string }>(`/containers/${name}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });
}

export function useRemoveContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.delete<{ status: string }>(`/containers/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });
}

export function useOpenInEditor() {
  return useMutation({
    mutationFn: (name: string) =>
      api.post<{ status: string }>(`/containers/${name}/code`),
  });
}

// ─── Images ───────────────────────────────────────────────────────────────────

export function useImages(): UseQueryResult<ImageInfo[]> {
  return useQuery({
    queryKey: ["images"],
    queryFn: () => api.get<ImageInfo[]>("/images"),
  });
}

export function useRemoveImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force = false }: { id: string; force?: boolean }) =>
      api.delete<{ status: string }>(`/images/${encodeURIComponent(id)}?force=${force}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}

export function useCleanImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) =>
      api.post<{ removed: number }>(`/images/clean?force=${force}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["images"] }),
  });
}

// ─── Config ───────────────────────────────────────────────────────────────────

export function useConfig(): UseQueryResult<AppConfig> {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<AppConfig>("/config"),
    staleTime: Infinity,
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function useSettings(): UseQueryResult<Settings> {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Settings>) =>
      api.put<{ status: string }>("/settings", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function useTemplates(): UseQueryResult<DockerfileTemplate[]> {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<DockerfileTemplate[]>("/templates"),
  });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => api.get<DockerfileTemplate>(`/templates/${id}`),
    enabled: !!id,
  });
}

export function useImportTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      content: string;
      name: string;
      description?: string;
      source?: string;
    }) => api.post<DockerfileTemplate>("/templates", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      content?: string;
    }) => api.put<DockerfileTemplate>(`/templates/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

export function useParseDockerfile() {
  return useMutation({
    mutationFn: (data: { content: string; name: string }) =>
      api.post<{ args: ArgDefinition[] }>("/templates/parse", data),
  });
}

// ─── Create container (WebSocket-based, see BuildQueue component) ─────────────

/** Optimistically add the new container to the cache after a WS create completes. */
export function useInvalidateContainers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["containers"] });
}

// Re-export for convenience so components import from one place.
export type {
  ContainerInfo,
  ImageInfo,
  AppConfig,
  Settings,
  CreateContainerRequest,
  DockerfileTemplate,
  ArgDefinition,
};
