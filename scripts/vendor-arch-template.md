# Vendoring Architectury official templates

Maintained custom bases stay in `templates/1.20.1` and `templates/1.21.1`. The web dropdown lists those as 「维护底模」 / Maintained.

Other Minecraft versions that the official generator knows about are vendored under `templates/arch-official/<mc>/` and show up as 「Arch 官方模板」 / Arch official. The form still posts `base` to `generateZip`. It does not open an upstream link.

## Refresh

```bash
node scripts/vendor-arch-official.mjs
```

The script reads the version list from [architectury/architectury-templates](https://github.com/architectury/architectury-templates) `master` `generator.config.json`, entries named `<mc>-forge-fabric`. That file stops at 1.20.1. Maintained ids are not copied. 1.21+ NeoForge is not in that generator.

Each tree is the placeholder skeleton (same shape as `templates/arch-official/1.19.2`) with `template.json` pins for that Minecraft version. This is a normalized snapshot, not a byte-for-byte Loom export. Pins and the upstream key are recorded in each directory's README.

Currently vendored:

| id | upstream key |
| --- | --- |
| 1.16.5 | `1.16.5-forge-fabric` |
| 1.17.1 | `1.17.1-forge-fabric` |
| 1.18.1 | `1.18.1-forge-fabric` |
| 1.18.2 | `1.18.2-forge-fabric` |
| 1.19 | `1.19-forge-fabric` |
| 1.19.2 | `1.19.2-forge-fabric` |
| 1.19.3 | `1.19.3-forge-fabric` |
| 1.19.4 | `1.19.4-forge-fabric` |

After adding or refreshing a version, run `npm test` and `npm run web:smoke`. `listBases()` picks up every directory, so the dropdown follows the filesystem.
