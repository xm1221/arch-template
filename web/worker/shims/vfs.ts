import { Buffer } from "node:buffer";
import embeddedFiles from "../embedded-fs.generated.json";

const files = embeddedFiles as Record<string, string>;
const decoded = new Map<string, Buffer>();

function assertReady(): void {
  if (Object.keys(files).length === 0) {
    throw new Error(
      "arch-template worker filesystem is empty. From web/, run `npm run embed` before building the worker.",
    );
  }
}

function ioError(code: string, message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

/** Map any absolute path that contains /templates or /presets onto the embedded tree. */
export function toVirtualKey(inputPath: string): string | null {
  const norm = inputPath.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  let bestIndex = -1;
  let best: string | null = null;
  for (const root of ["templates", "presets"]) {
    let from = 0;
    while (from < norm.length) {
      const index = norm.indexOf(root, from);
      if (index === -1) break;
      const beforeOk = index === 0 || norm[index - 1] === "/";
      const after = norm[index + root.length];
      const afterOk = after === undefined || after === "/";
      if (beforeOk && afterOk && index >= bestIndex) {
        bestIndex = index;
        best = norm.slice(index);
      }
      from = index + root.length;
    }
  }
  return best;
}

function asPath(path: unknown): string {
  if (typeof path === "string") return path;
  if (path instanceof URL) return path.pathname;
  throw ioError("ERR_INVALID_ARG_TYPE", "path must be a string");
}

function bytesFor(key: string): Buffer {
  const cached = decoded.get(key);
  if (cached) return cached;
  const encoded = files[key];
  if (encoded === undefined) {
    throw ioError("ENOENT", `ENOENT: no such file or directory, '${key}'`);
  }
  const buffer = Buffer.from(encoded, "base64");
  decoded.set(key, buffer);
  return buffer;
}

export class VirtualDirent {
  name: string;
  private kind: "file" | "dir";

  constructor(name: string, kind: "file" | "dir") {
    this.name = name;
    this.kind = kind;
  }

  isDirectory(): boolean {
    return this.kind === "dir";
  }

  isFile(): boolean {
    return this.kind === "file";
  }

  isSymbolicLink(): boolean {
    return false;
  }
}

function directoryKeys(dirKey: string): { dirs: Set<string>; fileNames: Set<string> } {
  const prefix = `${dirKey}/`;
  const dirs = new Set<string>();
  const fileNames = new Set<string>();
  for (const key of Object.keys(files)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) fileNames.add(rest);
    else dirs.add(rest.slice(0, slash));
  }
  for (const dir of dirs) fileNames.delete(dir);
  return { dirs, fileNames };
}

export function isVirtualDirectory(key: string): boolean {
  if (files[key] !== undefined) return false;
  const prefix = `${key}/`;
  return Object.keys(files).some((entry) => entry.startsWith(prefix));
}

function requireKey(path: string): string {
  assertReady();
  const key = toVirtualKey(path);
  if (!key) throw ioError("ENOENT", `ENOENT: no such file or directory, '${path}'`);
  if (files[key] === undefined && !isVirtualDirectory(key)) {
    throw ioError("ENOENT", `ENOENT: no such file or directory, '${path}'`);
  }
  return key;
}

type ReadOptions = string | { encoding?: string | null } | null | undefined;

function encodingOf(options: ReadOptions): BufferEncoding | null {
  if (typeof options === "string") return options as BufferEncoding;
  if (options && typeof options === "object" && options.encoding) return options.encoding as BufferEncoding;
  return null;
}

export function readFileSync(path: unknown, options?: ReadOptions): string | Buffer {
  const key = requireKey(asPath(path));
  if (isVirtualDirectory(key)) throw ioError("EISDIR", `EISDIR: illegal operation on a directory, '${key}'`);
  const buffer = bytesFor(key);
  const encoding = encodingOf(options);
  return encoding ? buffer.toString(encoding) : buffer;
}

export async function readFile(path: unknown, options?: ReadOptions): Promise<string | Buffer> {
  return readFileSync(path, options);
}

export function statSync(path: unknown): { isDirectory: () => boolean; isFile: () => boolean } {
  const key = requireKey(asPath(path));
  const directory = isVirtualDirectory(key);
  return {
    isDirectory: () => directory,
    isFile: () => !directory,
  };
}

export async function stat(path: unknown): Promise<{ isDirectory: () => boolean; isFile: () => boolean }> {
  return statSync(path);
}

export async function readdir(
  path: unknown,
  options?: { withFileTypes?: boolean },
): Promise<string[] | VirtualDirent[]> {
  const key = requireKey(asPath(path));
  if (!isVirtualDirectory(key)) throw ioError("ENOTDIR", `ENOTDIR: not a directory, '${key}'`);
  const { dirs, fileNames } = directoryKeys(key);
  if (options?.withFileTypes) {
    return [
      ...[...dirs].sort().map((name) => new VirtualDirent(name, "dir")),
      ...[...fileNames].sort().map((name) => new VirtualDirent(name, "file")),
    ];
  }
  return [...dirs, ...fileNames].sort();
}
