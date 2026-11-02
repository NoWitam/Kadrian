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

export type LeafNodeType = 'image' | 'text' | 'custom-html' | 'video';

export interface BackgroundNodeState extends LifetimeState {
  readonly id: string;
  readonly type: 'background';
}

export interface LeafNodeState<Type extends LeafNodeType = LeafNodeType>
  extends LifetimeState, TransformState {
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

export interface GroupNodeState extends LifetimeState, TransformState {
  readonly id: string;
  readonly type: 'group';
  /** Array order is the z-order, as in the document; groups do not nest. */
  readonly children: readonly (LeafNodeState<'image' | 'text'> | VideoNodeState)[];
}

export type NodeState =
  | BackgroundNodeState
  | GroupNodeState
  | LeafNodeState<'image' | 'text' | 'custom-html'>
  | VideoNodeState;

/** Composition pixels cut away from each edge of the frame (D56). */
export interface Inset {
  readonly fromTop: number;
  readonly fromRight: number;
  readonly fromBottom: number;
  readonly fromLeft: number;
}

/**
 * What a scene transition does to one of its scenes at one instant (D49.4,
 * D56). Only what the effect changes is present: a factor of the scene's
 * opacity, an offset of the whole scene, or the part of the frame it is cut
 * to. A scene outside a transition, and a side that the effect leaves as it
 * is, has no such state.
 */
export interface SceneTransitionState {
  /** The transition's ID. */
  readonly id: string;
  /** Factor of the whole scene's opacity, from 0 to 1; the scene is composited first. */
  readonly opacity?: number;
  /** Offset of the whole scene, in composition pixels. */
  readonly offset?: Vec2;
  /** What is cut away of the scene, in composition pixels from each edge of the frame. */
  readonly clip?: Inset;
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
