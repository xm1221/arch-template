import type { GenerateOptions } from "./options.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const MOD_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

const MAVEN_GROUP_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const BASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Java keywords cannot be used as package segments.
const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false", "null",
]);

export function validateModId(modId: string): void {
  if (typeof modId !== "string" || !MOD_ID_PATTERN.test(modId)) {
    throw new ValidationError(
      `modId must match ${MOD_ID_PATTERN} (lowercase letter first, then lowercase letters, digits or underscores): got ${JSON.stringify(modId)}`,
    );
  }
  if (modId.length > 64) {
    throw new ValidationError("modId must be 64 characters or fewer");
  }
}

export function validateMavenGroup(mavenGroup: string): void {
  if (typeof mavenGroup !== "string" || !MAVEN_GROUP_PATTERN.test(mavenGroup)) {
    throw new ValidationError(
      `mavenGroup must be a dotted Java package such as cn.example.mymod: got ${JSON.stringify(mavenGroup)}`,
    );
  }
  for (const segment of mavenGroup.split(".")) {
    if (JAVA_KEYWORDS.has(segment)) {
      throw new ValidationError(`mavenGroup contains the Java keyword "${segment}"`);
    }
  }
}

export function validateBaseId(base: string): void {
  if (typeof base !== "string" || !BASE_PATTERN.test(base)) {
    throw new ValidationError(
      `base must be a plain directory name such as "1.20.1" or "1.19.2": got ${JSON.stringify(base)}`,
    );
  }
}

export function validateOptions(options: GenerateOptions): void {
  if (options === null || typeof options !== "object") {
    throw new ValidationError("options must be an object");
  }
  validateModId(options.modId);
  validateMavenGroup(options.mavenGroup);
  validateBaseId(options.base);

  if (typeof options.displayName !== "string" || options.displayName.trim() === "") {
    throw new ValidationError("displayName must be a non-empty string");
  }
  if (typeof options.modVersion !== "string" || options.modVersion.trim() === "") {
    throw new ValidationError("modVersion must be a non-empty string");
  }
  if (typeof options.kotlin !== "boolean") {
    throw new ValidationError("kotlin must be true or false");
  }

  if (options.dependencies !== undefined) {
    if (!Array.isArray(options.dependencies)) {
      throw new ValidationError("dependencies must be an array");
    }
    for (const [index, dependency] of options.dependencies.entries()) {
      if (dependency === null || typeof dependency !== "object") {
        throw new ValidationError(`dependencies[${index}] must be an object`);
      }
      if (dependency.source !== "modrinth") {
        throw new ValidationError(
          `dependencies[${index}].source must be "modrinth" (CurseForge is not implemented yet)`,
        );
      }
      if (typeof dependency.project !== "string" || dependency.project.trim() === "") {
        throw new ValidationError(`dependencies[${index}].project must be a non-empty string`);
      }
      if (
        dependency.depType !== undefined &&
        !["required", "optional", "incompatible", "embedded"].includes(dependency.depType)
      ) {
        throw new ValidationError(`dependencies[${index}].depType is not supported`);
      }
    }
  }

  if (options.mirrors !== undefined) {
    if (typeof options.mirrors.enabled !== "boolean") {
      throw new ValidationError("mirrors.enabled must be true or false");
    }
    if (
      options.mirrors.preset !== undefined &&
      !["cn-campus", "none"].includes(options.mirrors.preset)
    ) {
      throw new ValidationError('mirrors.preset must be "cn-campus" or "none"');
    }
  }

  if (options.icon !== undefined) {
    const sources = [options.icon.path, options.icon.base64, options.icon.pngBase64].filter(
      (value) => typeof value === "string" && value.length > 0,
    );
    if (sources.length > 1) {
      throw new ValidationError("icon: provide only one of path, base64, or pngBase64");
    }
    if (options.icon.enabled !== undefined && typeof options.icon.enabled !== "boolean") {
      throw new ValidationError("icon.enabled must be true or false");
    }
  }
}

export function assertBaseAvailable(base: string, available: string[]): void {
  if (!available.includes(base)) {
    throw new ValidationError(
      `Unknown base "${base}". Available bases: ${available.length ? available.join(", ") : "(none)"}`,
    );
  }
}
