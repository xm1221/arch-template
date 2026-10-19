import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import {
  ValidationError,
  generateZip,
  listBases,
  loadPreset,
  type GenerateOptions,
} from "arch-template";
import { translateEngineError } from "../src/i18n.ts";

const PRESET_ID = /^[a-z0-9][a-z0-9._-]{0,80}$/;
const PROJECT_SLUG = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_BODY_CHARS = 2_000_000;
const MAX_DEPENDENCIES = 20;
const USER_AGENT = "arch-template-web/0.1.0 (https://tools.xm1221.cn/arch-template)";

export function presetsRoot(): string {
  return fileURLToPath(new URL("../../presets", import.meta.url));
}

function corsOrigin(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env.CORS_ORIGIN;
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/** `CORS_ORIGIN` is empty (same-origin), `*`, or a comma-separated allowlist. */
export function allowOriginFor(requestOrigin: string | null | undefined): string | undefined {
  const configured = corsOrigin();
  if (!configured || !requestOrigin) return undefined;
  if (configured === "*") return "*";
  const allowed = configured.split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(requestOrigin) ? requestOrigin : undefined;
}

function applyCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Expose-Headers", "X-Arch-Template-Warnings, Content-Disposition");
  const origin = allowOriginFor(request.headers.get("Origin"));
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Content-Type, Accept");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(message: string, status: number, detail?: string): Response {
  return Response.json(
    detail ? { error: message, detail } : { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function encodeWarnings(warnings: string[]): string {
  return Buffer.from(JSON.stringify(warnings), "utf8").toString("base64");
}

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ValidationError) return 400;
  if (/generate timed out|生成超时/i.test(message)) return 504;
  if (/not a PNG|icon size|icon:|Unknown base|Invalid base|must be|must match|Unsupported dependency|CurseForge|Java keyword/.test(message)) {
    return 400;
  }
  if (/Modrinth request failed|was not found|fetch failed|ENOTFOUND|getaddrinfo|network/i.test(message)) {
    return 502;
  }
  return 500;
}

async function modrinthGet(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(12_000),
  });
}

export const api = new Hono();

api.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("Access-Control-Expose-Headers", "X-Arch-Template-Warnings, Content-Disposition");
  const origin = allowOriginFor(c.req.header("Origin"));
  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Headers", "Content-Type, Accept");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Vary", "Origin");
  }
});

api.options("*", (c) => c.body(null, 204));

api.get("/health", (c) => c.json({ ok: true, service: "arch-template", generate: "generateZip" }));

api.get("/bases", async (c) => {
  const bases = await listBases();
  return c.json(
    bases.map((base) => ({
      id: base.id,
      kind: base.kind,
      minecraft: base.meta.minecraft,
      platforms: base.meta.platforms,
      java: base.meta.java,
      architectury: base.meta.architectury,
    })),
  );
});

api.get("/presets", async (c) => {
  const root = presetsRoot();
  let names: string[] = [];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -".json".length))
      .filter((id) => PRESET_ID.test(id))
      .sort();
  } catch {
    return c.json([]);
  }

  const summaries = [];
  for (const id of names) {
    try {
      const options = await loadPreset(id, root);
      summaries.push({
        id,
        displayName: options.displayName,
        modId: options.modId,
        base: options.base,
        kotlin: options.kotlin,
        recipes: options.recipes ?? {},
        mirrors: options.mirrors ?? { enabled: false, preset: "none" },
        dependencyCount: options.dependencies?.length ?? 0,
      });
    } catch (error) {
      console.error(`Skipping preset ${id}:`, error);
    }
  }
  return c.json(summaries);
});

api.get("/presets/:id", async (c) => {
  const id = c.req.param("id");
  if (!PRESET_ID.test(id)) return jsonError("预设 ID 不正确。", 400);
  try {
    return c.json(await loadPreset(id, presetsRoot()));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|no such file/i.test(message)) return jsonError("没有这个预设。", 404);
    console.error(error);
    return jsonError("读取预设失败。", 500, message);
  }
});

api.get("/modrinth/search", async (c) => {
  const query = (c.req.query("q") ?? "").trim();
  if (query.length < 2) return jsonError("请至少输入 2 个字符。", 400);
  if (query.length > 100) return jsonError("搜索词太长。", 400);
  const url = new URL("https://api.modrinth.com/v2/search");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("index", "relevance");
  url.searchParams.set("facets", JSON.stringify([["project_type:mod"]]));
  try {
    const response = await modrinthGet(url.toString());
    if (!response.ok) return jsonError("Modrinth 搜索失败，请稍后再试。", 502, `${response.status}`);
    const data = (await response.json()) as {
      hits?: Array<{
        project_id?: string;
        slug?: string;
        title?: string;
        description?: string;
        icon_url?: string;
        downloads?: number;
      }>;
    };
    const hits = (data.hits ?? []).slice(0, 8).map((hit) => ({
      slug: hit.slug ?? "",
      projectId: hit.project_id ?? "",
      title: hit.title ?? hit.slug ?? "",
      description: (hit.description ?? "").slice(0, 180),
      iconUrl: typeof hit.icon_url === "string" && hit.icon_url.startsWith("https://") ? hit.icon_url : undefined,
      downloads: typeof hit.downloads === "number" ? hit.downloads : 0,
    })).filter((hit) => hit.slug !== "");
    return c.json({ hits });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError("Modrinth 搜索失败，请稍后再试。", 502, message);
  }
});

api.get("/modrinth/project/:slug/versions", async (c) => {
  const slug = c.req.param("slug");
  if (!PROJECT_SLUG.test(slug)) return jsonError("项目 slug 不正确。", 400);
  const gameVersion = (c.req.query("gameVersion") ?? "").trim();
  try {
    const response = await modrinthGet(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`);
    if (response.status === 404) return jsonError("没有找到这个 Modrinth 项目。", 404);
    if (!response.ok) return jsonError("读取 Modrinth 版本失败。", 502, `${response.status}`);
    const data = (await response.json()) as Array<{
      id?: string;
      version_number?: string;
      version_type?: string;
      name?: string;
      game_versions?: string[];
      loaders?: string[];
      date_published?: string;
    }>;
    const versions = (Array.isArray(data) ? data : [])
      .filter((version) => typeof version.id === "string" && typeof version.version_number === "string")
      .sort((a, b) => String(b.date_published ?? "").localeCompare(String(a.date_published ?? "")));
    const matched = gameVersion
      ? versions.filter((version) => (version.game_versions ?? []).includes(gameVersion))
      : versions;
    const used = (matched.length > 0 ? matched : versions).slice(0, 40);
    return c.json({
      matchedGameVersion: !gameVersion || matched.length > 0,
      versions: used.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        versionType: version.version_type ?? "",
        name: version.name ?? version.version_number,
        gameVersions: (version.game_versions ?? []).slice(0, 8),
        loaders: version.loaders ?? [],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError("读取 Modrinth 版本失败。", 502, message);
  }
});

api.post("/generate", async (c) => {
  const raw = await c.req.text();
  if (raw.length > MAX_BODY_CHARS) {
    return jsonError("请求过大。图标需小于 512KB。", 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonError("请求正文不是合法的 JSON。", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonError("选项必须是 JSON 对象。", 400);
  }
  const options = parsed as GenerateOptions;
  if (Array.isArray(options.dependencies) && options.dependencies.length > MAX_DEPENDENCIES) {
    return jsonError(`一次最多添加 ${MAX_DEPENDENCIES} 个依赖。`, 400);
  }
  if (options.icon && typeof options.icon === "object") {
    const icon = options.icon;
    const hasBase64 = (typeof icon.base64 === "string" && icon.base64.trim() !== "")
      || (typeof icon.pngBase64 === "string" && icon.pngBase64.trim() !== "");
    if (icon.path && !hasBase64) {
      return jsonError(
        "网页接口不读取本地 icon.path。请上传 PNG，或使用 base64。",
        400,
        "icon.path is CLI-only and is rejected by the web API.",
      );
    }
    options.icon = {
      enabled: icon.enabled,
      base64: icon.base64,
      pngBase64: icon.pngBase64,
    };
  }

  try {
    const result = await Promise.race([
      generateZip(options),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("generate timed out")), 45_000);
      }),
    ]);
    const filename = `${options.modId}.zip`;
    const body = new Uint8Array(result.buffer);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Arch-Template-Warnings": encodeWarnings(result.warnings),
        "Cache-Control": "no-store",
        "Access-Control-Expose-Headers": "X-Arch-Template-Warnings, Content-Disposition",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = statusFor(error);
    if (status >= 500) console.error(error);
    return jsonError(translateEngineError(message), status, message);
  }
});

api.all("*", () => jsonError("没有这个接口。", 404));

/**
 * Serve API routes mounted at /api and /arch-template/api.
 * Returns null when the request is not an API call, so the host can serve the UI.
 */
export async function handleApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const prefixes = ["/arch-template/api", "/api"];
  const prefix = prefixes.find((item) => url.pathname === item || url.pathname.startsWith(`${item}/`));
  if (!prefix) return null;

  const rewritten = new URL(request.url);
  rewritten.pathname = url.pathname.slice(prefix.length) || "/";
  const headers = new Headers(request.headers);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  const response = await api.fetch(new Request(rewritten, init));
  return applyCors(response, request);
}
