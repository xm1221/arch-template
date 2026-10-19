/**
 * Vendor normalized Architectury official bases under templates/arch-official/<mc>/.
 *
 * Source of the version list: architectury/architectury-templates master
 * generator.config.json, entries named `<mc>-forge-fabric` (dual platform, no Quilt).
 * That file's newest Minecraft version is 1.20.1. 1.20.1 and 1.21.1 already exist as
 * maintained bases, so they are not copied here. 1.21+ NeoForge is not in that
 * upstream generator.
 *
 * Each tree is the same placeholder skeleton as templates/arch-official/1.19.2,
 * with template.json pins for that Minecraft version. generateZip ingests it
 * like any other base. This is not a byte-for-byte Loom export.
 *
 *   node scripts/vendor-arch-official.mjs
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skeleton = join(repoRoot, "templates", "arch-official", "1.19.2");
const archRoot = join(repoRoot, "templates", "arch-official");
const maintainedRoot = join(repoRoot, "templates");

/** @type {Record<string, { java: number, architectury: string, fabricLoader: string, fabricApi: string, kotlinFabric: string, kotlinForge: string, forgeLoaderMajor: number }>} */
const PINS = {
  "1.16.5": {
    java: 8,
    architectury: "1.32.66",
    fabricLoader: "0.14.21",
    fabricApi: "0.42.0+1.16",
    kotlinFabric: "1.7.1+kotlin.1.6.0",
    kotlinForge: "2.1.0",
    forgeLoaderMajor: 36,
  },
  "1.17.1": {
    java: 16,
    architectury: "2.10.6",
    fabricLoader: "0.14.21",
    fabricApi: "0.46.1+1.17",
    kotlinFabric: "1.8.3+kotlin.1.7.10",
    kotlinForge: "2.2.0",
    forgeLoaderMajor: 37,
  },
  "1.18.1": {
    java: 17,
    architectury: "3.4.10",
    fabricLoader: "0.14.21",
    fabricApi: "0.46.6+1.18",
    kotlinFabric: "1.8.5+kotlin.1.7.20",
    kotlinForge: "3.0.0",
    forgeLoaderMajor: 39,
  },
  "1.18.2": {
    java: 17,
    architectury: "4.11.93",
    fabricLoader: "0.14.21",
    fabricApi: "0.77.0+1.18.2",
    kotlinFabric: "1.9.1+kotlin.1.8.10",
    kotlinForge: "3.12.0",
    forgeLoaderMajor: 40,
  },
  "1.19": {
    java: 17,
    architectury: "5.12.42",
    fabricLoader: "0.14.21",
    fabricApi: "0.58.0+1.19",
    kotlinFabric: "1.9.3+kotlin.1.8.21",
    kotlinForge: "3.12.0",
    forgeLoaderMajor: 41,
  },
  "1.19.2": {
    java: 17,
    architectury: "6.5.85",
    fabricLoader: "0.14.22",
    fabricApi: "0.76.0+1.19.2",
    kotlinFabric: "1.10.10+kotlin.1.9.10",
    kotlinForge: "3.12.0",
    forgeLoaderMajor: 43,
  },
  "1.19.3": {
    java: 17,
    architectury: "7.1.81",
    fabricLoader: "0.14.22",
    fabricApi: "0.76.1+1.19.3",
    kotlinFabric: "1.10.10+kotlin.1.9.10",
    kotlinForge: "3.12.0",
    forgeLoaderMajor: 44,
  },
  "1.19.4": {
    java: 17,
    architectury: "8.2.84",
    fabricLoader: "0.14.22",
    fabricApi: "0.87.1+1.19.4",
    kotlinFabric: "1.10.17+kotlin.1.9.22",
    kotlinForge: "4.3.1",
    forgeLoaderMajor: 45,
  },
};

import { readdirSync as readdir, statSync as stat } from "node:fs";

const readmeTemplate = readFileSync(join(skeleton, "README.md"), "utf8");
const propertiesTemplate = readFileSync(join(skeleton, "gradle.properties"), "utf8");

const maintained = new Set(
  readdir(maintainedRoot)
    .filter((name) => name !== "arch-official" && !name.startsWith("."))
    .filter((name) => stat(join(maintainedRoot, name)).isDirectory()),
);

for (const [mc, pin] of Object.entries(PINS)) {
  if (maintained.has(mc)) {
    console.log(`skip ${mc}: maintained base already exists`);
    continue;
  }
  const dest = join(archRoot, mc);
  if (mc !== "1.19.2") {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    cpSync(skeleton, dest, { recursive: true });
  }
  const meta = {
    id: mc,
    minecraft: mc,
    platforms: ["fabric", "forge"],
    java: pin.java,
    architectury: pin.architectury,
    fabricLoader: pin.fabricLoader,
    fabricApi: pin.fabricApi,
    kotlinFabric: pin.kotlinFabric,
    kotlinForge: pin.kotlinForge,
  };
  writeFileSync(join(dest, "template.json"), `${JSON.stringify(meta, null, 2)}\n`);
  const note = [
    `> Normalized skeleton for the Architectury official \`${mc}-forge-fabric\` generator entry`,
    "> (architectury/architectury-templates, master). generateZip ingests this tree locally.",
    "> Pins are snapshots for the skeleton, not a live Loom export. Refresh with",
    "> `node scripts/vendor-arch-official.mjs`.",
  ].join("\n");
  writeFileSync(
    join(dest, "gradle.properties"),
    propertiesTemplate.replace(/^forge_version=.*$/m, `forge_version=${mc}-${pin.forgeLoaderMajor}`),
  );
  writeFileSync(join(dest, "README.md"), readmeTemplate.replace(/\n> Stub[\s\S]*$/, `\n${note}\n`));
  console.log(`vendored templates/arch-official/${mc}`);
}
