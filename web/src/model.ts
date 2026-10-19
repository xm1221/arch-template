import type {
  DependencyDraft,
  DependencyType,
  FieldErrors,
  FormState,
  GenerateOptionsJson,
  IconDraft,
} from "./types";

const MOD_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAVEN_GROUP_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const BASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false", "null",
]);

export const MAX_ICON_BYTES = 512 * 1024;

const DEP_TYPES = new Set<DependencyType>(["required", "optional", "incompatible", "embedded"]);

export function defaultFormState(): FormState {
  return {
    displayName: "Example Mod",
    modId: "examplemod",
    mavenGroup: "cn.example.examplemod",
    modVersion: "0.1.0",
    base: "1.20.1",
    kotlin: true,
    hexdoc: false,
    hexCastingAddon: false,
    mirrorsEnabled: false,
    gradleWrapperTencent: false,
    dependencies: [],
    icon: null,
  };
}

export function validateForm(state: FormState, availableBases?: string[]): FieldErrors {
  const errors: FieldErrors = {};

  if (state.displayName.trim() === "") errors.displayName = "error.displayName";

  if (!MOD_ID_PATTERN.test(state.modId)) errors.modId = "error.modId";
  else if (state.modId.length > 64) errors.modId = "error.modIdLength";

  if (!MAVEN_GROUP_PATTERN.test(state.mavenGroup)) errors.mavenGroup = "error.maven";
  else if (state.mavenGroup.split(".").some((segment) => JAVA_KEYWORDS.has(segment))) {
    errors.mavenGroup = "error.mavenKeyword";
  }

  if (state.modVersion.trim() === "") errors.modVersion = "error.modVersion";

  if (!BASE_PATTERN.test(state.base)) errors.base = "error.base";
  else if (availableBases && !availableBases.includes(state.base)) errors.base = `error.baseMissing:${state.base}`;

  const seen = new Set<string>();
  for (const dependency of state.dependencies) {
    if (dependency.project.trim() === "") {
      errors.dependencies = "error.depEmpty";
      break;
    }
    if (seen.has(dependency.project)) {
      errors.dependencies = "error.depDuplicate";
      break;
    }
    seen.add(dependency.project);
    if (!DEP_TYPES.has(dependency.depType)) {
      errors.dependencies = "error.depType";
      break;
    }
  }

  if (state.icon && state.icon.byteLength > MAX_ICON_BYTES) errors.icon = "error.iconSize";

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((value) => Boolean(value));
}

export function toGenerateOptions(state: FormState): GenerateOptionsJson {
  const options: GenerateOptionsJson = {
    displayName: state.displayName.trim(),
    modId: state.modId.trim(),
    mavenGroup: state.mavenGroup.trim(),
    modVersion: state.modVersion.trim(),
    base: state.base,
    kotlin: state.kotlin,
    recipes: {
      hexdoc: state.hexdoc,
      hexCastingAddon: state.hexCastingAddon,
    },
    dependencies: state.dependencies.map((dependency) => {
      const entry: GenerateOptionsJson["dependencies"][number] = {
        source: "modrinth",
        project: dependency.project,
        depType: dependency.depType,
      };
      if (dependency.version && dependency.version.trim() !== "") {
        entry.version = dependency.version.trim();
      }
      return entry;
    }),
    mirrors: {
      enabled: state.mirrorsEnabled,
      preset: state.mirrorsEnabled ? "cn-campus" : "none",
      gradleWrapper: state.gradleWrapperTencent ? "tencent" : "official",
    },
  };
  if (state.presetId) options.presetId = state.presetId;
  if (state.icon) {
    options.icon = { enabled: true, base64: state.icon.base64 };
  }
  return options;
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const ihdr = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (ihdr !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function isPng(bytes: Uint8Array): boolean {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return magic.every((value, index) => bytes[index] === value);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x1000;
  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = Array.from(bytes.subarray(index, index + chunk));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function iconFromBase64(base64: string): IconDraft {
  const raw = base64.replace(/^data:[^;,]+;base64,/i, "").trim();
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const dimensions = pngDimensions(bytes);
  return {
    base64: raw,
    byteLength: bytes.length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readDependency(value: unknown, index: number): DependencyDraft {
  if (!isRecord(value)) throw new Error(`presetError.depItem:${index + 1}`);
  if (value.source !== "modrinth") throw new Error("presetError.source");
  if (typeof value.project !== "string" || value.project.trim() === "") {
    throw new Error(`presetError.project:${index + 1}`);
  }
  const depType = value.depType === undefined ? "required" : value.depType;
  if (typeof depType !== "string" || !DEP_TYPES.has(depType as DependencyType)) {
    throw new Error(`presetError.depType:${index + 1}`);
  }
  const draft: DependencyDraft = {
    project: value.project.trim(),
    title: value.project.trim(),
    depType: depType as DependencyType,
  };
  if (typeof value.version === "string" && value.version.trim() !== "") {
    draft.version = value.version.trim();
  }
  return draft;
}

export function parsePresetJson(value: unknown):
  | { ok: true; state: FormState; notices: string[] }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "presetError.notObject" };
  if (typeof value.displayName !== "string" || value.displayName.trim() === "") {
    return { ok: false, error: "presetError.displayName" };
  }
  if (typeof value.modId !== "string") return { ok: false, error: "presetError.modId" };
  if (typeof value.mavenGroup !== "string") return { ok: false, error: "presetError.maven" };
  if (typeof value.modVersion !== "string") return { ok: false, error: "presetError.version" };
  if (typeof value.base !== "string") return { ok: false, error: "presetError.base" };
  if (typeof value.kotlin !== "boolean") return { ok: false, error: "presetError.kotlin" };

  const notices: string[] = [];
  let dependencies: DependencyDraft[] = [];
  if (value.dependencies !== undefined) {
    if (!Array.isArray(value.dependencies)) return { ok: false, error: "presetError.deps" };
    try {
      dependencies = value.dependencies.map((entry, index) => readDependency(entry, index));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "presetError.deps" };
    }
  }

  const recipes = isRecord(value.recipes) ? value.recipes : {};
  const mirrors = isRecord(value.mirrors) ? value.mirrors : {};
  let icon: IconDraft | null = null;
  if (isRecord(value.icon) && value.icon.enabled !== false) {
    const base64 = typeof value.icon.base64 === "string" ? value.icon.base64
      : typeof value.icon.pngBase64 === "string" ? value.icon.pngBase64
        : "";
    const hasPath = typeof value.icon.path === "string" && value.icon.path.trim() !== "";
    if (base64.trim() !== "") {
      try {
        icon = iconFromBase64(base64);
        if (!isPng(Uint8Array.from(atob(icon.base64), (char) => char.charCodeAt(0)))) {
          return { ok: false, error: "presetError.iconPng" };
        }
        if (icon.byteLength > MAX_ICON_BYTES) return { ok: false, error: "presetError.iconSize" };
      } catch {
        return { ok: false, error: "presetError.iconBase64" };
      }
      if (hasPath) notices.push("notice.iconPathIgnored");
    } else if (hasPath) {
      notices.push("notice.iconPathCli");
    }
  }

  const state: FormState = {
    displayName: value.displayName,
    modId: value.modId.trim(),
    mavenGroup: value.mavenGroup.trim(),
    modVersion: value.modVersion.trim(),
    base: value.base.trim(),
    kotlin: value.kotlin,
    hexdoc: Boolean(recipes.hexdoc),
    hexCastingAddon: Boolean(recipes.hexCastingAddon),
    mirrorsEnabled: mirrors.enabled === true && mirrors.preset !== "none",
    gradleWrapperTencent: mirrors.gradleWrapper === "tencent",
    dependencies,
    icon,
    presetId: typeof value.presetId === "string" && value.presetId.trim() !== "" ? value.presetId.trim() : undefined,
  };
  const errors = validateForm(state);
  if (hasErrors(errors)) {
    return { ok: false, error: errors.modId || errors.mavenGroup || errors.displayName || errors.modVersion || errors.base || "presetError.invalid" };
  }
  return { ok: true, state, notices };
}

export const PRESET_ORDER = ["plain-1.20.1-kt", "hex-addon-1.20.1-kt", "plain-1.21.1-java"];

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number(part) || 0);
  const right = b.split(".").map((part) => Number(part) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
