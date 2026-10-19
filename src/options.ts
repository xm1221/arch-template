/** Public option types for the arch-template generator. */

export type DependencySource = "modrinth";

export type DependencyType = "required" | "optional" | "incompatible" | "embedded";

export interface DependencyOptions {
  source: DependencySource;
  /** Modrinth project slug or id. */
  project: string;
  /** Modrinth version number or version id. Omit to use the latest version. */
  version?: string;
  depType?: DependencyType;
}

export interface MirrorsOptions {
  enabled: boolean;
  preset?: "cn-campus" | "none";
}

export interface RecipesOptions {
  hexdoc?: boolean;
  hexCastingAddon?: boolean;
}

export interface IconOptions {
  /** Omit / false keeps the template's placeholder icon. */
  enabled?: boolean;
  /** Local PNG path, intended for CLI use. */
  path?: string;
  /** Raw base64 or a data:image/png;base64,... URI. */
  base64?: string;
  /** Alias of base64. */
  pngBase64?: string;
}

export interface GenerateOptions {
  displayName: string;
  modId: string;
  mavenGroup: string;
  modVersion: string;
  /** "1.20.1", "1.21.1", or an arch-official MC version such as "1.19.2". */
  base: string;
  kotlin: boolean;
  recipes?: RecipesOptions;
  dependencies?: DependencyOptions[];
  mirrors?: MirrorsOptions;
  presetId?: string;
  icon?: IconOptions;
}

export interface GenerateResult {
  buffer: Buffer;
  warnings: string[];
}

/** Metadata stored as template.json inside each base tree. */
export interface TemplateMeta {
  id: string;
  minecraft: string;
  platforms: string[];
  java: number;
  architectury: string;
  fabricLoader: string;
  fabricApi: string;
  kotlinFabric?: string;
  kotlinForge?: string;
}
