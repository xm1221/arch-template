/** JSON shape accepted by generateZip. Field names match the engine. */

export type DependencyType = "required" | "optional" | "incompatible" | "embedded";

export interface DependencyJson {
  source: "modrinth";
  project: string;
  version?: string;
  depType?: DependencyType;
}

export interface GenerateOptionsJson {
  displayName: string;
  modId: string;
  mavenGroup: string;
  modVersion: string;
  base: string;
  kotlin: boolean;
  recipes: {
    hexdoc: boolean;
    hexCastingAddon: boolean;
  };
  dependencies: DependencyJson[];
  mirrors: {
    enabled: boolean;
    preset: "cn-campus" | "none";
    gradleWrapper?: "official" | "tencent";
  };
  presetId?: string;
  icon?: {
    enabled: true;
    base64: string;
  };
}

export interface BaseInfo {
  id: string;
  kind: "custom" | "arch-official";
  minecraft: string;
  platforms: string[];
  java: number;
  architectury: string;
}

export interface PresetSummary {
  id: string;
  displayName: string;
  modId: string;
  base: string;
  kotlin: boolean;
  recipes: {
    hexdoc?: boolean;
    hexCastingAddon?: boolean;
  };
  mirrors: {
    enabled: boolean;
    preset?: "cn-campus" | "none";
    gradleWrapper?: "official" | "tencent";
  };
  dependencyCount: number;
}

export interface ModrinthHit {
  slug: string;
  projectId: string;
  title: string;
  description: string;
  iconUrl?: string;
  downloads: number;
}

export interface ModrinthVersionChoice {
  id: string;
  versionNumber: string;
  versionType: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
}

export interface IconDraft {
  base64: string;
  byteLength: number;
  width: number | null;
  height: number | null;
}

export interface DependencyDraft {
  project: string;
  title: string;
  version?: string;
  depType: DependencyType;
}

export interface FormState {
  displayName: string;
  modId: string;
  mavenGroup: string;
  modVersion: string;
  base: string;
  kotlin: boolean;
  hexdoc: boolean;
  hexCastingAddon: boolean;
  mirrorsEnabled: boolean;
  gradleWrapperTencent: boolean;
  dependencies: DependencyDraft[];
  icon: IconDraft | null;
  presetId?: string;
}

export interface FieldErrors {
  displayName?: string;
  modId?: string;
  mavenGroup?: string;
  modVersion?: string;
  base?: string;
  dependencies?: string;
  icon?: string;
  form?: string;
}
