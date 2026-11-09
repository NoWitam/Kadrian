/**
 * @kadrion/schema — JSON Schema, TypeScript types, validation, migrations.
 *
 * Schema 0.17, as decided by D13–D17, D42, D50, D52, D54, D56, D57, D58, D59, D63, D66, D67,
 * D68, D69, D70, D71, and D72: the one version this build validates (D35.1). The schemas of 0.1 to 0.16 and the forward migration live behind
 * the entry point `@kadrion/schema/migrate`, and the instantiation of a template behind
 * `@kadrion/schema/template`, so that the render page, which imports this entry only, carries
 * none of them (D21, D42.8, D58.4, D59.4).
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
export { isTemplate } from './template-values.js';
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
  AnimatedProperty,
  AnimationKeyframe,
  Asset,
  AudioClip,
  BackgroundNode,
  CaptionHighlight,
  CaptionPageAnimation,
  CaptionStyle,
  CaptionsNode,
  CaptionWord,
  Composition,
  ClipTransition,
  ClipTransitionEffect,
  Crop,
  CustomHtmlNode,
  Easing,
  Effect,
  EffectAnimation,
  EffectKind,
  Fit,
  Focus,
  FragmentTrack,
  FragmentUnit,
  GroupNode,
  ImageNode,
  NodeAnimation,
  Origin,
  SafeArea,
  Scene,
  SceneNode,
  SceneTransition,
  SceneTransitionEffect,
  Template,
  TemplateBinding,
  TemplateCondition,
  TemplateField,
  TemplateFieldValue,
  TemplateInput,
  TemplateInputType,
  TemplateRepeat,
  TextAnimation,
  TextNode,
  TextStyle,
  TransitionDirection,
  TransitionEffect,
  ValidatedComposition,
  VideoNode,
} from './types.js';
export { validateComposition } from './validate.js';
