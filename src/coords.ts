/**
 * Small coordinate-override map for projects that publish to their own Maven.
 *
 * Hex Casting publishes per-platform artifacts on maven.hexxy.media and
 * maven.blamejared.com instead of maven.modrinth.
 */

export interface CoordModules {
  common: string;
  fabric: string;
  forge: string;
  neoforge: string;
}

export interface CoordOverride {
  id: string;
  repositories: string[];
  matches(project: { slug?: string; id?: string; title?: string }): boolean;
  modules(minecraftVersion: string): CoordModules;
}

export interface ResolvedCoordOverride {
  id: string;
  repositories: string[];
  modules: CoordModules;
}

export interface HexCastingRuntimeCoordinates {
  repositories: string[];
  common: string[];
  fabric: string[];
  forge: string[];
}

export function hexCastingModules(minecraftVersion: string): CoordModules {
  return {
    common: `at.petra-k.hexcasting:hexcasting-common-${minecraftVersion}`,
    fabric: `at.petra-k.hexcasting:hexcasting-fabric-${minecraftVersion}`,
    forge: `at.petra-k.hexcasting:hexcasting-forge-${minecraftVersion}`,
    neoforge: `at.petra-k.hexcasting:hexcasting-neoforge-${minecraftVersion}`,
  };
}

/**
 * Hex Casting 0.11.4 declares these as mandatory runtime dependencies in its
 * mod metadata, but its Maven POMs intentionally contain no dependencies.
 * Keep the loader-specific coordinates here so generated addon projects can
 * launch without requiring a hand-written Gradle fix.
 */
export function hexCastingRuntimeCoordinates(
  minecraftVersion: string,
): HexCastingRuntimeCoordinates | null {
  if (minecraftVersion !== "1.20.1") {
    return null;
  }
  return {
    repositories: [
      "https://maven.blamejared.com/",
      "https://maven.ladysnake.org/releases/",
      "https://maven.shedaniel.me/",
      "https://maven.terraformersmc.com/releases/",
      "https://maven.theillusivec4.top/",
    ],
    common: [
      'implementation("io.github.llamalad7:mixinextras-common:0.5.0")',
      'annotationProcessor("io.github.llamalad7:mixinextras-common:0.5.0")',
    ],
    fabric: [
      'modLocalRuntime("vazkii.patchouli:Patchouli:1.20.1-84-FABRIC")',
      'modLocalRuntime("com.samsthenerd.inline:inline-fabric:1.20.1-1.2.2") { transitive = false }',
      'modLocalRuntime("at.petra-k.paucal:paucal-fabric-1.20.1:0.6.0-pre-118")',
      'modLocalRuntime("dev.onyxstudios.cardinal-components-api:cardinal-components-api:5.2.1")',
      'modApi("me.shedaniel.cloth:cloth-config-fabric:11.1.106") { exclude(group: "net.fabricmc.fabric-api") }',
      'localRuntime("io.github.llamalad7:mixinextras-fabric:0.5.0")',
      'include("io.github.llamalad7:mixinextras-fabric:0.5.0")',
    ],
    forge: [
      'modImplementation("at.petra-k.paucal:paucal-forge-1.20.1:0.6.0-pre-118")',
      'modLocalRuntime("vazkii.patchouli:Patchouli:1.20.1-84-FORGE")',
      'modLocalRuntime("top.theillusivec4.caelus:caelus-forge:3.1.0+1.20")',
      'modLocalRuntime("com.samsthenerd.inline:inline-forge:1.20.1-1.2.2") { transitive = false }',
      'modApi("me.shedaniel.cloth:cloth-config-forge:11.1.106")',
      'localRuntime("io.github.llamalad7:mixinextras-forge:0.5.0")',
      'include("io.github.llamalad7:mixinextras-forge:0.5.0")',
    ],
  };
}

const HEX_CASTING: CoordOverride = {
  id: "hex-casting",
  repositories: ["https://maven.hexxy.media/", "https://maven.blamejared.com/"],
  matches(project) {
    const slug = (project.slug ?? "").toLowerCase();
    const title = (project.title ?? "").toLowerCase();
    return slug === "hex-casting" || slug === "hexcasting" || title.includes("hex casting");
  },
  modules: hexCastingModules,
};

export const COORD_OVERRIDES: CoordOverride[] = [HEX_CASTING];

export function resolveCoordOverride(
  project: { slug?: string; id?: string; title?: string },
  minecraftVersion: string,
): ResolvedCoordOverride | null {
  for (const override of COORD_OVERRIDES) {
    if (override.matches(project)) {
      return {
        id: override.id,
        repositories: [...override.repositories],
        modules: override.modules(minecraftVersion),
      };
    }
  }
  return null;
}

/** Build a Modrinth Maven module coordinate prefix (group:module). */
export function modrinthMavenModule(slug: string): string {
  return `maven.modrinth:${slug}`;
}
