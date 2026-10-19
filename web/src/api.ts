import { resolveApiBase } from "./api-base";
import type {
  BaseInfo,
  GenerateOptionsJson,
  ModrinthHit,
  ModrinthVersionChoice,
  PresetSummary,
} from "./types";

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function apiBase(): string {
  return resolveApiBase(import.meta.env.BASE_URL, import.meta.env.VITE_GENERATE_API);
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const data = (await response.json()) as { error?: string; detail?: string };
    return new ApiError(data.error || `HTTP ${response.status}`, response.status, data.detail);
  } catch {
    return new ApiError(`HTTP ${response.status}`, response.status);
  }
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`);
  } catch {
    throw new ApiError("api.offline", 0);
  }
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

export function fetchBases(): Promise<BaseInfo[]> {
  return getJson<BaseInfo[]>("/bases");
}

export function fetchPresets(): Promise<PresetSummary[]> {
  return getJson<PresetSummary[]>("/presets");
}

export function fetchPreset(id: string): Promise<GenerateOptionsJson> {
  return getJson<GenerateOptionsJson>(`/presets/${encodeURIComponent(id)}`);
}

export function searchModrinth(query: string): Promise<ModrinthHit[]> {
  return getJson<{ hits: ModrinthHit[] }>(`/modrinth/search?q=${encodeURIComponent(query)}`).then((data) => data.hits);
}

export function fetchModrinthVersions(slug: string, gameVersion: string): Promise<{
  versions: ModrinthVersionChoice[];
  matchedGameVersion: boolean;
}> {
  const params = new URLSearchParams();
  if (gameVersion) params.set("gameVersion", gameVersion);
  return getJson(`/modrinth/project/${encodeURIComponent(slug)}/versions?${params.toString()}`);
}

export function decodeWarnings(header: string | null): string[] {
  if (!header) return [];
  try {
    const binary = atob(header);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] || fallback;
}

export async function requestZip(options: GenerateOptionsJson): Promise<{
  blob: Blob;
  filename: string;
  warnings: string[];
}> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/zip",
      },
      body: JSON.stringify(options),
    });
  } catch {
    throw new ApiError("api.offline", 0);
  }
  if (!response.ok) throw await readError(response);
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.includes("zip") && !type.includes("octet-stream")) {
    throw await readError(response);
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("Content-Disposition"), `${options.modId}.zip`),
    warnings: decodeWarnings(response.headers.get("X-Arch-Template-Warnings")),
  };
}
