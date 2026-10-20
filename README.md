# arch-template

Core engine + base templates for an Architectury dual-platform Minecraft mod project generator, hosted at `tools.xm1221.cn/arch-template`.

The web UI lives in [`web/`](web/README.md). It is a Vite form (Chinese by default, English toggle saved in `localStorage`) plus a thin API that calls `generateZip` (local Node server, Cloudflare Worker or Pages Functions, and a GitHub Pages static build that calls the Worker through `VITE_GENERATE_API`). Card copy for the tools.xm1221.cn aggregator is in [`web/SITE.md`](web/SITE.md). The sections below are the engine contract.

## Web UI

```bash
npm run build
cd web && npm install && npm run dev
```

Open `http://127.0.0.1:5173/arch-template/`. Deploy steps are in `web/README.md`.

## Features

- Maintained bases: **1.20.1** (Fabric+Forge), **1.21.1** (Fabric+NeoForge)
- Other MC versions: **ingest** Architectury official templates under `templates/arch-official/<mc>/`, then run the same rename / deps / mirrors / icon / presets pipeline (never “just link”)
- Optional Kotlin, optional hexdoc recipe (`required = false` pattern stub), optional Hex Casting addon recipe
- Modrinth dependencies with a small **coord override** map (Hex Casting → `at.petra-k.hexcasting` + hexxy/BlameJared)
- Optional CN campus Maven mirrors (Central + plugin portal only)
- Optional mod **icon** (PNG path or base64, ≤512KB; non-square warns)

See `SPEC.md` for the full contract.

## Quick start

```bash
npm install
npm test
npm run build
npm run generate -- --preset plain-1.20.1-kt -o /tmp/examplemod.zip
npm run generate -- --list-bases
npm run generate -- --config presets/plain-1.21.1-java.json -o /tmp/java.zip --icon /path/to/icon.png
```

Library API:

```ts
import { generateZip, loadPreset } from "arch-template";

const options = await loadPreset("plain-1.20.1-kt");
const { buffer, warnings } = await generateZip(options);
```

## Options JSON

```json
{
  "displayName": "MyMod",
  "modId": "mymod",
  "mavenGroup": "cn.example.mymod",
  "modVersion": "0.1.0",
  "base": "1.20.1",
  "kotlin": true,
  "recipes": { "hexdoc": false, "hexCastingAddon": false },
  "dependencies": [
    { "source": "modrinth", "project": "hex-casting", "version": "0.11.4", "depType": "required" }
  ],
  "mirrors": { "enabled": false, "preset": "cn-campus" },
  "icon": { "enabled": true, "path": "./icon.png" }
}
```

`icon.base64` / `icon.pngBase64` are accepted for API use. Prefer a **square** PNG; non-square is allowed with a warning. Over 512KB fails.

## Presets

| File | Notes |
|------|--------|
| `presets/plain-1.20.1-kt.json` | Empty Kotlin mod on 1.20.1 |
| `presets/hex-addon-1.20.1-kt.json` | hexdoc + Hex Casting dep + CN mirrors |
| `presets/plain-1.21.1-java.json` | Java / Fabric+NeoForge |

## Arch-official bases

`node scripts/vendor-arch-official.mjs` vendors the Architectury `*-forge-fabric` versions that are not already maintained bases. The web dropdown reads `listBases()`: maintained **1.21.1** and **1.20.1**, then official **1.19.4, 1.19.3, 1.19.2, 1.19, 1.18.2, 1.18.1, 1.17.1, 1.16.5**. See `scripts/vendor-arch-template.md`.

## Known gaps

- Maintained **1.20.1** and **1.21.1** bases are real Loom projects and are smoke-built from generated output. The vendored `arch-official` entries remain normalized skeletons with per-version pins.
- CurseForge is stubbed.
- Modrinth maven metadata id is guessed from slug when no coord override exists.
- Upstream `architectury-templates` has no 1.21+ NeoForge generator entry. 1.21.1 is the maintained Fabric+NeoForge base.
