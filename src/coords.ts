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

export function hexCastingModules(minecraftVersion: string): CoordModules {
  return {
    common: `at.petra-k.hexcasting:hexcasting-common-${minecraftVersion}`,
    fabric: `at.petra-k.hexcasting:hexcasting-fabric-${minecraftVersion}`,
    forge: `at.petra-k.hexcasting:hexcasting-forge-${minecraftVersion}`,
    neoforge: `at.petra-k.hexcasting:hexcasting-neoforge-${minecraftVersion}`,
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
