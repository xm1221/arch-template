export type {
  GenerateOptions,
  GenerateResult,
  IconOptions,
  DependencyOptions,
  MirrorsOptions,
  RecipesOptions,
  TemplateMeta,
} from "./options.js";

export { validateOptions, validateModId, validateMavenGroup, ValidationError, MOD_ID_PATTERN } from "./validate.js";
export {
  applyPlaceholders,
  buildPlaceholderMap,
  expandPlaceholders,
  applyConditionals,
  toClassName,
} from "./apply.js";
export { resolveCoordOverride, hexCastingModules, COORD_OVERRIDES, modrinthMavenModule } from "./coords.js";
export {
  fetchProject,
  fetchVersion,
  buildGradleDeps,
  fetchCurseForgeProject,
} from "./modrinth.js";
export {
  buildInitMirrorsGradle,
  resolveGradleDistributionUrl,
  escapeGradleDistributionUrl,
  DEFAULT_GRADLE_VERSION,
} from "./mirrors.js";
export { resolveIconBytes, MAX_ICON_BYTES } from "./icon.js";
export { listBases, resolveBaseDir, DEFAULT_TEMPLATES_ROOT } from "./templates.js";
export { generateZip, loadPreset } from "./generate.js";
