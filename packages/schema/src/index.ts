/**
 * @kadrion/schema — JSON Schema, TypeScript types, validation, migrations.
 *
 * Schema 0.4, as decided by D13–D17, D42, D50, and D52: the one version this build
 * validates (D35.1). The schemas of 0.1 and 0.2 and the forward migration live behind the
 * entry point `@kadrion/schema/migrate`, so that the render page, which imports
 * this entry only, carries neither (D21, D42.8).
 */
export { audioPlan } from './audio-plan.js';
export type { AudioPlan, AudioPlanEntry } from './audio-plan.js';
export { compositionSchema, SCHEMA_VERSION } from './composition-schema.js';
export type { ValidationError, ValidationErrorCode, ValidationResult } from './errors.js';
export { frameCount, frameToTimeUs, timeUsToFrame } from './frame-grid.js';
export {
  sampledSourceRange,
  sourceDurationUs,
  sourceFrameIndex,
  sourceRangeFits,
  sourceTimeUs,
} from './source-frame.js';
export type { SourceMapping, SourceRange, TimeBase } from './source-frame.js';
export type {
  Asset,
  AudioClip,
  BackgroundNode,
  Composition,
  CustomHtmlNode,
  Fit,
  GroupNode,
  ImageNode,
  NodeAnimation,
  Scene,
  SceneNode,
  TextNode,
  ValidatedComposition,
  VideoNode,
} from './types.js';
export { validateComposition } from './validate.js';
