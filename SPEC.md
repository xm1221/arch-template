# arch-template — core SPEC (v0)

Target path on site: `tools.xm1221.cn/arch-template` (this repo = **engine + templates**, not final marketing UI).

## Goals
Generate a downloadable Architectury dual-platform Minecraft mod project ZIP from options + optional Modrinth deps + optional CN maven mirrors + named presets.

## Non-goals (this milestone)
- Polished React/Vue UI (UI-Helper later)
- CurseForge API (stub interface only)
- Hand-maintaining custom bases for every MC version (only 1.20.1 + 1.21.1 are custom; other versions use vendored Architectury official templates as bases)

## Base templates (maintained)
1. **1.20.1** Fabric+Forge, derived from FallingColors/hexdummy (Copier source of MieHex:Revolution), cleaned:
   - empty Actions / no business code
   - hexdoc pattern stub `required = false` if hexdoc included as optional recipe
   - keep: `libs.versions.toml`, convention-plugin style (simplified OK), Architectury common/fabric/forge
2. **1.21.1** Fabric+NeoForge (not legacy Forge), same “easy compat” conventions
3. Other MC versions: **do not hand-maintain** custom trees. The generator **must ingest** Architectury official templates ([architectury/architectury-templates](https://github.com/architectury/architectury-templates) or their published generator ZIP) as additional bases under `templates/arch-official/<mc-version>/` (vendored snapshot preferred for offline/CI; optional fetch+cache later). Then apply the **same** rename / modId / kotlin / Modrinth deps / CN mirrors / presets pipeline so the user always downloads a ready project from us. **Never** only link users to Arch templates.

## Options the engine must accept (JSON)
```json
{
  "displayName": "MyMod",
  "modId": "mymod",
  "mavenGroup": "cn.example.mymod",
  "modVersion": "0.1.0",
  "base": "1.20.1" | "1.21.1" | "<other-mc e.g. 1.19.2>"  // other → arch-official tree if present
  "kotlin": true,
  "recipes": { "hexdoc": false, "hexCastingAddon": false },
  "dependencies": [
    { "source": "modrinth", "project": "hex-casting", "version": "<version number or id>", "depType": "required" }
  ],
  "mirrors": { "enabled": false, "preset": "cn-campus" | "none" },
  "presetId": optional string,
  "icon": optional { "pngBase64": "..." } | omitted
}
```

## Core modules to implement
1. **validate** — modId regex `^[a-z][a-z0-9_]*$`, package/group sanity
2. **template store** — `templates/1.20.1/` and `templates/1.21.1/` (minimal but buildable skeleton; placeholders like `__MOD_ID__`, `__MAVEN_GROUP__`, `__DISPLAY_NAME__`, `__PACKAGE_PATH__`). Plus `templates/arch-official/<mc>/` for other versions: vendor a cleaned Architectury official template (normalize to same placeholders where feasible). `listBases()` returns custom + arch-official entries. Script or docs under `scripts/` for refreshing arch-official vendors.
3. **apply** — rename paths + string replace placeholders; toggle Kotlin files vs Java stubs
4. **modrinth** — fetch project/version via `https://api.modrinth.com/v2`; emit Gradle:
   - prefer author Maven coords when known (e.g. Hex Casting → BlameJared / hexxy style) via a small **coord override map**
   - else `maven.modrinth:<slug>:<version>` + exclusiveContent Modrinth repo
   - also emit fabric.mod.json / mods.toml / neoforge depends snippets when files exist
5. **mirrors** — optional `gradle/init-mirrors.gradle` or documented `dependencyResolutionManagement` snippet for CN mirrors (Aliyun/Tencent/Huawei/BFSU) for mavenCentral + plugin portal only; never blindly mirror Forge/Fabric exclusive repos
6. **presets** — `presets/*.json` examples: `plain-1.20.1-kt`, `hex-addon-1.20.1-kt`, `plain-1.21.1-java`
7. **zip** — Node API `generateZip(options) => Buffer` + CLI `node dist/cli.js --config opts.json -o out.zip`
8. **tests** — at least: validate modId; placeholder replace; MR URL builder / override map; zip contains `settings.gradle.kts` and replaced modId

## Stack
- TypeScript (Node 20+), zero or minimal deps (prefer `jszip` + `undici`/fetch)
- Library-first: `src/index.ts` exports; thin CLI
- No secrets in repo

## Reference behaviour (read-only inspiration)
- MieHex:Revolution `buildSrc/.../java.gradle.kts` repositories + `gradle/libs.versions.toml`
- hexdummy Copier answers pattern (`.copier-answers.yml`)
- Modrinth Maven: group `maven.modrinth`, module = slug/id, version = version number or id

## Done when
- `npm test` (or node --test) passes
- CLI can emit a zip for `plain-1.20.1-kt` preset
- README documents JSON options, presets, arch-official ingestion for other MC versions, and that UI is separate
- At least a stub or one vendored `templates/arch-official/` example + code path that applies transforms to it (full multi-version matrix can be incomplete)


## Optional mod icon
- Options may include `icon`: omit = keep template default/placeholder; or supply PNG (path for CLI, or base64 for library API).
- When provided, write the platform icon file the base expects (usually `icon.png`, wired in `fabric.mod.json` / `mods.toml` / neoforge mods.toml).
- Validate PNG; soft limit ~512KB; prefer square (document, don't hard-fail).
