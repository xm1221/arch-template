import { readFile } from "node:fs/promises";
import type { IconOptions } from "./options.js";

export const MAX_ICON_BYTES = 512 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ResolvedIcon {
  /** null means "keep the template placeholder icon". */
  bytes: Buffer | null;
  warnings: string[];
}

function decodeBase64(value: string): Buffer {
  const raw = value.replace(/^data:[^;,]+;base64,/i, "").trim();
  if (raw === "") {
    throw new Error("icon.base64 is empty");
  }
  return Buffer.from(raw, "base64");
}

function assertPng(bytes: Buffer, source: string): void {
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error(`${source} is not a PNG (missing PNG magic bytes)`);
  }
  if (bytes.length > MAX_ICON_BYTES) {
    throw new Error(
      `${source} is ${bytes.length} bytes; the icon size limit is ${MAX_ICON_BYTES} bytes (512KB)`,
    );
  }
}

function readDimensions(bytes: Buffer): { width: number; height: number } | null {
  // PNG signature (8) + IHDR length (4) + "IHDR" (4) => width at 16, height at 20.
  if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Resolve an optional icon. Returns `bytes: null` when no icon was supplied
 * (or icon.enabled is false), in which case the template placeholder stays.
 */
export async function resolveIconBytes(icon?: IconOptions): Promise<ResolvedIcon> {
  const warnings: string[] = [];
  if (!icon || icon.enabled === false) {
    return { bytes: null, warnings };
  }

  const base64 = icon.base64 ?? icon.pngBase64;
  const hasPath = typeof icon.path === "string" && icon.path.trim() !== "";
  const hasBase64 = typeof base64 === "string" && base64.trim() !== "";

  if (hasPath && hasBase64) {
    throw new Error("icon: provide only one of path or base64/pngBase64");
  }
  if (!hasPath && !hasBase64) {
    warnings.push(
      "icon.enabled is true but neither path nor base64 was provided; keeping the template placeholder icon.",
    );
    return { bytes: null, warnings };
  }

  const source = hasPath ? `icon path "${icon.path}"` : "icon base64";
  const bytes = hasPath
    ? await readFile(icon.path as string)
    : decodeBase64(base64 as string);

  assertPng(bytes, source);

  const dimensions = readDimensions(bytes);
  if (dimensions && dimensions.width !== dimensions.height) {
    warnings.push(
      `Icon is not square (${dimensions.width}x${dimensions.height}); square icons are recommended.`,
    );
  }

  return { bytes, warnings };
}
