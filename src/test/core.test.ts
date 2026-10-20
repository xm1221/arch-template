import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { validateModId, validateOptions, ValidationError } from "../validate.js";
import { applyPlaceholders, buildPlaceholderMap, expandPlaceholders } from "../apply.js";
import { resolveCoordOverride, hexCastingModules, modrinthMavenModule } from "../coords.js";
import { buildGradleDeps } from "../modrinth.js";
import { resolveIconBytes } from "../icon.js";
import { listBases, resolveBaseDir } from "../templates.js";
import { generateZip, loadPreset } from "../generate.js";
import type { GenerateOptions } from "../options.js";

async function withHexCastingApi<T>(run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/project/hex-casting")) {
      return new Response(
        JSON.stringify({
          id: "hexcasting-project",
          slug: "hex-casting",
          title: "Hex Casting",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/version/0.11.4")) {
      return new Response(
        JSON.stringify({
          id: "hexcasting-0.11.4",
          project_id: "hexcasting-project",
          version_number: "0.11.4",
          game_versions: ["1.20.1"],
          loaders: ["fabric", "forge"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected network request in test: ${url}`);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("validate", () => {
  it("accepts a normal modId", () => {
    validateModId("hexconstruct");
  });

  it("rejects bad modIds", () => {
    assert.throws(() => validateModId("Hex"), ValidationError);
    assert.throws(() => validateModId("1abc"), ValidationError);
    assert.throws(() => validateModId("has-dash"), ValidationError);
  });
});

describe("placeholders", () => {
  it("replaces modId and package path", () => {
    const opts: GenerateOptions = {
      displayName: "My Mod",
      modId: "mymod",
      mavenGroup: "cn.example.mymod",
      modVersion: "0.1.0",
      base: "1.20.1",
      kotlin: true,
    };
    const map = buildPlaceholderMap(opts);
    assert.equal(map.__MOD_ID__, "mymod");
    assert.equal(map.__PACKAGE_PATH__, "cn/example/mymod");
    assert.equal(expandPlaceholders("id=__MOD_ID__", map), "id=mymod");
    assert.equal(applyPlaceholders("__PACKAGE_NAME__", opts), "cn.example.mymod");
  });
});

describe("coords", () => {
  it("overrides hex-casting to petra-k modules", () => {
    const override = resolveCoordOverride({ slug: "hex-casting", title: "Hex Casting" }, "1.20.1");
    assert.ok(override);
    assert.equal(override!.modules.common, "at.petra-k.hexcasting:hexcasting-common-1.20.1");
    assert.ok(override!.repositories.some((r) => r.includes("hexxy.media")));
    const modules = hexCastingModules("1.20.1");
    assert.equal(modules.fabric, "at.petra-k.hexcasting:hexcasting-fabric-1.20.1");
    assert.equal(modrinthMavenModule("sodium"), "maven.modrinth:sodium");
  });

  it("buildGradleDeps uses override for hex-casting", () => {
    const plan = buildGradleDeps(
      { id: "x", slug: "hex-casting", title: "Hex Casting" },
      { id: "v", project_id: "x", version_number: "0.11.4" },
      { minecraftVersion: "1.20.1", depType: "required" },
    );
    assert.ok(plan.dependencies.common[0].includes("at.petra-k.hexcasting"));
    assert.ok(plan.repositories.some((r) => r.includes("hexxy.media")));
  });

  it("does not emit dependencies for unsupported platforms", () => {
    const plan = buildGradleDeps(
      { id: "fabric-only", slug: "fabric-only", title: "Fabric Only" },
      {
        id: "version",
        project_id: "fabric-only",
        version_number: "1.0.0",
        loaders: ["fabric"],
      },
      {
        minecraftVersion: "1.20.1",
        platforms: ["fabric", "forge"],
      },
    );
    assert.equal(plan.dependencies.fabric.length, 1);
    assert.equal(plan.dependencies.forge.length, 0);
    assert.equal(plan.dependencies.common.length, 0);
    assert.deepEqual(plan.metadata[0]?.platforms, ["fabric"]);
    assert.ok(plan.warnings.some((warning) => /does not support forge/i.test(warning)));
  });
});

describe("templates", () => {
  it("lists custom and arch-official bases", async () => {
    const bases = await listBases();
    const ids = bases.map((b) => b.id);
    assert.ok(ids.includes("1.20.1"));
    assert.ok(ids.includes("1.21.1"));
    assert.ok(ids.includes("1.19.2"));
    const arch = bases.find((b) => b.id === "1.19.2");
    assert.equal(arch?.kind, "arch-official");
    const custom = await resolveBaseDir("1.20.1");
    assert.equal(custom.kind, "custom");
  });

  it("rejects preset path traversal", async () => {
    await assert.rejects(loadPreset("../plain-1.20.1-kt"), ValidationError);
    await assert.rejects(loadPreset("..\\plain-1.20.1-kt"), ValidationError);
  });
});

describe("icon", () => {
  it("accepts tiny PNG base64 and warns on non-square", async () => {
    // 2x1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGPwmnDzPwgDABXjBWXIaz9tAAAAAElFTkSuQmCC",
      "base64",
    );
    const result = await resolveIconBytes({ enabled: true, base64: png.toString("base64") });
    assert.ok(result.bytes);
    assert.ok(result.warnings.some((w) => /not square/i.test(w)));
  });
});

describe("generateZip", () => {
  it("emits zip for plain-1.20.1-kt with settings and modId", async () => {
    const opts = await loadPreset("plain-1.20.1-kt");
    const { buffer, warnings } = await generateZip(opts);
    assert.ok(buffer.length > 100);
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    assert.ok(names.some((n) => n.endsWith("settings.gradle")));
    const settings = await zip.file("examplemod/settings.gradle")!.async("string");
    assert.match(settings, /rootProject\.name = "examplemod"/);
    assert.ok(names.some((n) => n.includes("examplemod") && n.endsWith(".kt")));
    assert.ok(!names.some((n) => n.includes("/src/main/java/") && n.endsWith(".java")));
    assert.ok(!names.some((n) => n.startsWith("examplemod/doc/")));
    void warnings;
  });

  it("places custom icon when provided", async () => {
    const opts = await loadPreset("plain-1.20.1-kt");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPwmnDzPwAFjgKz/dXYLgAAAABJRU5ErkJggg==",
      "base64",
    );
    opts.icon = { enabled: true, base64: png.toString("base64") };
    const { buffer } = await generateZip(opts);
    const zip = await JSZip.loadAsync(buffer);
    const icon = zip.file("examplemod/common/src/main/resources/assets/examplemod/icon.png");
    assert.ok(icon);
    const bytes = await icon!.async("nodebuffer");
    assert.equal(bytes[0], 0x89);
  });

  it("generates from arch-official 1.19.2", async () => {
    const opts: GenerateOptions = {
      displayName: "Arch Stub",
      modId: "archstub",
      mavenGroup: "cn.example.archstub",
      modVersion: "0.1.0",
      base: "1.19.2",
      kotlin: false,
    };
    const { buffer } = await generateZip(opts);
    const zip = await JSZip.loadAsync(buffer);
    const settings = await zip.file("archstub/settings.gradle")!.async("string");
    assert.match(settings, /archstub/);
    assert.ok(Object.keys(zip.files).some((n) => n.endsWith(".java")));
  });

  it("escapes displayName in JSON and TOML metadata", async () => {
    const opts = await loadPreset("plain-1.20.1-kt");
    opts.displayName = 'Quote "Mod" \\ Path';
    const { buffer } = await generateZip(opts);
    const zip = await JSZip.loadAsync(buffer);
    const lang = await zip
      .file("examplemod/common/src/main/resources/assets/examplemod/lang/en_us.json")!
      .async("string");
    assert.equal(JSON.parse(lang)["mod.examplemod"], opts.displayName);
    const modsToml = await zip
      .file("examplemod/forge/src/main/resources/META-INF/mods.toml")!
      .async("string");
    assert.match(modsToml, /displayName = "Quote \\"Mod\\" \\\\ Path"/);
  });
});

describe("gradle completeness", () => {
  it("1.20.1 zip includes runClient via loom fabric/forge setup and wrapper URL", async () => {
    const opts = await loadPreset("plain-1.20.1-kt");
    const { buffer } = await generateZip(opts);
    const zip = await JSZip.loadAsync(buffer);
    const fabric = await zip.file("examplemod/fabric/build.gradle")!.async("string");
    const forge = await zip.file("examplemod/forge/build.gradle")!.async("string");
    assert.match(fabric, /platformSetupLoomIde/);
    assert.match(fabric, /fabric\(\)/);
    assert.match(forge, /forge\(\)/);
    assert.match(forge, /sourcesJar\s*\{[\s\S]*duplicatesStrategy = DuplicatesStrategy\.EXCLUDE/);
    // Explicit loom runs — Gradle task runClient / IDE "Fabric Client"
    assert.match(fabric, /runs\s*\{[\s\S]*client\s*\{/);
    assert.match(fabric, /setConfigName\("Fabric Client"\)/);
    assert.match(forge, /setConfigName\("Forge Client"\)/);
    assert.match(forge, /"file": \[jarVersion: project\.version\]/);
    assert.doesNotMatch(fabric, /placeholder/i);
    const wrapper = await zip.file("examplemod/gradle/wrapper/gradle-wrapper.properties")!.async("string");
    assert.match(wrapper, /services\.gradle\.org\/distributions\/gradle-8\.13-bin\.zip/);
    assert.ok(zip.file("examplemod/gradlew"));
  });

  it("tencent gradle wrapper mirror rewrites distributionUrl", async () => {
    const opts = await loadPreset("plain-1.20.1-kt");
    opts.mirrors = { enabled: false, preset: "none", gradleWrapper: "tencent" };
    const { buffer } = await generateZip(opts);
    const zip = await JSZip.loadAsync(buffer);
    const wrapper = await zip.file("examplemod/gradle/wrapper/gradle-wrapper.properties")!.async("string");
    assert.match(wrapper, /mirrors\.cloud\.tencent\.com\/gradle\/gradle-8\.13-bin\.zip/);
  });

  it("hex-addon preset injects Hex Casting into fabric/forge gradle deps", async () => {
    const opts = await loadPreset("hex-addon-1.20.1-kt");
    const { buffer } = await withHexCastingApi(() => generateZip(opts));
    const zip = await JSZip.loadAsync(buffer);
    const common = await zip.file("hexexample/common/build.gradle")!.async("string");
    const fabric = await zip.file("hexexample/fabric/build.gradle")!.async("string");
    const forge = await zip.file("hexexample/forge/build.gradle")!.async("string");
    assert.match(common, /hexcasting-common-1\.20\.1/);
    assert.match(fabric, /hexcasting-fabric-1\.20\.1/);
    assert.match(forge, /hexcasting-forge-1\.20\.1/);
    const root = await zip.file("hexexample/build.gradle")!.async("string");
    assert.match(root, /maven\.hexxy\.media|maven\.blamejared\.com/);
    const fabricMod = await zip.file("hexexample/fabric/src/main/resources/fabric.mod.json")!.async("string");
    assert.match(fabricMod, /hexcasting/);
  });
});

