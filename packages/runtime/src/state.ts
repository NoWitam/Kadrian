/**
 * The evaluated state of a composition at one instant (D19). It mirrors the
 * document: the evaluated scenes, nodes, and group children keep their order and hierarchy
 * (D16.4), and every value is local to its node (D15, D18.5, D42.3). Every
 * property an animation can reach is in the state, animated or not (D65.1,
 * D68); static properties such as text, fonts, and asset references stay in the
 * document, and a renderer walks the document and the state side by side.
 */

/** A pair of evaluated values. Unlike persisted coordinates, they may be fractional (D15). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Whether the node's own lifetime contains the instant (D42.2, D42.3). It is
 * local: a child's `active` does not depend on its group's. Whether a node is
 * shown is the renderer's matter, where an inactive group hides its children.
 */
export interface LifetimeState {
  readonly active: boolean;
}

/** The width and height of a box, in composition pixels; fractional while animated (D68). */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * What is cut away of the picture of an image or a video, in per mille of its
 * sides from each edge (D68); fractional while animated, two opposite insets
 * never adding up to more than 999.
 */
export interface CropState {
  readonly fromTop: number;
  readonly fromRight: number;
  readonly fromBottom: number;
  readonly fromLeft: number;
}

/** The animatable properties of a node after its animations were applied (D16.6, D68). */
export interface TransformState {
  /** Offset of the top-left corner of the node's box from the origin of its parent, in composition pixels. */
  readonly position: Vec2;
  /** Factors about the origin point, applied before the rotation. */
  readonly scale: Vec2;
  /** Degrees about the origin point, positive clockwise (D68). */
  readonly rotation: number;
  /** The point of the node's box that scale and rotation are about, in per mille of its sides (D68). */
  readonly origin: Vec2;
  /**
   * Not multiplied into children: a group is composited before its opacity
   * applies (D15). A clip transition's factor is part of it (D56).
   */
  readonly opacity: number;
}

export type LeafNodeType = 'image' | 'text' | 'custom-html' | 'video' | 'captions';

/** A blur of a Gaussian of standard deviation `radius`, in composition pixels (D71). */
export interface BlurEffectState {
  readonly id: string;
  readonly kind: 'blur';
  readonly radius: number;
}

/** A factor of brightness, contrast, or saturation, or an amount of grey, of the negative, or of sepia (D71). */
export interface AmountEffectState {
  readonly id: string;
  readonly kind: 'brightness' | 'contrast' | 'saturate' | 'grayscale' | 'invert' | 'sepia';
  readonly amount: number;
}

/** A turn of the hue, in degrees (D71). */
export interface HueRotateEffectState {
  readonly id: string;
  readonly kind: 'hue-rotate';
  readonly angle: number;
}

/** A drop shadow: its colour and opacity, its offset, and its blur radius in composition pixels (D71). */
export interface DropShadowEffectState {
  readonly id: string;
  readonly kind: 'drop-shadow';
  /** `#rrggbb`. */
  readonly color: string;
  readonly opacity: number;
  readonly offset: Vec2;
  readonly blur: number;
}

/** One effect at one instant, its parameters animated or not (D71). */
export type EffectState =
  BlurEffectState | AmountEffectState | HueRotateEffectState | DropShadowEffectState;

/**
 * The effects of a node, a group, or a scene at one instant, in the order they
 * apply (D71); empty for one without effects, which is drawn without a filter.
 */
export interface EffectsState {
  readonly effects: readonly EffectState[];
}

export interface BackgroundNodeState extends LifetimeState {
  readonly id: string;
  readonly type: 'background';
  /** `#rrggbb`, animated or not (D68). */
  readonly color: string;
}

/**
 * A node that can be a side of a clip transition (D56, D66). Its `transition`
 * is present only while a clip transition changes more of it than its
 * opacity, whose factor is part of `opacity`.
 */
export interface ClipTransitionSide {
  readonly transition?: ClipTransitionState;
}

export interface LeafNodeState<Type extends LeafNodeType = LeafNodeType>
  extends LifetimeState, TransformState, ClipTransitionSide {
  readonly id: string;
  readonly type: Type;
}

/**
 * One fragment of a text at one instant (D69): its opacity, an offset from its
 * place in the text, a scale and a rotation about its own centre, and the
 * colour of its glyphs. Values may be fractional, as every evaluated value.
 */
export interface FragmentState {
  /** A factor of the fragment's opacity, from 0 to 1, within the node's own. */
  readonly opacity: number;
  /** Composition pixels from the fragment's place in the text. */
  readonly offset: Vec2;
  /** Factors about the fragment's centre. */
  readonly scale: Vec2;
  /** Degrees about the fragment's centre, positive clockwise. */
  readonly rotation: number;
  /** `#rrggbb`: the text's colour, or what a colour track replaces it with. */
  readonly color: string;
}

/**
 * The fragments of a text node with text animations (D65.3, D69), per unit, in
 * the order of the text: the lines that hold a word, the words, and the
 * letters. A unit that no animation of the node uses lists none.
 */
export interface TextFragmentsState {
  readonly lines: readonly FragmentState[];
  readonly words: readonly FragmentState[];
  readonly letters: readonly FragmentState[];
}

/** A text node with its colour, animated or not (D68), and its fragments (D69). */
export interface TextNodeState extends LeafNodeState<'text'>, EffectsState {
  /** `#rrggbb`. */
  readonly color: string;
  /** `null` for a text without text animations, which is drawn in one piece. */
  readonly fragments: TextFragmentsState | null;
}

/** The box and the picture of an image or a video, animated or not (D68). */
export interface PictureState {
  readonly size: Size;
  readonly crop: CropState;
  /** Composition pixels; fractional while animated. */
  readonly cornerRadius: number;
}

/** An image node with its box and picture (D68). */
export interface ImageNodeState extends LeafNodeState<'image'>, PictureState, EffectsState {}

/**
 * A video node (D49.5, D50.3): a leaf whose `sourceTimeUs` is the source time it
 * shows, `sourceStartUs + (timeUs − startUs)`, while it is active, and `null`
 * while it is not. The runtime knows no frames: which frame that time selects
 * is the host's matter, by the rule `sourceFrameIndex` of `@kadrion/schema`.
 */
export interface VideoNodeState extends LeafNodeState<'video'>, PictureState, EffectsState {
  readonly sourceTimeUs: number | null;
}

/**
 * A captions node (D57): a leaf with the page it shows and the word being
 * spoken, as indices of `captionPages` and of the node's `words`, while it is
 * active; both are `null` while it is not, `page` before its first word, and
 * `word` between two words.
 */
export interface CaptionsNodeState extends LeafNodeState<'captions'>, EffectsState {
  /** The colour of the words, `#rrggbb`, animated or not (D68); the highlight stays the document's. */
  readonly color: string;
  readonly page: number | null;
  readonly word: number | null;
  /**
   * The lines and words of the page shown, for a node drawn in pieces (D70),
   * and `null` for one that is not, which is drawn as D57 draws it.
   */
  readonly fragments: CaptionFragmentsState | null;
}

/**
 * The lines and words of the page a captions node shows (D70), each in the
 * order of the page: the page's entrance and exit, and on the word being
 * spoken its highlight. Both lists are empty while no page is shown.
 */
export interface CaptionFragmentsState {
  readonly lines: readonly FragmentState[];
  readonly words: readonly FragmentState[];
}

export interface GroupNodeState
  extends LifetimeState, TransformState, ClipTransitionSide, EffectsState {
  readonly id: string;
  readonly type: 'group';
  /** Array order is the z-order, as in the document; groups do not nest. */
  readonly children: readonly (ImageNodeState | TextNodeState | VideoNodeState)[];
}

export type NodeState =
  | BackgroundNodeState
  | GroupNodeState
  | ImageNodeState
  | TextNodeState
  | LeafNodeState<'custom-html'>
  | VideoNodeState
  | CaptionsNodeState;

/** Composition pixels cut away from each edge of the frame (D56). */
export interface Inset {
  readonly fromTop: number;
  readonly fromRight: number;
  readonly fromBottom: number;
  readonly fromLeft: number;
}

/** A scale about a point of the frame (D66): the point stays where it is. */
export interface Zoom {
  /** The factor, the same on both axes. */
  readonly factor: number;
  /** The point it scales about, in composition pixels of the frame. */
  readonly center: Vec2;
}

/** A circle of the frame, in composition pixels (D66): what is kept of a side is its inside. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * The frame, `width` by `height` composition pixels from its top-left corner,
 * less a circle (D66): what is kept of a side is the frame outside the circle.
 */
export interface Hole extends Circle {
  readonly width: number;
  readonly height: number;
}

/**
 * What a scene transition does to one of its scenes at one instant (D49.4,
 * D56, D66). Only what the effect changes is present: a factor of the scene's
 * opacity, an offset of the whole scene, a zoom of it, or the part of the
 * frame it is cut to, by an inset or a circle. A scene outside a transition,
 * and a side that the effect leaves as it is, has no such state.
 */
export interface SceneTransitionState {
  /** The transition's ID. */
  readonly id: string;
  /** Factor of the whole scene's opacity, from 0 to 1; the scene is composited first. */
  readonly opacity?: number;
  /** Offset of the whole scene, in composition pixels. */
  readonly offset?: Vec2;
  /** A scale of the whole scene about a point of the frame, after the offset (D66). */
  readonly zoom?: Zoom;
  /** What is cut away of the scene, in composition pixels from each edge of the frame. */
  readonly clip?: Inset;
  /** The circle of the frame the scene is cut to (D66). */
  readonly circle?: Circle;
  /** The standard deviation of a blur of the whole scene, in composition pixels (D71). */
  readonly blur?: number;
}

/**
 * What a clip transition does to one of its nodes at one instant, besides its
 * opacity (D56, D66). The frame of a clip transition is the canvas in the
 * space of the two nodes' parent: the scene, or their group. `offset` and
 * `zoom` move the node within that frame after its own transform; `clip`,
 * `circle`, and `hole` cut the node to a part of the frame that stays in place, and a side
 * that moves is cut to the whole frame; `backdrop` is a colour that covers the
 * frame directly below the node. Only what the effect changes is present.
 */
export interface ClipTransitionState {
  /** The transition's ID. */
  readonly id: string;
  readonly offset?: Vec2;
  readonly zoom?: Zoom;
  readonly clip?: Inset;
  readonly circle?: Circle;
  readonly hole?: Hole;
  /** `#rrggbb`, under the lower side of a `fade-through-color` after its first instant. */
  readonly backdrop?: string;
  /** The standard deviation of a blur of the node, after its own effects, in composition pixels (D71). */
  readonly blur?: number;
}

/** A scene evaluated at one instant (D49.3, D54.3), with its effects (D71). */
export interface SceneState extends EffectsState {
  readonly id: string;
  /** Scene time: the composition time minus the scene's start, from 0. Its nodes are evaluated at it. */
  readonly timeUs: number;
  /** Array order is the z-order, as in the document. */
  readonly nodes: readonly NodeState[];
  /** Present only while a scene transition changes this scene (D56). */
  readonly transition?: SceneTransitionState;
}

export interface CompositionState {
  /** The composition time this state was evaluated for. */
  readonly timeUs: number;
  /** The scenes evaluated at that time, in their order: one outside a transition, its two sides inside one (D49.3, D49.4). */
  readonly scenes: readonly SceneState[];
  /**
   * The colour under the scenes, `#rrggbb`, present only while a transition
   * `fade-through-color` shows it (D56).
   */
  readonly backdrop?: string;
}
