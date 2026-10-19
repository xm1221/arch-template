import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateMeta } from "./options.js";

/** dist/templates.js -> <repo>/templates */
export const DEFAULT_TEMPLATES_ROOT = fileURLToPath(new URL("../templates", import.meta.url));

export type TemplateKind = "custom" | "arch-official";

export interface TemplateInfo {
  id: string;
  kind: TemplateKind;
  dir: string;
  meta: TemplateMeta;
}

function fallbackMeta(id: string): TemplateMeta {
  return {
    id,
    minecraft: id,
    platforms: ["fabric", "forge"],
    java: 17,
    architectury: "9.2.14",
    fabricLoader: "0.15.11",
    fabricApi: "0.92.2+1.20.1",
  };
}

async function readMeta(dir: string, id: string): Promise<TemplateMeta> {
  try {
    const raw = JSON.parse(await readFile(join(dir, "template.json"), "utf8")) as Partial<TemplateMeta>;
    return { ...fallbackMeta(id), ...raw, id };
  } catch {
    return fallbackMeta(id);
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function makeInfo(dir: string, id: string, kind: TemplateKind): Promise<TemplateInfo> {
  return { id, kind, dir, meta: await readMeta(dir, id) };
}

/**
 * List maintained bases plus vendored Architectury official bases.
 * Maintained bases live at templates/<mc>; vendored ones at
 * templates/arch-official/<mc>.
 */
export async function listBases(root = DEFAULT_TEMPLATES_ROOT): Promise<TemplateInfo[]> {
  const bases: TemplateInfo[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return bases;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    if (entry.name === "arch-official") {
      continue;
    }
    bases.push(await makeInfo(join(root, entry.name), entry.name, "custom"));
  }

  const archRoot = join(root, "arch-official");
  if (await isDirectory(archRoot)) {
    const archEntries = await readdir(archRoot, { withFileTypes: true });
    for (const entry of archEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      bases.push(await makeInfo(join(archRoot, entry.name), entry.name, "arch-official"));
    }
  }

  return bases;
}

export async function resolveBaseDir(
  base: string,
  root = DEFAULT_TEMPLATES_ROOT,
): Promise<TemplateInfo> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base)) {
    throw new Error(`Invalid base name: ${JSON.stringify(base)}`);
  }

  const customDir = join(root, base);
  if (await isDirectory(customDir)) {
    return makeInfo(customDir, base, "custom");
  }

  const archDir = join(root, "arch-official", base);
  if (await isDirectory(archDir)) {
    return makeInfo(archDir, base, "arch-official");
  }

  const available = (await listBases(root)).map((info) => info.id);
  throw new Error(
    `Unknown base "${base}". Available bases: ${available.length ? available.join(", ") : "(none)"}. ` +
      "Vendor an Architectury official template under templates/arch-official/<mc>/ first.",
  );
}
