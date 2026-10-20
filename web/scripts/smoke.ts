import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
import { createNodeApp } from "../server/index.ts";
import { allowOriginFor, encodeWarnings, handleApi } from "../server/app.ts";
import { embedFilesystem } from "./embed-fs.ts";
import { buildWorkerBundle } from "./build-worker.ts";
import { resolveApiBase } from "../src/api-base.ts";
import { t, translateEngineError, translateWarning } from "../src/i18n.ts";
import {
  hasErrors,
  parsePresetJson,
  pngDimensions,
  toGenerateOptions,
  validateForm,
  defaultFormState,
} from "../src/model.ts";
import { fileURLToPath as shimFileURLToPath } from "../worker/shims/url.ts";

const OFFICIAL_BASES = ["1.19.4", "1.19.3", "1.19.2", "1.19", "1.18.2", "1.18.1", "1.17.1", "1.16.5"];

const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGPwmnDzPwgDABXjBWXIaz9tAAAAAElFTkSuQmCC";

function assertZip(buffer: ArrayBuffer | Uint8Array, modId: string): Promise<void> {
  return JSZip.loadAsync(buffer).then(async (zip) => {
    const settingsName = `${modId}/settings.gradle`;
    const settings = await zip.file(settingsName)?.async("string");
    assert.ok(settings, `missing ${settingsName}`);
    assert.match(settings, new RegExp(`rootProject\\.name = "${modId}"`));
    const fabric = await zip.file(`${modId}/fabric/src/main/resources/fabric.mod.json`)?.async("string");
    assert.ok(fabric?.includes(`"id": "${modId}"`));
    const kotlinFile = zip.file(`${modId}/common/src/main/kotlin/cn/example/${modId}/Examplemod.kt`);
    assert.ok(kotlinFile, "kotlin source was not emitted");
  });
}

async function readZipResponse(response: Response): Promise<void> {
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get("Content-Type") ?? "", /zip/);
  const warnings = JSON.parse(Buffer.from(response.headers.get("X-Arch-Template-Warnings") ?? "", "base64").toString("utf8"));
  assert.ok(Array.isArray(warnings));
  await assertZip(await response.arrayBuffer(), "examplemod");
}

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /生成并下载 ZIP/);
assert.match(html, /未支持/);
assert.match(html, /lang="zh-CN"/);
assert.match(html, /id="lang-en"/);
assert.match(html, /<select id="base"/);
assert.doesNotMatch(html, /type="radio"/);
assert.match(html, /data-i18n="base.group.maintained"|data-i18n="base.title"/);

const state = defaultFormState();
assert.equal(hasErrors(validateForm(state)), false);
state.modId = "Nope";
assert.equal(validateForm(state).modId, "error.modId");
state.modId = "examplemod";
state.mavenGroup = "cn.example.class";
assert.equal(validateForm(state).mavenGroup, "error.mavenKeyword");
state.mavenGroup = "cn.example.examplemod";
assert.equal(validateForm(state, ["1.20.1"]).base, undefined);
assert.equal(validateForm({ ...state, base: "1.12.2" }, ["1.20.1"]).base, "error.baseMissing:1.12.2");

const dimensions = pngDimensions(Uint8Array.from(Buffer.from(TINY_PNG, "base64")));
assert.deepEqual(dimensions, { width: 2, height: 1 });
assert.match(translateWarning("Icon is not square (2x1); square icons are recommended.", "zh"), /不是正方形/);
assert.match(translateWarning("Icon is not square (2x1); square icons are recommended.", "en"), /not square/i);
assert.equal(t("en", "generate.button"), "Generate and download ZIP");
assert.equal(t("zh", "base.group.maintained"), "维护底模");
assert.equal(t("en", "base.group.official"), "Arch official");
assert.equal(t("en", "curse.note").includes("Not supported"), true);
assert.equal(resolveApiBase("/arch-template/", ""), "/arch-template/api");
assert.equal(resolveApiBase("/arch-template/", "https://example.test/arch-template/api/"), "https://example.test/arch-template/api");
assert.equal(allowOriginFor("https://pages.example"), undefined);

const options = toGenerateOptions({
  ...defaultFormState(),
  dependencies: [{ project: "hex-casting", title: "Hex Casting", depType: "required" }],
});
assert.equal(options.dependencies[0]?.version, undefined);
assert.equal("path" in (options.icon ?? {}), false);

const parsed = parsePresetJson({
  ...defaultFormState(),
  kotlin: true,
  recipes: { hexdoc: true, hexCastingAddon: false },
  dependencies: [{ source: "modrinth", project: "hex-casting", version: "0.11.4", depType: "required" }],
  mirrors: { enabled: true, preset: "cn-campus" },
  icon: { enabled: true, path: "./icon.png" },
});
assert.equal(parsed.ok, true);
if (parsed.ok) assert.ok(parsed.notices.includes("notice.iconPathCli"));

assert.equal(shimFileURLToPath(new URL("https://example.com/templates")), "/templates");
assert.equal(encodeWarnings(["你好"]).length > 0, true);

const app = createNodeApp();

const health = await app.fetch(new Request("http://127.0.0.1/api/health"));
assert.equal(health.status, 200);
const basesResponse = await app.fetch(new Request("http://127.0.0.1/arch-template/api/bases"));
assert.equal(basesResponse.status, 200);
const bases = await basesResponse.json() as Array<{ id: string; kind: string; dir?: string }>;
assert.equal(bases.find((base) => base.id === "1.20.1")?.kind, "custom");
assert.equal(bases.find((base) => base.id === "1.21.1")?.kind, "custom");
for (const id of OFFICIAL_BASES) {
  assert.equal(bases.find((base) => base.id === id)?.kind, "arch-official", id);
}
assert.equal(bases.some((base) => base.id === "1.20.1" && base.kind === "arch-official"), false);
assert.equal(bases.some((base) => "dir" in base), false);

const presetsResponse = await handleApi(new Request("http://127.0.0.1/api/presets"));
assert.ok(presetsResponse);
const presets = await presetsResponse.json() as Array<{ id: string }>;
for (const id of ["plain-1.20.1-kt", "hex-addon-1.20.1-kt", "plain-1.21.1-java"]) {
  assert.ok(presets.some((preset) => preset.id === id), id);
}

const presetResponse = await app.fetch(new Request("http://127.0.0.1/arch-template/api/presets/plain-1.20.1-kt"));
assert.equal(presetResponse.status, 200);
const preset = await presetResponse.json() as { modId: string; base: string; kotlin: boolean };
assert.equal(preset.modId, "examplemod");
assert.equal(preset.base, "1.20.1");
assert.equal(preset.kotlin, true);

const generated = await app.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(preset),
}));
await readZipResponse(generated);

const bad = await app.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...preset, modId: "Nope" }),
}));
assert.equal(bad.status, 400);
const badBody = await bad.json() as { error: string; detail: string };
assert.match(badBody.error, /模组 ID/);
assert.match(translateEngineError(badBody.detail, "en"), /Mod ID/);

const officialZip = await app.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://pages.example" },
  body: JSON.stringify({ ...preset, base: "1.18.2" }),
}));
assert.equal(officialZip.status, 200, await officialZip.clone().text());
assert.equal(officialZip.headers.get("access-control-allow-origin"), null);
const officialArchive = await JSZip.loadAsync(await officialZip.arrayBuffer());
const officialProps = await officialArchive.file("examplemod/gradle.properties")?.async("string");
assert.match(officialProps ?? "", /minecraft_version=1\.18\.2/);

process.env.CORS_ORIGIN = "https://pages.example,https://tools.xm1221.cn";
const allowed = await app.fetch(new Request("http://127.0.0.1/api/health", {
  headers: { Origin: "https://pages.example" },
}));
assert.equal(allowed.headers.get("access-control-allow-origin"), "https://pages.example");
const denied = await app.fetch(new Request("http://127.0.0.1/api/health", {
  headers: { Origin: "https://evil.example" },
}));
assert.equal(denied.headers.get("access-control-allow-origin"), null);
delete process.env.CORS_ORIGIN;

const pathIcon = await app.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...preset, icon: { enabled: true, path: "/etc/passwd" } }),
}));
assert.equal(pathIcon.status, 400);

const iconZip = await app.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...preset, icon: { enabled: true, base64: TINY_PNG } }),
}));
assert.equal(iconZip.status, 200);
const iconWarnings = JSON.parse(Buffer.from(iconZip.headers.get("X-Arch-Template-Warnings") ?? "", "base64").toString("utf8")) as string[];
assert.ok(iconWarnings.some((warning) => /not square/i.test(warning)));
const iconArchive = await JSZip.loadAsync(await iconZip.arrayBuffer());
const iconBytes = await iconArchive.file("examplemod/common/src/main/resources/assets/examplemod/icon.png")?.async("uint8array");
assert.ok(iconBytes && iconBytes[0] === 0x89);

const curse = await app.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ...preset,
    dependencies: [{ source: "curseforge", project: "jei" }],
  }),
}));
assert.equal(curse.status, 400);
assert.match(((await curse.json()) as { error: string }).error, /CurseForge|Modrinth/);

const embedded = await embedFilesystem();
assert.ok(embedded.files > 10);
const vfs = await import("../worker/shims/vfs.ts");
assert.equal(vfs.toVirtualKey("/workspace/web/dist-worker/../templates"), "templates");
assert.equal(vfs.toVirtualKey("https-host/presets/plain-1.20.1-kt.json"), "presets/plain-1.20.1-kt.json");
const entries = await vfs.readdir("/templates", { withFileTypes: true });
const names = entries.map((entry) => (typeof entry === "string" ? entry : entry.name));
assert.ok(names.includes("1.20.1"));
assert.ok(names.includes("arch-official"));
const templateJson = await vfs.readFile("/templates/1.20.1/template.json", "utf8");
assert.match(String(templateJson), /1\.20\.1/);

const bundle = await buildWorkerBundle(resolve(fileURLToPath(new URL("..", import.meta.url)), "dist-worker/index.js"));
const worker = await import(`${pathToFileURL(bundle).href}?t=${Date.now()}`);
const workerPreset = await worker.default.fetch(new Request("http://127.0.0.1/arch-template/api/presets/plain-1.20.1-kt"), {});
assert.equal(workerPreset.status, 200);
const workerOptions = await workerPreset.json();
const workerZip = await worker.default.fetch(new Request("http://127.0.0.1/arch-template/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(workerOptions),
}), {});
await readZipResponse(workerZip);

const workerBases = await worker.default.fetch(new Request("http://127.0.0.1/api/bases"), {});
assert.equal(workerBases.status, 200);
const workerBaseList = await workerBases.json() as Array<{ id: string; kind: string }>;
assert.equal(workerBaseList.find((base) => base.id === "1.19.2")?.kind, "arch-official");
for (const id of OFFICIAL_BASES) {
  assert.equal(workerBaseList.find((base) => base.id === id)?.kind, "arch-official", id);
}
const workerOfficial = await worker.default.fetch(new Request("http://127.0.0.1/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...workerOptions, base: "1.16.5" }),
}), {});
assert.equal(workerOfficial.status, 200, await workerOfficial.clone().text());
const workerOfficialZip = await JSZip.loadAsync(await workerOfficial.arrayBuffer());
const workerProps = await workerOfficialZip.file("examplemod/gradle.properties")?.async("string");
assert.match(workerProps ?? "", /minecraft_version=1\.16\.5/);

console.log("web smoke ok");
