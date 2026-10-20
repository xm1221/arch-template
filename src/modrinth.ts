import type { DependencyType } from "./options.js";
import { hexCastingRuntimeCoordinates, resolveCoordOverride } from "./coords.js";

const API_BASE = "https://api.modrinth.com/v2";
const USER_AGENT = "arch-template/0.1.0 (https://tools.xm1221.cn/arch-template)";

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  name?: string;
  version_type?: string;
  game_versions?: string[];
  loaders?: string[];
  date_published?: string;
}

export interface GradleDepMetadata {
  modId: string;
  versionNumber: string;
  depType: DependencyType;
  platforms: string[];
}

export interface GradleDepPlan {
  repositories: string[];
  dependencies: {
    common: string[];
    fabric: string[];
    forge: string[];
    neoforge: string[];
  };
  metadata: GradleDepMetadata[];
  warnings: string[];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Modrinth request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchProject(project: string): Promise<ModrinthProject> {
  return getJson<ModrinthProject>(`${API_BASE}/project/${encodeURIComponent(project)}`);
}

export async function fetchVersions(project: string): Promise<ModrinthVersion[]> {
  return getJson<ModrinthVersion[]>(
    `${API_BASE}/project/${encodeURIComponent(project)}/version`,
  );
}

export interface VersionFilters {
  projectId?: string;
  minecraftVersion?: string;
  loaders?: string[];
}

function matchesVersionFilters(version: ModrinthVersion, filters: VersionFilters): boolean {
  if (filters.projectId && version.project_id !== filters.projectId) {
    return false;
  }
  if (
    filters.minecraftVersion &&
    !(version.game_versions ?? []).includes(filters.minecraftVersion)
  ) {
    return false;
  }
  if (
    filters.loaders?.length &&
    !(version.loaders ?? []).some((loader) => filters.loaders!.includes(loader))
  ) {
    return false;
  }
  return true;
}

function describeVersionFilters(filters: VersionFilters): string {
  const parts = [
    filters.minecraftVersion ? `Minecraft ${filters.minecraftVersion}` : "",
    filters.loaders?.length ? `loaders ${filters.loaders.join("/")}` : "",
  ].filter(Boolean);
  return parts.length ? ` (requires ${parts.join(", ")})` : "";
}

/**
 * Resolve a Modrinth version by id or version number, optionally requiring
 * that it belongs to the expected project and supports the target MC/loaders.
 */
export async function fetchVersion(
  project: string,
  version?: string,
  filters: VersionFilters = {},
): Promise<ModrinthVersion> {
  if (version && version.trim() !== "") {
    let direct: ModrinthVersion | undefined;
    try {
      direct = await getJson<ModrinthVersion>(
        `${API_BASE}/version/${encodeURIComponent(version)}`,
      );
    } catch {
      // The /version/{id} endpoint may reject a version number on some
      // projects; fall back to scanning the project's version list.
    }
    if (direct) {
      if (!matchesVersionFilters(direct, filters)) {
        throw new Error(
          `Modrinth version "${version}" is not compatible with project "${project}"${describeVersionFilters(filters)}`,
        );
      }
      return direct;
    }

    const versions = await fetchVersions(project);
    const match = versions.find(
      (candidate) =>
        (candidate.id === version || candidate.version_number === version) &&
        matchesVersionFilters(candidate, filters),
    );
    if (!match) {
      throw new Error(
        `Modrinth version "${version}" was not found for project "${project}"${describeVersionFilters(filters)}`,
      );
    }
    return match;
  }

  const versions = await fetchVersions(project);
  const compatible = versions
    .filter((candidate) => matchesVersionFilters(candidate, filters))
    .sort((a, b) =>
      String(b.date_published ?? "").localeCompare(String(a.date_published ?? "")),
    );
  if (compatible.length === 0) {
    throw new Error(
      `Modrinth project "${project}" has no published versions${describeVersionFilters(filters)}`,
    );
  }
  return compatible[0];
}

/**
 * Turn a resolved Modrinth project/version into Gradle dependency lines and
 * mod-metadata entries. Hex Casting is routed to its author Maven; everything
 * else uses maven.modrinth with an exclusiveContent repository.
 */
export function buildGradleDeps(
  project: ModrinthProject,
  version: ModrinthVersion,
  options: {
    minecraftVersion: string;
    depType?: DependencyType;
    platforms?: string[];
  },
): GradleDepPlan {
  const depType = options.depType ?? "required";
  const warnings: string[] = [];
  const metadata: GradleDepMetadata[] = [];
  const override = resolveCoordOverride(project, options.minecraftVersion);
  const requestedPlatforms = options.platforms?.length
    ? options.platforms
    : ["fabric", "forge", "neoforge"];
  const declaredPlatforms = version.loaders ?? [];
  // Coordinate overrides publish one artifact per requested loader. Modrinth
  // may expose those artifacts as separate version records with the same
  // version number, so a single record cannot describe all supported loaders.
  const supportedPlatforms = override
    ? requestedPlatforms
    : declaredPlatforms.length
      ? requestedPlatforms.filter((platform) => declaredPlatforms.includes(platform))
      : requestedPlatforms;
  if (supportedPlatforms.length === 0) {
    throw new Error(
      `Dependency "${project.slug}" does not support ${requestedPlatforms.join("/")}`,
    );
  }
  const missingPlatforms = requestedPlatforms.filter(
    (platform) => !supportedPlatforms.includes(platform),
  );
  if (missingPlatforms.length) {
    warnings.push(
      `Dependency "${project.slug}" does not support ${missingPlatforms.join("/")}; those dependency lines and metadata were omitted.`,
    );
  }

  let commonCoordinate: string;
  let fabricCoordinate: string;
  let forgeCoordinate: string;
  let neoforgeCoordinate: string;
  let repositories: string[];
  let metadataModId: string;

  if (override) {
    commonCoordinate = `${override.modules.common}:${version.version_number}`;
    fabricCoordinate = `${override.modules.fabric}:${version.version_number}`;
    forgeCoordinate = `${override.modules.forge}:${version.version_number}`;
    neoforgeCoordinate = `${override.modules.neoforge}:${version.version_number}`;
    repositories = override.repositories.map((url) => `maven { url "${url}" }`);
    metadataModId = "hexcasting";
  } else {
    const coordinate = `maven.modrinth:${project.slug}:${version.version_number}`;
    commonCoordinate = coordinate;
    fabricCoordinate = coordinate;
    forgeCoordinate = coordinate;
    neoforgeCoordinate = coordinate;
    repositories = [
      [
        "exclusiveContent {",
        "    forRepository {",
        "        maven {",
        '            name = "Modrinth"',
        '            url = "https://api.modrinth.com/maven"',
        "        }",
        "    }",
        '    filter { includeGroup("maven.modrinth") }',
        "}",
      ].join("\n"),
    ];
    metadataModId = project.slug;
    warnings.push(
      `Dependency "${project.slug}" uses maven.modrinth; its mod metadata id is guessed as "${project.slug}".`,
    );
  }

  if (depType === "incompatible" || depType === "embedded") {
    warnings.push(
      `Dependency "${project.slug}" has depType "${depType}"; it is emitted as a compile-only dependency without metadata.`,
    );
  } else {
    metadata.push({
      modId: metadataModId,
      versionNumber: version.version_number,
      depType,
      platforms: supportedPlatforms,
    });
  }

  const commonFn = depType === "required" ? "modApi" : "modCompileOnly";
  const platformFn = depType === "required" ? "modImplementation" : "modCompileOnly";
  const common =
    supportedPlatforms.length === requestedPlatforms.length
      ? [`${commonFn}("${commonCoordinate}")`]
      : [];
  const platformDependency = (platform: "fabric" | "forge" | "neoforge", coordinate: string) =>
    supportedPlatforms.includes(platform) ? [`${platformFn}("${coordinate}")`] : [];

  return {
    repositories,
    dependencies: {
      common,
      fabric: platformDependency("fabric", fabricCoordinate),
      forge: platformDependency("forge", forgeCoordinate),
      neoforge: platformDependency("neoforge", neoforgeCoordinate),
    },
    metadata,
    warnings,
  };
}

/**
 * Build the non-transitive Hex Casting runtime dependencies omitted from its
 * published POMs. These are runtime mods, so the generated addon should load
 * them through the platform implementation configuration.
 */
export function buildHexCastingRuntimeDeps(
  minecraftVersion: string,
  platforms: string[],
): GradleDepPlan | null {
  const coordinates = hexCastingRuntimeCoordinates(minecraftVersion);
  if (!coordinates) {
    return null;
  }
  const platformLines = (platform: "fabric" | "forge") =>
    platforms.includes(platform) ? coordinates[platform] : [];
  return {
    repositories: coordinates.repositories.map((url) => `maven { url "${url}" }`),
    dependencies: {
      common: coordinates.common,
      fabric: platformLines("fabric"),
      forge: platformLines("forge"),
      neoforge: [],
    },
    metadata: [],
    warnings: [],
  };
}

/** CurseForge support is intentionally a stub for this milestone. */
export async function fetchCurseForgeProject(): Promise<never> {
  throw new Error(
    "CurseForge API is not implemented. Use a Modrinth dependency for now.",
  );
}
