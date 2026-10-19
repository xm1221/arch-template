/**
 * fileURLToPath that also accepts http(s) module URLs.
 * Workers sometimes expose import.meta.url as an https URL. Node's
 * fileURLToPath throws on those, which would stop generateZip from finding
 * the embedded templates. Pathnames are what the virtual filesystem matches.
 */

export function fileURLToPath(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input) : input;
  if (url.protocol !== "file:" && url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError(`Unsupported URL protocol: ${url.protocol}`);
  }
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the raw pathname when it is not valid encoding.
  }
  if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1);
  return pathname;
}

export function pathToFileURL(path: string): URL {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(`file://${normalized}`);
}

export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
