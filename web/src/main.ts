import { ApiError, fetchBases, fetchModrinthVersions, fetchPreset, fetchPresets, requestZip, searchModrinth } from "./api";
import { readLang, t, translateCode, translateEngineError, translateWarning, writeLang, type Lang } from "./i18n";
import {
  MAX_ICON_BYTES,
  PRESET_ORDER,
  bytesToBase64,
  compareVersions,
  defaultFormState,
  hasErrors,
  isPng,
  parsePresetJson,
  pngDimensions,
  toGenerateOptions,
  validateForm,
} from "./model";
import type {
  BaseInfo,
  DependencyType,
  FieldErrors,
  FormState,
  ModrinthHit,
  ModrinthVersionChoice,
  PresetSummary,
} from "./types";

const DEP_TYPES: DependencyType[] = ["required", "optional", "incompatible", "embedded"];

const PRESET_COPY: Record<string, { title: string; detail: string }> = {
  "plain-1.20.1-kt": { title: "preset.plain.title", detail: "preset.plain.detail" },
  "hex-addon-1.20.1-kt": { title: "preset.hex.title", detail: "preset.hex.detail" },
  "plain-1.21.1-java": { title: "preset.java.title", detail: "preset.java.detail" },
};

let lang: Lang = readLang();
let state: FormState = defaultFormState();
let mavenTouched = false;
let bases: BaseInfo[] = [];
let basesReady = false;
let basePhase: "loading" | "ready" | "empty" | "fail" = "loading";
let baseErrorKey = "api.offline";
let presets: PresetSummary[] | null = null;
let presetFailed = false;
let lastHits: ModrinthHit[] = [];
let lastWarnings: string[] = [];
let fieldErrors: FieldErrors = {};
let lastDownloadUrl: string | undefined;
let searchNotice: { key: string; vars?: Record<string, string | number> } = { key: "deps.searchIdle" };

interface StatusState {
  kind: "idle" | "ok" | "err" | "busy";
  key?: string;
  vars?: Record<string, string | number>;
  codes?: string[];
  engine?: string;
  downloadName?: string;
}

let statusState: StatusState = { kind: "idle" };

interface VersionCache {
  status: "loading" | "ready" | "error";
  versions: ModrinthVersionChoice[];
  matched: boolean;
  errorKey?: string;
}

const versionCache = new Map<string, VersionCache>();

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const form = required<HTMLFormElement>("form");
const displayName = required<HTMLInputElement>("displayName");
const modId = required<HTMLInputElement>("modId");
const mavenGroup = required<HTMLInputElement>("mavenGroup");
const modVersion = required<HTMLInputElement>("modVersion");
const kotlin = required<HTMLInputElement>("kotlin");
const hexdoc = required<HTMLInputElement>("hexdoc");
const hexCastingAddon = required<HTMLInputElement>("hexCastingAddon");
const mirrors = required<HTMLInputElement>("mirrors");
const presetList = required<HTMLDivElement>("preset-list");
const presetStatus = required<HTMLParagraphElement>("preset-status");
const baseSelect = required<HTMLSelectElement>("base");
const baseDetail = required<HTMLParagraphElement>("base-detail");
const baseStatus = required<HTMLParagraphElement>("base-status");
const searchInput = required<HTMLInputElement>("search-input");
const searchStatus = required<HTMLParagraphElement>("search-status");
const searchResults = required<HTMLDivElement>("search-results");
const depList = required<HTMLDivElement>("dep-list");
const iconFile = required<HTMLInputElement>("icon-file");
const iconClear = required<HTMLButtonElement>("icon-clear");
const iconPreview = required<HTMLDivElement>("icon-preview");
const iconMeta = required<HTMLParagraphElement>("icon-meta");
const iconWarning = required<HTMLParagraphElement>("icon-warning");
const generateButton = required<HTMLButtonElement>("generate-button");
const statusEl = required<HTMLDivElement>("status");
const warningsEl = required<HTMLUListElement>("warnings");
const jsonPreview = required<HTMLPreElement>("json-preview");
const importFile = required<HTMLInputElement>("import-file");

function localeTag(): string {
  return lang === "en" ? "en-US" : "zh-CN";
}

function platformLabel(platform: string): string {
  if (platform === "neoforge") return "NeoForge";
  if (platform === "fabric") return "Fabric";
  if (platform === "forge") return "Forge";
  return platform;
}

function baseIds(): string[] | undefined {
  return basesReady ? bases.map((base) => base.id) : undefined;
}

function failureKey(error: unknown, fallback: string): string {
  if (error instanceof ApiError && (error.status === 0 || error.message === "api.offline")) return "api.offline";
  return fallback;
}

function syncDepsFromDom(): void {
  for (const dependency of state.dependencies) {
    const version = depList.querySelector<HTMLSelectElement>(`[data-version="${CSS.escape(dependency.project)}"]`);
    const depType = depList.querySelector<HTMLSelectElement>(`[data-deptype="${CSS.escape(dependency.project)}"]`);
    if (version) dependency.version = version.value || undefined;
    if (depType && DEP_TYPES.includes(depType.value as DependencyType)) {
      dependency.depType = depType.value as DependencyType;
    }
  }
}

function syncFromDom(): void {
  state.displayName = displayName.value;
  state.modId = modId.value.trim();
  state.mavenGroup = mavenGroup.value.trim();
  state.modVersion = modVersion.value.trim();
  state.kotlin = kotlin.checked;
  state.hexdoc = hexdoc.checked;
  state.hexCastingAddon = hexCastingAddon.checked;
  state.mirrorsEnabled = mirrors.checked;
  if (baseSelect.value) state.base = baseSelect.value;
  syncDepsFromDom();
}

function setFieldError(id: string, message?: string): void {
  const el = document.getElementById(`${id}-error`);
  const input = document.getElementById(id);
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    input?.removeAttribute("aria-invalid");
    return;
  }
  el.hidden = false;
  el.textContent = message;
  input?.setAttribute("aria-invalid", "true");
}

function showErrors(errors: FieldErrors, focus = false): void {
  fieldErrors = errors;
  setFieldError("displayName", errors.displayName ? translateCode(lang, errors.displayName) : undefined);
  setFieldError("modId", errors.modId ? translateCode(lang, errors.modId) : undefined);
  setFieldError("mavenGroup", errors.mavenGroup ? translateCode(lang, errors.mavenGroup) : undefined);
  setFieldError("modVersion", errors.modVersion ? translateCode(lang, errors.modVersion) : undefined);
  setFieldError("base", errors.base ? translateCode(lang, errors.base) : undefined);
  setFieldError("dependencies", errors.dependencies ? translateCode(lang, errors.dependencies) : undefined);
  setFieldError("icon", errors.icon ? translateCode(lang, errors.icon) : undefined);
  const formError = required<HTMLParagraphElement>("form-error");
  formError.hidden = !errors.form;
  formError.textContent = errors.form ? translateCode(lang, errors.form) : "";
  if (!focus) return;
  const firstId = ["displayName", "modId", "mavenGroup", "modVersion", "base", "icon"].find((id) => {
    return Boolean(errors[id as keyof FieldErrors]);
  });
  if (firstId) document.getElementById(firstId)?.focus();
}

function clearFieldErrors(): void {
  showErrors({});
}

function renderStatus(): void {
  const parts: string[] = [];
  if (statusState.codes?.length) parts.push(...statusState.codes.map((code) => translateCode(lang, code)));
  if (statusState.engine) parts.push(translateEngineError(statusState.engine, lang));
  if (statusState.key) parts.push(t(lang, statusState.key, statusState.vars));
  const message = parts.filter(Boolean).join(" ");
  statusEl.className = `status${statusState.kind === "idle" ? "" : ` is-${statusState.kind}`}`;
  statusEl.replaceChildren(message ? document.createTextNode(message) : "");
  if (statusState.downloadName && lastDownloadUrl) {
    const link = document.createElement("a");
    link.href = lastDownloadUrl;
    link.download = statusState.downloadName;
    link.textContent = t(lang, "generate.save", { name: statusState.downloadName });
    statusEl.append(document.createTextNode(" "));
    statusEl.append(link);
  }
}

function setStatus(next: StatusState): void {
  statusState = next;
  renderStatus();
}

function offerDownload(blob: Blob, filename: string, next: StatusState): void {
  if (lastDownloadUrl) URL.revokeObjectURL(lastDownloadUrl);
  lastDownloadUrl = URL.createObjectURL(blob);
  setStatus({ ...next, downloadName: filename });
  const link = document.createElement("a");
  link.href = lastDownloadUrl;
  link.download = filename;
  link.click();
}

function highlightPreset(): void {
  for (const button of presetList.querySelectorAll<HTMLButtonElement>("[data-preset]")) {
    button.setAttribute("aria-pressed", button.dataset.preset === state.presetId ? "true" : "false");
  }
}

function refreshPreview(): void {
  syncFromDom();
  jsonPreview.textContent = `${JSON.stringify(toGenerateOptions(state), null, 2)}\n`;
}

function renderBaseDetail(): void {
  const base = bases.find((item) => item.id === state.base);
  if (!base) {
    baseDetail.textContent = "";
    return;
  }
  const kind = base.kind === "custom" ? t(lang, "base.kind.maintained") : t(lang, "base.kind.official");
  baseDetail.textContent = t(lang, "base.detail", {
    kind,
    platforms: base.platforms.map(platformLabel).join(" + "),
    java: base.java,
    arch: base.architectury,
  });
}

function renderBaseStatus(): void {
  if (basePhase === "fail") {
    baseStatus.textContent = t(lang, baseErrorKey);
    return;
  }
  const key = basePhase === "loading" ? "base.loading" : basePhase === "empty" ? "base.empty" : "base.ready";
  baseStatus.textContent = t(lang, key);
}

function renderBases(): void {
  const groups: Array<{ key: string; items: BaseInfo[] }> = [
    { key: "base.group.maintained", items: bases.filter((base) => base.kind === "custom") },
    { key: "base.group.official", items: bases.filter((base) => base.kind === "arch-official") },
  ];
  baseSelect.replaceChildren();
  for (const group of groups) {
    if (group.items.length === 0) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = t(lang, group.key);
    const ordered = [...group.items].sort((a, b) => compareVersions(b.id, a.id));
    for (const base of ordered) {
      const option = document.createElement("option");
      option.value = base.id;
      option.textContent = base.minecraft || base.id;
      option.selected = base.id === state.base;
      optgroup.append(option);
    }
    baseSelect.append(optgroup);
  }
  if (baseSelect.value) state.base = baseSelect.value;
  renderBaseDetail();
  renderBaseStatus();
}

function renderPresets(): void {
  presetList.replaceChildren();
  if (presetFailed) {
    presetStatus.textContent = t(lang, "preset.fail");
    return;
  }
  if (!presets) {
    presetStatus.textContent = t(lang, "preset.loading");
    return;
  }
  const ordered = [...presets].sort((a, b) => {
    const ai = PRESET_ORDER.indexOf(a.id);
    const bi = PRESET_ORDER.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.id.localeCompare(b.id, localeTag());
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  if (ordered.length === 0) {
    presetStatus.textContent = t(lang, "preset.empty");
    return;
  }
  for (const preset of ordered) {
    const copy = PRESET_COPY[preset.id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.dataset.preset = preset.id;
    button.setAttribute("aria-pressed", preset.id === state.presetId ? "true" : "false");
    const title = document.createElement("span");
    title.className = "choice-title";
    title.textContent = copy ? t(lang, copy.title) : preset.displayName || preset.id;
    const detail = document.createElement("span");
    detail.className = "choice-meta";
    detail.textContent = copy
      ? t(lang, copy.detail)
      : `${preset.base} · ${preset.kotlin ? "Kotlin" : "Java"}`;
    const idLine = document.createElement("span");
    idLine.className = "choice-id";
    idLine.textContent = preset.id;
    button.append(title, detail, idLine);
    button.addEventListener("click", () => { void applyPreset(preset.id); });
    presetList.append(button);
  }
  presetStatus.textContent = t(lang, "preset.hint");
}

function renderIcon(): void {
  iconPreview.replaceChildren();
  if (!state.icon) {
    const empty = document.createElement("span");
    empty.textContent = t(lang, "icon.none");
    iconPreview.append(empty);
    iconClear.hidden = true;
    iconMeta.textContent = t(lang, "icon.empty");
    iconWarning.hidden = true;
    iconWarning.textContent = "";
    return;
  }
  const image = document.createElement("img");
  image.alt = "";
  image.src = `data:image/png;base64,${state.icon.base64}`;
  iconPreview.append(image);
  iconClear.hidden = false;
  const sizeKb = Math.max(1, Math.ceil(state.icon.byteLength / 1024));
  if (state.icon.width && state.icon.height) {
    iconMeta.textContent = t(lang, "icon.meta", { width: state.icon.width, height: state.icon.height, size: sizeKb });
    if (state.icon.width !== state.icon.height) {
      iconWarning.hidden = false;
      iconWarning.textContent = t(lang, "icon.nonsquare");
    } else {
      iconWarning.hidden = true;
      iconWarning.textContent = "";
    }
  } else {
    iconMeta.textContent = t(lang, "icon.metaSize", { size: sizeKb });
    iconWarning.hidden = true;
  }
}

function renderDeps(): void {
  depList.replaceChildren();
  if (state.dependencies.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = t(lang, "deps.empty");
    depList.append(empty);
    return;
  }
  for (const dependency of state.dependencies) {
    const card = document.createElement("div");
    card.className = "dep";
    const head = document.createElement("div");
    head.className = "dep-head";
    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "hit-title";
    title.textContent = dependency.title || dependency.project;
    const slug = document.createElement("p");
    slug.textContent = dependency.project;
    titleWrap.append(title, slug);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.textContent = t(lang, "deps.remove");
    remove.addEventListener("click", () => {
      state.dependencies = state.dependencies.filter((item) => item.project !== dependency.project);
      state.presetId = undefined;
      highlightPreset();
      renderDeps();
      refreshPreview();
    });
    head.append(titleWrap, remove);

    const controls = document.createElement("div");
    controls.className = "dep-controls";
    const depType = document.createElement("select");
    depType.dataset.deptype = dependency.project;
    depType.setAttribute("aria-label", t(lang, "deps.typeLabel", { project: dependency.project }));
    for (const value of DEP_TYPES) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t(lang, `depType.${value}`);
      option.selected = value === dependency.depType;
      depType.append(option);
    }
    const version = document.createElement("select");
    version.dataset.version = dependency.project;
    version.setAttribute("aria-label", t(lang, "deps.versionLabel", { project: dependency.project }));
    const cache = versionCache.get(dependency.project);
    const latest = document.createElement("option");
    latest.value = "";
    latest.textContent = t(lang, "deps.latest");
    version.append(latest);
    if (!cache || cache.status === "loading") {
      const option = document.createElement("option");
      option.value = dependency.version ?? "";
      option.textContent = t(lang, "deps.loadingVersions");
      option.selected = true;
      version.append(option);
      version.disabled = true;
    } else if (cache.status === "error") {
      version.disabled = false;
    } else {
      const known = new Set(cache.versions.map((item) => item.versionNumber));
      if (dependency.version && !known.has(dependency.version)) {
        const extra = document.createElement("option");
        extra.value = dependency.version;
        extra.textContent = t(lang, "deps.presetVersion", { version: dependency.version });
        extra.selected = true;
        version.append(extra);
      }
      for (const item of cache.versions) {
        const option = document.createElement("option");
        option.value = item.versionNumber;
        const loaders = item.loaders.slice(0, 4).join(", ");
        option.textContent = loaders ? `${item.versionNumber} · ${item.versionType} · ${loaders}` : `${item.versionNumber} · ${item.versionType}`;
        option.selected = item.versionNumber === dependency.version;
        version.append(option);
      }
    }
    if (!dependency.version) latest.selected = true;
    controls.append(depType, version);

    card.append(head, controls);
    if (cache?.status === "error") {
      const note = document.createElement("p");
      note.className = "dep-note";
      note.textContent = t(lang, "deps.versionFailed", { message: t(lang, cache.errorKey ?? "deps.searchFail") });
      card.append(note);
    } else if (cache?.status === "ready" && !cache.matched) {
      const note = document.createElement("p");
      note.className = "dep-note";
      note.textContent = t(lang, "deps.versionMismatch");
      card.append(note);
    }
    depList.append(card);
  }
}

function renderHits(hits: ModrinthHit[]): void {
  lastHits = hits;
  searchResults.replaceChildren();
  for (const hit of hits) {
    const row = document.createElement("div");
    row.className = "hit";
    if (hit.iconUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = hit.iconUrl;
      row.append(image);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "hit-fallback";
      row.append(fallback);
    }
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "hit-title";
    title.textContent = hit.title;
    const description = document.createElement("p");
    description.textContent = hit.description || hit.slug;
    const meta = document.createElement("p");
    meta.textContent = t(lang, "deps.downloads", {
      slug: hit.slug,
      count: hit.downloads.toLocaleString(localeTag()),
    });
    text.append(title, description, meta);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "button-secondary";
    add.textContent = t(lang, "deps.add");
    add.addEventListener("click", () => addHit(hit));
    row.append(text, add);
    searchResults.append(row);
  }
}

function renderSearchStatus(): void {
  searchStatus.textContent = t(lang, searchNotice.key, searchNotice.vars);
}

function showWarnings(warnings: string[]): void {
  lastWarnings = warnings;
  warningsEl.replaceChildren();
  if (warnings.length === 0) {
    warningsEl.hidden = true;
    return;
  }
  warningsEl.hidden = false;
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = translateWarning(warning, lang);
    warningsEl.append(item);
  }
}

function applyStaticCopy(): void {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.title = t(lang, "app.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t(lang, "app.description"));
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(lang, key);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholder;
    if (key && "placeholder" in el) (el as HTMLInputElement).placeholder = t(lang, key);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute("aria-label", t(lang, key));
  }
  document.getElementById("lang-zh")?.setAttribute("aria-pressed", lang === "zh" ? "true" : "false");
  document.getElementById("lang-en")?.setAttribute("aria-pressed", lang === "en" ? "true" : "false");
  generateButton.textContent = t(lang, generateButton.dataset.busy === "1" ? "generate.busy" : "generate.button");
}

function applyLanguage(): void {
  applyStaticCopy();
  renderBases();
  renderPresets();
  renderDeps();
  renderIcon();
  renderHits(lastHits);
  renderSearchStatus();
  showErrors(fieldErrors);
  showWarnings(lastWarnings);
  renderStatus();
}

function setLanguage(next: Lang): void {
  if (next === lang) return;
  lang = next;
  writeLang(next);
  applyLanguage();
}

function writeForm(): void {
  displayName.value = state.displayName;
  modId.value = state.modId;
  mavenGroup.value = state.mavenGroup;
  modVersion.value = state.modVersion;
  kotlin.checked = state.kotlin;
  hexdoc.checked = state.hexdoc;
  hexCastingAddon.checked = state.hexCastingAddon;
  mirrors.checked = state.mirrorsEnabled;
  baseSelect.value = state.base;
  renderBaseDetail();
  clearFieldErrors();
  renderIcon();
}

async function ensureVersions(project: string): Promise<void> {
  versionCache.set(project, { status: "loading", versions: [], matched: true });
  renderDeps();
  try {
    const result = await fetchModrinthVersions(project, state.base);
    versionCache.set(project, { status: "ready", versions: result.versions, matched: result.matchedGameVersion });
    const dependency = state.dependencies.find((item) => item.project === project);
    if (dependency && !dependency.version && result.versions[0]) {
      dependency.version = result.versions[0].versionNumber;
    }
  } catch (error) {
    versionCache.set(project, {
      status: "error",
      versions: [],
      matched: false,
      errorKey: failureKey(error, "deps.searchFail"),
    });
  }
  renderDeps();
  refreshPreview();
}

function addHit(hit: ModrinthHit): void {
  if (state.dependencies.some((item) => item.project === hit.slug)) {
    searchNotice = { key: "deps.duplicate", vars: { name: hit.title } };
    renderSearchStatus();
    return;
  }
  state.dependencies.push({ project: hit.slug, title: hit.title, depType: "required" });
  state.presetId = undefined;
  highlightPreset();
  renderDeps();
  void ensureVersions(hit.slug);
}

async function runSearch(): Promise<void> {
  const query = searchInput.value.trim();
  if (query.length < 2) {
    searchNotice = { key: "deps.searchShort" };
    renderSearchStatus();
    renderHits([]);
    return;
  }
  searchNotice = { key: "deps.searching" };
  renderSearchStatus();
  try {
    const hits = await searchModrinth(query);
    renderHits(hits);
    searchNotice = hits.length === 0
      ? { key: "deps.searchEmpty", vars: { query } }
      : { key: "deps.searchFound", vars: { count: hits.length } };
  } catch (error) {
    searchNotice = { key: failureKey(error, "deps.searchFail") };
    renderHits([]);
  }
  renderSearchStatus();
}

async function applyPreset(id: string): Promise<void> {
  setStatus({ kind: "busy", key: "preset.busy" });
  try {
    const options = await fetchPreset(id);
    const parsed = parsePresetJson({ ...options, presetId: id });
    if (!parsed.ok) {
      setStatus({ kind: "err", key: parsed.error });
      return;
    }
    state = parsed.state;
    state.presetId = id;
    mavenTouched = true;
    versionCache.clear();
    writeForm();
    highlightPreset();
    renderDeps();
    refreshPreview();
    setStatus({
      kind: "ok",
      key: parsed.notices.length === 0 ? "preset.filled" : undefined,
      codes: parsed.notices,
    });
    for (const dependency of state.dependencies) void ensureVersions(dependency.project);
  } catch (error) {
    setStatus({ kind: "err", key: failureKey(error, "preset.fail") });
  }
}

form.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.id === "search-input") return;
  state.presetId = undefined;
  highlightPreset();
  refreshPreview();
});

form.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === "search-input" || target.id === "import-file" || target.id === "icon-file") return;
  state.presetId = undefined;
  highlightPreset();
  refreshPreview();
});

modId.addEventListener("input", () => {
  if (mavenTouched) return;
  const value = modId.value.trim();
  if (/^[a-z][a-z0-9_]*$/.test(value)) mavenGroup.value = `cn.example.${value}`;
});

mavenGroup.addEventListener("input", () => {
  mavenTouched = true;
});

baseSelect.addEventListener("change", () => {
  syncFromDom();
  versionCache.clear();
  renderBaseDetail();
  for (const dependency of state.dependencies) void ensureVersions(dependency.project);
});

required<HTMLButtonElement>("search-button").addEventListener("click", () => { void runSearch(); });
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void runSearch();
  }
});

required<HTMLButtonElement>("export-button").addEventListener("click", () => {
  syncFromDom();
  const errors = validateForm(state, baseIds());
  if (!basesReady) errors.form = "generate.basesLoading";
  if (hasErrors(errors)) {
    showErrors(errors, true);
    setStatus({ kind: "err", key: "preset.exportInvalid" });
    return;
  }
  clearFieldErrors();
  const options = toGenerateOptions(state);
  const filename = /^[a-z][a-z0-9_]*$/.test(options.modId) ? `${options.modId}-preset.json` : "arch-template-preset.json";
  const blob = new Blob([`${JSON.stringify(options, null, 2)}\n`], { type: "application/json" });
  offerDownload(blob, filename, { kind: "ok", key: "preset.exportOk", vars: { name: filename } });
});

required<HTMLButtonElement>("import-button").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (!file) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setStatus({ kind: "err", key: "preset.notJson" });
    return;
  }
  const result = parsePresetJson(parsed);
  if (!result.ok) {
    setStatus({ kind: "err", key: result.error });
    return;
  }
  state = result.state;
  mavenTouched = true;
  versionCache.clear();
  writeForm();
  highlightPreset();
  renderDeps();
  refreshPreview();
  setStatus({
    kind: "ok",
    key: result.notices.length === 0 ? "preset.imported" : undefined,
    codes: result.notices,
  });
  for (const dependency of state.dependencies) void ensureVersions(dependency.project);
});

iconFile.addEventListener("change", async () => {
  const file = iconFile.files?.[0];
  iconFile.value = "";
  if (!file) return;
  setFieldError("icon");
  if (file.size > MAX_ICON_BYTES) {
    showErrors({ ...fieldErrors, icon: "icon.tooBig" });
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPng(bytes)) {
    showErrors({ ...fieldErrors, icon: "icon.notPng" });
    return;
  }
  const dimensions = pngDimensions(bytes);
  state.icon = {
    base64: bytesToBase64(bytes),
    byteLength: bytes.length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
  state.presetId = undefined;
  highlightPreset();
  showErrors({ ...fieldErrors, icon: undefined });
  renderIcon();
  refreshPreview();
});

iconClear.addEventListener("click", () => {
  state.icon = null;
  state.presetId = undefined;
  highlightPreset();
  showErrors({ ...fieldErrors, icon: undefined });
  renderIcon();
  refreshPreview();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  syncFromDom();
  const errors = validateForm(state, baseIds());
  if (!basesReady) errors.form = "generate.basesLoading";
  if (hasErrors(errors)) {
    showErrors(errors, true);
    setStatus({ kind: "err", key: "generate.invalid" });
    return;
  }
  clearFieldErrors();
  showWarnings([]);
  generateButton.disabled = true;
  generateButton.dataset.busy = "1";
  generateButton.textContent = t(lang, "generate.busy");
  setStatus({ kind: "busy", key: "generate.working" });
  try {
    const result = await requestZip(toGenerateOptions(state));
    offerDownload(result.blob, result.filename, {
      kind: "ok",
      key: result.warnings.length > 0 ? "generate.downloadedWarnings" : "generate.downloaded",
      vars: { name: result.filename },
    });
    showWarnings(result.warnings);
  } catch (error) {
    if (error instanceof ApiError && error.detail) {
      setStatus({ kind: "err", engine: error.detail });
    } else {
      setStatus({ kind: "err", key: failureKey(error, "generate.fail") });
    }
  } finally {
    generateButton.dataset.busy = "0";
    generateButton.disabled = !basesReady || bases.length === 0;
    generateButton.textContent = t(lang, "generate.button");
  }
});

async function loadBases(): Promise<void> {
  try {
    bases = await fetchBases();
    basesReady = true;
    if (!bases.some((base) => base.id === state.base) && bases[0]) state.base = bases[0].id;
    basePhase = bases.length === 0 ? "empty" : "ready";
    renderBases();
    generateButton.disabled = bases.length === 0;
    refreshPreview();
  } catch (error) {
    basesReady = false;
    basePhase = "fail";
    baseErrorKey = failureKey(error, "base.empty");
    renderBaseStatus();
    generateButton.disabled = true;
  }
}

async function loadPresetList(): Promise<void> {
  try {
    presets = await fetchPresets();
    presetFailed = false;
  } catch {
    presets = null;
    presetFailed = true;
  }
  renderPresets();
}

document.getElementById("lang-zh")?.addEventListener("click", () => setLanguage("zh"));
document.getElementById("lang-en")?.addEventListener("click", () => setLanguage("en"));

writeForm();
applyLanguage();
refreshPreview();
void loadBases();
void loadPresetList();
