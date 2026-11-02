/**
 * @kadrion/schema — JSON Schema, TypeScript types, validation, migrations.
 *
 * Schema 0.6, as decided by D13–D17, D42, D50, D52, D54, and D56: the one version this build
 * validates (D35.1). The schemas of 0.1 to 0.5 and the forward migration live behind the
 * entry point `@kadrion/schema/migrate`, so that the render page, which imports
 * this entry only, carries neither (D21, D42.8).
 */
export { audioPlan } from './audio-plan.js';
export type { AudioPlan, AudioPlanEntry } from './audio-plan.js';
export { compositionSchema, SCHEMA_VERSION } from './composition-schema.js';
export type { ValidationError, ValidationErrorCode, ValidationResult } from './errors.js';
export {
  placedVideos,
  scenePlacements,
  scenesAt,
  sceneTransitionAt,
  videoSceneTimeUs,
} from './scenes.js';
export type {
  PlacedVideo,
  SceneInstant,
  ScenePlacement,
  SceneSequence,
  SceneSpan,
  TransitionInstant,
  TransitionSpan,
} from './scenes.js';
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
  ClipTransition,
  ClipTransitionEffect,
  CustomHtmlNode,
  Fit,
  GroupNode,
  ImageNode,
  NodeAnimation,
  Scene,
  SceneNode,
  SceneTransition,
  SceneTransitionEffect,
  TextNode,
  TransitionDirection,
  ValidatedComposition,
  VideoNode,
} from './types.js';
export { validateComposition } from './validate.js';
