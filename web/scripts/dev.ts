import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const bin = (name: string) => join(webRoot, "node_modules", ".bin", name);

const port = 8788;

function portFree(target: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(target, "127.0.0.1");
  });
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // API process is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("API 没有在 8788 端口起来。");
}

const children: ChildProcess[] = [];

function start(command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
  });
  children.push(child);
  return child;
}

function shutdown(code = 0): void {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (!(await portFree(port))) {
  console.error(`端口 ${port} 已被占用。停下旧进程，或设置 PORT 后改 vite 代理。`);
  process.exit(1);
}

const api = start(bin("tsx"), ["server/index.ts"]);
api.once("exit", (code) => {
  if (code && code !== 0) shutdown(code);
});

try {
  await waitForHealth();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}

console.log("UI   http://127.0.0.1:5173/arch-template/");
console.log("API  http://127.0.0.1:8788/api/health");

const vite = start(bin("vite"), ["--host", "127.0.0.1", "--port", "5173"]);
vite.once("exit", (code) => shutdown(code ?? 0));
