# arch-template

Core engine + base templates for an Architectury dual-platform Minecraft mod project generator (to be hosted at `tools.xm1221.cn/arch-template`).

**UI is out of scope** for this repo (a separate UI-Helper will call the library / Workers later).

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

See `scripts/vendor-arch-template.md`. A stub `templates/arch-official/1.19.2` proves the ingestion path.

## Known gaps

- Template Gradle files are **lean skeletons** (not a full Loom-ready copy of hexdummy); enough for rename/zip tests and further wiring.
- CurseForge is stubbed.
- Modrinth maven metadata id is guessed from slug when no coord override exists.
- Full multi-version Arch official matrix is not vendored yet — add under `templates/arch-official/` as needed.
