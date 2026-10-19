import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const outFile = join(webRoot, "worker/embedded-fs.generated.json");

const SKIP = new Set([".git", "node_modules", ".DS_Store"]);

async function walk(dir: string, prefix: string, out: Record<string, string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await walk(full, key, out);
    else if (entry.isFile()) out[key] = (await readFile(full)).toString("base64");
  }
}

export async function embedFilesystem(): Promise<{ files: number; bytes: number; outFile: string }> {
  const out: Record<string, string> = {};
  await walk(join(repoRoot, "templates"), "templates", out);
  await walk(join(repoRoot, "presets"), "presets", out);
  await mkdir(dirname(outFile), { recursive: true });
  const json = JSON.stringify(out);
  await writeFile(outFile, json);
  return { files: Object.keys(out).length, bytes: Buffer.byteLength(json), outFile };
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  embedFilesystem()
    .then((info) => {
      console.log(`Embedded ${info.files} files (${info.bytes} bytes) -> ${info.outFile}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
