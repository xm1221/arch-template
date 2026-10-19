import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { handleApi } from "./app.ts";

const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));

function contentType(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".woff2":
      return "font/woff2";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export function tryServeStatic(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "/arch-template") {
    return Response.redirect(new URL("/arch-template/", request.url), 302);
  }
  if (!url.pathname.startsWith("/arch-template/")) return null;

  const indexFile = join(distRoot, "index.html");
  if (!existsSync(indexFile)) {
    return new Response("UI 还没有构建。在 web 目录运行 npm run build。", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let rel = decodeURIComponent(url.pathname.slice("/arch-template".length)).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  if (rel.includes("\0")) return null;

  const rootWithSep = distRoot.endsWith(sep) ? distRoot : distRoot + sep;
  let file = normalize(join(distRoot, rel));
  if (!file.startsWith(rootWithSep)) return null;

  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(rel)) return null;
    file = indexFile;
  }

  const immutable = file.includes(`${sep}assets${sep}`);
  const headers = {
    "Content-Type": contentType(file),
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method === "HEAD") return new Response(null, { headers });
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers });
}

export function createNodeApp(): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      const apiResponse = await handleApi(request);
      if (apiResponse) return apiResponse;
      const file = tryServeStatic(request);
      if (file) return file;
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    },
  };
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  const port = Number(process.env.PORT ?? 8788);
  const hostname = process.env.HOST ?? "127.0.0.1";
  serve(
    {
      fetch: createNodeApp().fetch,
      port,
      hostname,
    },
    (info) => {
      console.log(`arch-template API  http://${info.address}:${info.port}/api/health`);
      console.log(`arch-template UI   http://${info.address}:${info.port}/arch-template/`);
    },
  );
}
