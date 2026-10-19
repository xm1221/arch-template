/** Same-origin `${base}api`, unless a static host sets VITE_GENERATE_API. */
export function resolveApiBase(baseUrl: string, generateApi: string | undefined): string {
  const configured = (generateApi ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  const prefix = (baseUrl || "/").replace(/\/$/, "");
  return `${prefix}/api`;
}
