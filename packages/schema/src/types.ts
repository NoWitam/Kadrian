/**
 * Document types, derived from the JSON Schema so that they cannot drift (D17).
 * All of them are deeply read-only: a document is a value, and an edit produces
 * a new document. Names avoid the DOM globals `Node` and `Animation`.
 */
import type {
  animationSchema,
  assetSchema,
  audioClipSchema,
  backgroundNodeSchema,
  captionsNodeSchema,
  clipTransitionSchema,
  compositionSchema,
  customHtmlNodeSchema,
  easingSchema,
  effectSchema,
  groupNodeSchema,
  imageNodeSchema,
  maskSchema,
  matteSchema,
  sceneNodeSchema,
  sceneSchema,
  sceneTransitionSchema,
  shapeFillSchema,
  shapeGeometrySchema,
  shapeNodeSchema,
  shapeStrokeSchema,
  shapeTrimSchema,
  pathCommandSchema,
  templateBindingSchema,
  templateConditionSchema,
  templateFieldSchema,
  templateFieldValueSchema,
  templateInputSchema,
  templateRepeatSchema,
  templateSchema,
  textAnimationSchema,
  textNodeSchema,
  textStyleSchema,
  videoNodeSchema,
} from './composition-schema.js';
import type { Infer } from './json-schema.js';

export type Composition = Infer<typeof compositionSchema>;

/**
 * Marks a composition that `validateComposition` has accepted (specification
 * Q17). The brand exists in the type system only and emits no code.
 *
 * It is a declared class with a private member rather than a unique-symbol
 * property on purpose: a private member does not survive an object spread, so
 * `{ ...composition, durationUs: 1 }` is a plain `Composition` again and has to
 * be validated again. `Readonly<>` and `Object.freeze` strip the brand as well,
 * which fails closed. The guarantee is static only: a type assertion or a type
 * predicate could forge it, so ESLint rejects both outside `validate.ts`.
 */
declare class ValidatedBrand {
  private readonly validated: true;
}

/** A composition accepted by `validateComposition`; the only document type the runtime accepts. */
export type ValidatedComposition = Composition & ValidatedBrand;

export type Asset = Infer<typeof assetSchema>;
export type Scene = Infer<typeof sceneSchema>;
export type SceneNode = Infer<typeof sceneNodeSchema>;
export type BackgroundNode = Infer<typeof backgroundNodeSchema>;
export type GroupNode = Infer<typeof groupNodeSchema>;
export type ImageNode = Infer<typeof imageNodeSchema>;
export type TextNode = Infer<typeof textNodeSchema>;
export type VideoNode = Infer<typeof videoNodeSchema>;
export type CustomHtmlNode = Infer<typeof customHtmlNodeSchema>;
/** A vector shape: a geometry, filled, stroked, and trimmed (D73). */
export type ShapeNode = Infer<typeof shapeNodeSchema>;
/** What a shape draws, in composition pixels of its box (D73). */
export type ShapeGeometry = Infer<typeof shapeGeometrySchema>;
/** One absolute command of the path of a shape (D73). */
export type PathCommand = Infer<typeof pathCommandSchema>;
/** What the inside of a shape is painted with (D73). */
export type ShapeFill = Infer<typeof shapeFillSchema>;
/** The outline of a shape (D73). */
export type ShapeStroke = Infer<typeof shapeStrokeSchema>;
/** The part of the outline of a shape its stroke draws, in per mille (D73). */
export type ShapeTrim = Infer<typeof shapeTrimSchema>;
/** Captions from a transcription: timed words in a style (D57). */
export type CaptionsNode = Infer<typeof captionsNodeSchema>;
/** One timed word of a captions node (D57). */
export type CaptionWord = CaptionsNode['words'][number];
/** How a captions node shows its words (D57, D70). */
export type CaptionStyle = CaptionsNode['style'];
/** What the word being spoken shows besides the other words (D70). */
export type CaptionHighlight = CaptionStyle['highlight'];
/** How every page of a captions node enters or leaves, or none (D70). */
export type CaptionPageAnimation = CaptionStyle['pageIn'];
/** The safe area of a composition, from each edge of the canvas (D70). */
export type SafeArea = Composition['safeArea'];
export type NodeAnimation = Infer<typeof animationSchema>;
/** One keyframe of an animation: its time, its value, and the easing of the segment it starts (D67). */
export type AnimationKeyframe = NodeAnimation['keyframes'][number];
/** How a segment of an animation or a transition moves from its start to its end (D67). */
export type Easing = Infer<typeof easingSchema>;
export type AudioClip = Infer<typeof audioClipSchema>;
/** One effect of a node, a group, or a scene: a CSS or an SVG filter with its animated parameters (D71, D72). */
export type Effect = Infer<typeof effectSchema>;
/** The kind of an effect (D71). */
export type EffectKind = Effect['kind'];
/** An animation of one parameter of an effect (D65.1, D71). */
export type EffectAnimation = Effect['animations'][number];

/** What masks a node: nothing, a shape, or an image, with its animations (D75). */
export type Mask = Infer<typeof maskSchema>;
/** An animation of the geometry or the feather of a mask (D75). */
export type MaskAnimation = Extract<Mask, { kind: 'shape' }>['animations'][number];
/** Which sibling shape mattes a node, and how (D75). */
export type Matte = Infer<typeof matteSchema>;
/** How a node blends with what lies below it (D75). */
export type BlendMode = ImageNode['blendMode'];

/** How an image or a video meets its box (D50). */
export type Fit = ImageNode['fit'];
/** The point of an image or a video that its fit keeps in place, in per mille (D63). */
export type Focus = ImageNode['focus'];
/** What is cut away of the picture of an image or a video, in per mille from each edge (D68). */
export type Crop = ImageNode['crop'];
/** The point of a node's box that its scale and rotation are about, in per mille (D68). */
export type Origin = ImageNode['origin'];
/** The property an animation targets: a row of the table of D65.1 (D68). */
export type AnimatedProperty = NodeAnimation['property'];
/** The outline, the shadow, and the box of a text node (D69). */
export type TextStyle = Infer<typeof textStyleSchema>;
/** An animation of the letters, words, or lines of a text node, one after another (D69). */
export type TextAnimation = Infer<typeof textAnimationSchema>;
/** One track of a text animation: one property of every fragment, in its own time (D69). */
export type FragmentTrack = TextAnimation['tracks'][number];
/** What a fragment of a text animation is (D69). */
export type FragmentUnit = TextAnimation['unit'];
export type SceneTransition = Infer<typeof sceneTransitionSchema>;
export type ClipTransition = Infer<typeof clipTransitionSchema>;
/** How a transition combines its two sides, between scenes and between clips alike (D56, D66). */
export type TransitionEffect = SceneTransition['effect'];
/** How a transition between two scenes combines them (D56, D66). */
export type SceneTransitionEffect = TransitionEffect;
/** How a transition between two clips combines them: every effect of a scene transition since 0.11 (D66). */
export type ClipTransitionEffect = ClipTransition['effect'];
/** The direction of a slide, a wipe, or a push (D56, D66). */
export type TransitionDirection = Extract<SceneTransitionEffect, { kind: 'wipe' }>['direction'];
/** The template section of a composition (D58): empty in a composition that is no template. */
export type Template = Infer<typeof templateSchema>;
/** One input of a template: an ID, a type, constraints, and a default (D58.1). */
export type TemplateInput = Infer<typeof templateInputSchema>;
/** The type of an input (D58.1). */
export type TemplateInputType = TemplateInput['type'];
/** One field of the items of a list input (D58.1). */
export type TemplateField = Infer<typeof templateFieldSchema>;
/** The value of one field of one item of a list default, as the document stores it (D58.1). */
export type TemplateFieldValue = Infer<typeof templateFieldValueSchema>;
/**
 * Where the value of an input goes — a property, the placeholders of a text,
 * or an asset — or that of a field of the items of a list (D58.2, D59.3).
 */
export type TemplateBinding = Infer<typeof templateBindingSchema>;
/** A test of an input that keeps or removes a scene or a node (D59.1). */
export type TemplateCondition = Infer<typeof templateConditionSchema>;
/** One copy of a scene or a node for each item of a list (D59.2). */
export type TemplateRepeat = Infer<typeof templateRepeatSchema>;
