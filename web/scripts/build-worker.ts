import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const fsShim = resolve(webRoot, "worker/shims/fs.ts");
const fsPromisesShim = resolve(webRoot, "worker/shims/fs-promises.ts");
const urlShim = resolve(webRoot, "worker/shims/url.ts");

const shimPlugin: esbuild.Plugin = {
  name: "arch-template-fs-shim",
  setup(build) {
    const map: Record<string, string> = {
      "node:fs": fsShim,
      fs: fsShim,
      "node:fs/promises": fsPromisesShim,
      "node:url": urlShim,
    };
    build.onResolve({ filter: /^(node:fs(\/promises)?|fs|node:url)$/ }, (args) => ({
      path: map[args.path],
    }));
  },
};

/** Cloudflare evaluates the Worker module on upload; top-level `new URL(..., import.meta.url)` can throw. */
async function neutralizeImportMetaPaths(outfile: string): Promise<void> {
  let code = await readFile(outfile, "utf8");
  const pairs: Array<[RegExp, string]> = [
    [/fileURLToPath\(new URL\("\.\.\/templates", import\.meta\.url\)\)/g, '"/templates"'],
    [/fileURLToPath\(new URL\("\.\.\/presets", import\.meta\.url\)\)/g, '"/presets"'],
    [/fileURLToPath\(new URL\("\.\.\/\.\.\/presets", import\.meta\.url\)\)/g, '"/presets"'],
    [/fileURLToPath\(new URL\('\.\.\/templates', import\.meta\.url\)\)/g, '"/templates"'],
    [/fileURLToPath\(new URL\('\.\.\/presets', import\.meta\.url\)\)/g, '"/presets"'],
    [/fileURLToPath\(new URL\('\.\.\/\.\.\/presets', import\.meta\.url\)\)/g, '"/presets"'],
  ];
  let hits = 0;
  for (const [re, rep] of pairs) {
    code = code.replace(re, () => {
      hits += 1;
      return rep;
    });
  }
  if (hits === 0) {
    console.warn("neutralizeImportMetaPaths: no import.meta.url path literals found");
  } else {
    console.log(`neutralizeImportMetaPaths: rewrote ${hits} path literal(s)`);
  }
  await writeFile(outfile, code);
}

export async function buildWorkerBundle(outfile = resolve(webRoot, "dist-worker/index.js")): Promise<string> {
  await mkdir(resolve(webRoot, "dist-worker"), { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(webRoot, "worker/index.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    outfile,
    absWorkingDir: webRoot,
    plugins: [shimPlugin],
    external: [
      "node:buffer",
      "node:path",
      "node:stream",
      "node:zlib",
      "node:util",
      "node:events",
      "node:crypto",
      "node:async_hooks",
      "node:assert",
      "node:string_decoder",
      "node:tty",
      "node:os",
      "node:http",
      "node:https",
      "node:net",
      "node:tls",
    ],
    logLevel: "info",
  });
  await neutralizeImportMetaPaths(outfile);
  return outfile;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  buildWorkerBundle().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
