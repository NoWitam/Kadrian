/**
 * @kadrion/runtime — deterministic state evaluation, layout, interpolation.
 *
 * The evaluation core: the state of a composition at `timeUs` (D18, D19). It
 * knows no DOM, no layout, no assets, and no frame grid, and it reads no clock:
 * the host supplies `timeUs` (D20). Rendering the state is the job of
 * `@kadrion/renderer-dom`. Beside it, the audio plan: what is heard of a
 * composition, from the document alone (D52.4), and the lines measured from
 * the font (D83): the metrics a host or the load step reads from a font's
 * bytes, the lines of a text in its frame and of captions broken by width,
 * and `frameLayout`, which places them for a host's overlay. They are also
 * the entry `@kadrion/runtime/text-frame`.
 */
export { AUDIO_SAMPLE_RATE, audioLayout, audioPlan, sampleAt } from './audio.js';
export type { AudioLayout, AudioPlan, AudioPlanEntry, SampleFade, SoundLayout } from './audio.js';
export { captionAt, captionFragments, captionPages, captionsInPieces } from './captions.js';
export type { CaptionInstant, CaptionLine, CaptionPage } from './captions.js';
export { EvaluationError } from './errors.js';
export type { EvaluationErrorCode } from './errors.js';
export { compositingAt, maskAt } from './compositing.js';
export { effectsAt } from './effects.js';
export { evaluateComposition } from './evaluate.js';
export { fragmentSteps, textFragments } from './fragments.js';
export { UNICODE_VERSION } from './grapheme-table.js';
export { graphemes, isWhiteSpace, textLayout } from './graphemes.js';
export {
  advanceOf,
  captionPagesByWidth,
  fitsWidth,
  fontMetrics,
  FontMetricsError,
  frameLayout,
  measuredFontIds,
  measureText,
  textLines,
  textLinesFitHeight,
  textLinesHeight,
  unitsToPixels,
} from './text-frame.js';
export type {
  CaptionFrameLine,
  CaptionsFrameInput,
  FontMetrics,
  FontMetricsErrorCode,
  FrameAlign,
  FrameLayout,
  FrameLine,
  FrameVerticalAlign,
  MeasuredLine,
  TextFrameInput,
} from './text-frame.js';
export type { TextLayout, TextLine, TextRun, TextWord } from './graphemes.js';
export type {
  AmountEffectState,
  BackgroundNodeState,
  BlurEffectState,
  CaptionFragmentsState,
  CaptionsNodeState,
  ChromaKeyEffectState,
  Circle,
  ClipTransitionSide,
  ClipTransitionState,
  ColorGradeEffectState,
  CompositingState,
  CompositionState,
  CropState,
  CurvesEffectState,
  DropShadowEffectState,
  EffectState,
  EffectsState,
  FragmentState,
  GlowEffectState,
  GroupNodeState,
  Hole,
  HueRotateEffectState,
  ImageNodeState,
  InstanceNodeState,
  Inset,
  LeafNodeState,
  LeafNodeType,
  LifetimeState,
  MaskState,
  MatteState,
  NodeState,
  PathCommandState,
  PictureState,
  SceneState,
  SceneTransitionState,
  ShapeFillState,
  ShapeNodeState,
  ShapeStrokeState,
  Size,
  SvgEffectState,
  TextFragmentsState,
  TextNodeState,
  TransformState,
  TrimState,
  Vec2,
  VideoNodeState,
  VignetteEffectState,
  Zoom,
} from './state.js';
