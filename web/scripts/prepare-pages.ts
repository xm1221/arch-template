import { copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

export async function preparePages(): Promise<{ worker: string; routes: string }> {
  const worker = resolve(webRoot, "dist/_worker.js");
  const routes = resolve(webRoot, "dist/_routes.json");
  await copyFile(resolve(webRoot, "dist-worker/index.js"), worker);
  await writeFile(
    routes,
    `${JSON.stringify({ version: 1, include: ["/*"], exclude: ["/cdn-cgi/*"] }, null, 2)}\n`,
  );
  return { worker, routes };
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  const written = await preparePages();
  console.log(`pages worker ${written.worker}`);
}
