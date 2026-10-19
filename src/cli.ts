#!/usr/bin/env node
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateZip, loadPreset } from "./generate.js";
import type { GenerateOptions } from "./options.js";
import { listBases } from "./templates.js";

function usage(): never {
  console.error(`Usage:
  arch-template --preset <id> -o <out.zip>
  arch-template --config <opts.json> -o <out.zip>
  arch-template --list-bases

Options:
  --preset <id>     Load presets/<id>.json
  --config <path>   Load a GenerateOptions JSON file
  --icon <png>      Set icon.enabled + icon.path
  -o, --output      Output zip path (required for generate)
  --list-bases      Print available template bases
`);
  process.exit(2);
}

async function main(argv: string[]): Promise<void> {
  const args = [...argv];
  let preset: string | undefined;
  let configPath: string | undefined;
  let output: string | undefined;
  let iconPath: string | undefined;
  let listOnly = false;

  while (args.length) {
    const a = args.shift()!;
    switch (a) {
      case "--preset":
        preset = args.shift();
        break;
      case "--config":
        configPath = args.shift();
        break;
      case "--icon":
        iconPath = args.shift();
        break;
      case "-o":
      case "--output":
        output = args.shift();
        break;
      case "--list-bases":
        listOnly = true;
        break;
      case "-h":
      case "--help":
        usage();
      default:
        console.error(`Unknown argument: ${a}`);
        usage();
    }
  }

  if (listOnly) {
    const bases = await listBases();
    for (const b of bases) {
      console.log(`${b.id}\t${b.kind}\t${b.meta.platforms.join(",")}\t${b.dir}`);
    }
    return;
  }

  if (!output) {
    console.error("Missing -o/--output");
    usage();
  }

  let options: GenerateOptions;
  if (preset) {
    options = await loadPreset(preset);
  } else if (configPath) {
    options = JSON.parse(await readFile(resolve(configPath), "utf8")) as GenerateOptions;
  } else {
    console.error("Provide --preset or --config");
    usage();
  }

  if (iconPath) {
    options.icon = { enabled: true, path: resolve(iconPath) };
  }

  const result = await generateZip(options);
  await writeFile(resolve(output), result.buffer);
  for (const w of result.warnings) {
    console.warn(`warning: ${w}`);
  }
  console.log(`Wrote ${resolve(output)} (${result.buffer.length} bytes)`);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
