/**
 * @kadrion/runtime — deterministic state evaluation, layout, interpolation.
 *
 * The evaluation core: the state of a composition at `timeUs` (D18, D19). It
 * knows no DOM, no layout, no assets, and no frame grid, and it reads no clock:
 * the host supplies `timeUs` (D20). Rendering the state is the job of
 * `@kadrion/renderer-dom`. Beside it, the audio plan: what is heard of a
 * composition, from the document alone (D52.4).
 */
export { AUDIO_SAMPLE_RATE, audioLayout, audioPlan, sampleAt } from './audio.js';
export type { AudioLayout, AudioPlan, AudioPlanEntry, SampleFade, SoundLayout } from './audio.js';
export { captionAt, captionFragments, captionPages, captionsInPieces } from './captions.js';
export type { CaptionInstant, CaptionLine, CaptionPage } from './captions.js';
export { EvaluationError } from './errors.js';
export type { EvaluationErrorCode } from './errors.js';
export { effectsAt } from './effects.js';
export { evaluateComposition } from './evaluate.js';
export { fragmentSteps, textFragments } from './fragments.js';
export { UNICODE_VERSION } from './grapheme-table.js';
export { graphemes, isWhiteSpace, textLayout } from './graphemes.js';
export type { TextLayout, TextLine, TextRun, TextWord } from './graphemes.js';
export type {
  AmountEffectState,
  BackgroundNodeState,
  BlurEffectState,
  CaptionFragmentsState,
  CaptionsNodeState,
  Circle,
  ClipTransitionSide,
  ClipTransitionState,
  CompositionState,
  CropState,
  DropShadowEffectState,
  EffectState,
  EffectsState,
  FragmentState,
  GroupNodeState,
  Hole,
  HueRotateEffectState,
  ImageNodeState,
  Inset,
  LeafNodeState,
  LeafNodeType,
  LifetimeState,
  NodeState,
  PictureState,
  SceneState,
  SceneTransitionState,
  Size,
  TextFragmentsState,
  TextNodeState,
  TransformState,
  Vec2,
  VideoNodeState,
  Zoom,
} from './state.js';
