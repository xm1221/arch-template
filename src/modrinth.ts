import type { DependencyType } from "./options.js";
import { resolveCoordOverride } from "./coords.js";

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
}

export interface GradleDepMetadata {
  modId: string;
  versionNumber: string;
  depType: DependencyType;
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

/**
 * Resolve a Modrinth version by id or version number. When no version is
 * supplied the newest version returned by the API is used.
 */
export async function fetchVersion(
  project: string,
  version?: string,
): Promise<ModrinthVersion> {
  if (version && version.trim() !== "") {
    try {
      return await getJson<ModrinthVersion>(
        `${API_BASE}/version/${encodeURIComponent(version)}`,
      );
    } catch {
      // The /version/{id} endpoint may reject a version number on some
      // projects; fall back to scanning the project's version list.
    }

    const versions = await fetchVersions(project);
    const match = versions.find(
      (candidate) => candidate.id === version || candidate.version_number === version,
    );
    if (!match) {
      throw new Error(`Modrinth version "${version}" was not found for project "${project}"`);
    }
    return match;
  }

  const versions = await fetchVersions(project);
  if (versions.length === 0) {
    throw new Error(`Modrinth project "${project}" has no published versions`);
  }
  return versions[0];
}

/**
 * Turn a resolved Modrinth project/version into Gradle dependency lines and
 * mod-metadata entries. Hex Casting is routed to its author Maven; everything
 * else uses maven.modrinth with an exclusiveContent repository.
 */
export function buildGradleDeps(
  project: ModrinthProject,
  version: ModrinthVersion,
  options: { minecraftVersion: string; depType?: DependencyType },
): GradleDepPlan {
  const depType = options.depType ?? "required";
  const warnings: string[] = [];
  const metadata: GradleDepMetadata[] = [];
  const override = resolveCoordOverride(project, options.minecraftVersion);

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
    repositories = override.repositories.map((url) => `maven("${url}")`);
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
        '    forRepository { maven("https://api.modrinth.com/maven") { name = "Modrinth" } }',
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
    });
  }

  const commonFn = depType === "required" ? "modApi" : "modCompileOnly";
  const platformFn = depType === "required" ? "modImplementation" : "modCompileOnly";

  return {
    repositories,
    dependencies: {
      common: [`${commonFn}("${commonCoordinate}")`],
      fabric: [`${platformFn}("${fabricCoordinate}")`],
      forge: [`${platformFn}("${forgeCoordinate}")`],
      neoforge: [`${platformFn}("${neoforgeCoordinate}")`],
    },
    metadata,
    warnings,
  };
}

/** CurseForge support is intentionally a stub for this milestone. */
export async function fetchCurseForgeProject(): Promise<never> {
  throw new Error(
    "CurseForge API is not implemented. Use a Modrinth dependency for now.",
  );
}
