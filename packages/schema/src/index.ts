/**
 * @kadrion/schema — JSON Schema, TypeScript types, validation, migrations.
 *
 * Schema 0.2, as decided by D13–D17 and D42: the one version this build
 * validates (D35.1). The schema of 0.1 and the forward migration live behind the
 * entry point `@kadrion/schema/migrate`, so that the render page, which imports
 * this entry only, carries neither (D21, D42.8).
 */
export { compositionSchema, SCHEMA_VERSION } from './composition-schema.js';
export type { ValidationError, ValidationErrorCode, ValidationResult } from './errors.js';
export { frameCount, frameToTimeUs, timeUsToFrame } from './frame-grid.js';
export type {
  Asset,
  AudioClip,
  BackgroundNode,
  Composition,
  CustomHtmlNode,
  GroupNode,
  ImageNode,
  NodeAnimation,
  Scene,
  SceneNode,
  TextNode,
  ValidatedComposition,
} from './types.js';
export { validateComposition } from './validate.js';
