/**
 * The evaluated state of a composition at one instant (D19). It mirrors the
 * document: the evaluated scenes, nodes, and group children keep their order and hierarchy
 * (D16.4), and every value is local to its node (D15, D18.5, D42.3). Static
 * properties such as colours, text, and asset references stay in the document;
 * a renderer walks the document and the state side by side.
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

/** The animatable properties of a node after its animations were applied (D16.6). */
export interface TransformState {
  /** Offset of the origin of the node relative to the origin of its parent, in composition pixels. */
  readonly position: Vec2;
  readonly scale: Vec2;
  /**
   * Not multiplied into children: a group is composited before its opacity
   * applies (D15). A clip transition's factor is part of it (D56).
   */
  readonly opacity: number;
}

export type LeafNodeType = 'image' | 'text' | 'custom-html' | 'video' | 'captions';

export interface BackgroundNodeState extends LifetimeState {
  readonly id: string;
  readonly type: 'background';
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
 * A video node (D49.5, D50.3): a leaf whose `sourceTimeUs` is the source time it
 * shows, `sourceStartUs + (timeUs − startUs)`, while it is active, and `null`
 * while it is not. The runtime knows no frames: which frame that time selects
 * is the host's matter, by the rule `sourceFrameIndex` of `@kadrion/schema`.
 */
export interface VideoNodeState extends LeafNodeState<'video'> {
  readonly sourceTimeUs: number | null;
}

/**
 * A captions node (D57): a leaf with the page it shows and the word being
 * spoken, as indices of `captionPages` and of the node's `words`, while it is
 * active; both are `null` while it is not, `page` before its first word, and
 * `word` between two words.
 */
export interface CaptionsNodeState extends LeafNodeState<'captions'> {
  readonly page: number | null;
  readonly word: number | null;
}

export interface GroupNodeState extends LifetimeState, TransformState, ClipTransitionSide {
  readonly id: string;
  readonly type: 'group';
  /** Array order is the z-order, as in the document; groups do not nest. */
  readonly children: readonly (LeafNodeState<'image' | 'text'> | VideoNodeState)[];
}

export type NodeState =
  | BackgroundNodeState
  | GroupNodeState
  | LeafNodeState<'image' | 'text' | 'custom-html'>
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
}

/** A scene evaluated at one instant (D49.3, D54.3). */
export interface SceneState {
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
