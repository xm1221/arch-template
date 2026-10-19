import type { GenerateOptions, TemplateMeta } from "./options.js";

export type PlaceholderMap = Record<string, string>;

export const KOTLIN_ONLY_START = "__KOTLIN_ONLY__";
export const KOTLIN_ONLY_END = "__END_KOTLIN_ONLY__";
export const JAVA_ONLY_START = "__JAVA_ONLY__";
export const JAVA_ONLY_END = "__END_JAVA_ONLY__";

/** Turn a modId into a Java/Kotlin class-name base (my_mod -> MyMod). */
export function toClassName(modId: string): string {
  const parts = modId.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const className = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z_$]/.test(className) ? className : `Mod${className}`;
}

function modLoader(options: GenerateOptions, meta?: TemplateMeta): {
  loader: string;
  loaderVersion: string;
} {
  const neoForge =
    meta?.platforms.includes("neoforge") ?? meta?.minecraft.startsWith("1.21") ?? false;

  if (options.kotlin) {
    return {
      loader: "kotlinforforge",
      loaderVersion: meta?.kotlinForge
        ? `[${meta.kotlinForge},)`
        : neoForge
          ? "[5.4.0,)"
          : "[4.10.0,)",
    };
  }
  return {
    loader: "javafml",
    loaderVersion: neoForge ? "[4,)" : "[47,)",
  };
}

export function buildPlaceholderMap(
  options: GenerateOptions,
  meta?: TemplateMeta,
): PlaceholderMap {
  const loader = modLoader(options, meta);
  const map: PlaceholderMap = {
    __MOD_ID__: options.modId,
    __MAVEN_GROUP__: options.mavenGroup,
    __DISPLAY_NAME__: options.displayName,
    __PACKAGE_PATH__: options.mavenGroup.replace(/\./g, "/"),
    __PACKAGE_NAME__: options.mavenGroup,
    __MOD_VERSION__: options.modVersion,
    __MOD_CLASS__: toClassName(options.modId),
    __ENTRYPOINT_ADAPTER__: options.kotlin ? '"adapter": "kotlin",\n      ' : "",
    __MOD_LOADER__: loader.loader,
    __MOD_LOADER_VERSION__: loader.loaderVersion,
  };

  if (meta) {
    map.__MC_VERSION__ = meta.minecraft;
    map.__FABRIC_LOADER__ = meta.fabricLoader;
    map.__FABRIC_API__ = meta.fabricApi;
    map.__ARCHITECTURY__ = meta.architectury;
    map.__JAVA_VERSION__ = String(meta.java);
    map.__KOTLIN_FABRIC__ = meta.kotlinFabric ?? "";
    map.__KOTLIN_FORGE__ = meta.kotlinForge ?? "";
    map.__FABRIC_KOTLIN_DEPEND__ =
      options.kotlin && meta.kotlinFabric
        ? `,\n    "fabric-language-kotlin": ">=${meta.kotlinFabric}"`
        : "";
  }

  return map;
}

export function expandPlaceholders(text: string, map: PlaceholderMap): string {
  let result = text;
  for (const [placeholder, value] of Object.entries(map)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

/**
 * Apply the placeholder map to a string or to every value of a map.
 *
 * The map form is useful when a caller has already collected file contents
 * and wants them all expanded in one go.
 */
export function applyPlaceholders(
  input: string,
  options: GenerateOptions,
  meta?: TemplateMeta,
): string;
export function applyPlaceholders(
  input: PlaceholderMap,
  options: GenerateOptions,
  meta?: TemplateMeta,
): PlaceholderMap;
export function applyPlaceholders(
  input: string | PlaceholderMap,
  options: GenerateOptions,
  meta?: TemplateMeta,
): string | PlaceholderMap {
  const placeholders = buildPlaceholderMap(options, meta);
  if (typeof input === "string") {
    return expandPlaceholders(input, placeholders);
  }
  const result: PlaceholderMap = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = expandPlaceholders(value, placeholders);
  }
  return result;
}

function markerName(line: string): string | null {
  const trimmed = line.trim();
  const withoutComment = trimmed.replace(/^(\/\/|#)\s*/, "");
  return /^__[A-Z_]+__$/.test(withoutComment) ? withoutComment : null;
}

/**
 * Remove conditional blocks that do not apply to the chosen language.
 * Markers are `//` or `#` comment lines so the template files stay valid
 * source files in both modes.
 */
export function applyConditionals(text: string, kotlin: boolean): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let skip = false;

  for (const line of lines) {
    const marker = markerName(line);
    switch (marker) {
      case KOTLIN_ONLY_START:
        skip = !kotlin;
        continue;
      case JAVA_ONLY_START:
        skip = kotlin;
        continue;
      case KOTLIN_ONLY_END:
      case JAVA_ONLY_END:
        skip = false;
        continue;
      default:
        if (!skip) {
          result.push(line);
        }
    }
  }

  return result.join("\n");
}

export function replacePath(path: string, map: PlaceholderMap): string {
  return expandPlaceholders(path, map);
}
