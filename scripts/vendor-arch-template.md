# Vendoring Architectury official templates

Maintained custom bases: `templates/1.20.1`, `templates/1.21.1`.

For **other** Minecraft versions, ingest Architectury official templates so users still download a ready project from us (never “just a link”).

## Steps

1. Clone or download https://github.com/architectury/architectury-templates (or run their generator for the target MC version).
2. Copy the dual-platform tree into `templates/arch-official/<mc-version>/`.
3. Normalize to placeholders: `__MOD_ID__`, `__PACKAGE_NAME__`, `__PACKAGE_PATH__`, `__DISPLAY_NAME__`, `__MOD_VERSION__`, `__MOD_CLASS__`.
4. Add `template.json` (see `templates/1.20.1/template.json`).
5. Ensure `icon.png` matches fabric.mod.json / mods.toml.
6. Run `npm test` and generate a zip against the new base.

Prefer vendored snapshots for CI/offline; fetch+cache can come later.
