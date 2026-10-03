/**
 * The evaluated state of a composition at one instant (D19). It mirrors the
 * document: scenes, nodes, and group children keep their order and hierarchy
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
  /** Not multiplied into children: a group is composited before its opacity applies (D15). */
  readonly opacity: number;
}

export type LeafNodeType = 'image' | 'text' | 'custom-html';

export interface BackgroundNodeState extends LifetimeState {
  readonly id: string;
  readonly type: 'background';
}

export interface LeafNodeState<Type extends LeafNodeType = LeafNodeType>
  extends LifetimeState, TransformState {
  readonly id: string;
  readonly type: Type;
}

export interface GroupNodeState extends LifetimeState, TransformState {
  readonly id: string;
  readonly type: 'group';
  /** Array order is the z-order, as in the document; groups do not nest. */
  readonly children: readonly LeafNodeState<'image' | 'text'>[];
}

export type NodeState = BackgroundNodeState | GroupNodeState | LeafNodeState;

export interface SceneState {
  readonly id: string;
  /** Array order is the z-order, as in the document. */
  readonly nodes: readonly NodeState[];
}

export interface CompositionState {
  /** The instant this state was evaluated for. */
  readonly timeUs: number;
  readonly scenes: readonly SceneState[];
}
