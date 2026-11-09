export type EditorErrorCode =
  /** The document the bus was created from is not a valid composition (D17). */
  | 'invalid-document'
  /** No command of that `type` exists (D30.8). */
  | 'unknown-command'
  /**
   * The payload is not a well-formed command of its type (D30.3), a transaction
   * is not a non-empty array of commands, or an option of the bus is invalid (D38.10).
   */
  | 'invalid-argument'
  /** No node of the document carries that ID (D16). */
  | 'unknown-node'
  /**
   * The node lacks the field the command edits: a background has no position or
   * opacity, and only a text node has a text (D30.8, D38.10). The same holds for
   * a parent without `children` (D39.8), a node without the scale, size, colour,
   * font size, font, or image asset a command of D40 edits (D40.1, D40.2), and a
   * node without `animations` (D41.6).
   */
  | 'unsupported-node'
  /** The edited document does not validate; `details` carry the validation errors (D30.6). */
  | 'invalid-result'
  | 'nothing-to-undo'
  | 'nothing-to-redo'
  /** A listener called a mutating method of the bus while a change was being delivered (D38.8). */
  | 'busy'
  /** `parentId` names neither a scene nor a node of the document (D39.8). */
  | 'unknown-parent'
  /** The index lies outside the list it refers to in this document (D39.8). */
  | 'index-out-of-range'
  /** An ID the command would add is already used, or would be added twice; `details` list them sorted (D39.3). */
  | 'id-in-use'
  /** No asset of the document carries that ID; nodes, clips, and the scene are not assets (D40.2). */
  | 'unknown-asset'
  /** The asset exists but is not of the type the field expects (D40.2). */
  | 'asset-type-mismatch'
  /** The asset is still used; `details` list the IDs of its users, sorted (D40.4). */
  | 'asset-in-use'
  /** No scene of the document has that ID; `details` are empty (D54.5). */
  | 'unknown-scene'
  /** The command would remove the only scene; a composition has at least one (D54.5). */
  | 'last-scene'
  /** No audio clip of the document has that ID — for the timeline commands, no node or audio clip (D52.6, D55.1); `details` are empty. */
  | 'unknown-clip'
  /** The time does not lie strictly inside the clip's lifetime, or a trim would leave it no duration (D55.4). */
  | 'time-outside-clip'
  /** The halves of the split would not render exactly as the whole: off the 125 µs grid of a sound, or inside a fade (D55.4). */
  | 'split-not-exact'
  /** The second clip is not directly after the first, or not what a split of the joined clip would make (D55.5). */
  | 'clips-not-joinable'
  /** No scene or clip transition of the document has that ID; `details` are empty (D56.6). */
  | 'unknown-transition'
  /**
   * The command would break a transition it does not edit — remove or move one
   * of its sides, or change a side's time or duration so that the transition
   * no longer fits; `details` list the IDs of those transitions, sorted (D56.7).
   */
  | 'transition-in-use'
  /**
   * A command other than `SetNodeMatte` would leave a node with a matte that is
   * removed, moved away, no shape, or not plain any more; `details` list the IDs
   * of the nodes it mattes, sorted (D75).
   */
  | 'matte-in-use'
  /** The template has no input with that ID; `details` are empty (D58.6). */
  | 'unknown-input'
  /** The template has no binding with that ID; `details` are empty (D58.6). */
  | 'unknown-binding'
  /** The template has no condition with that ID; `details` are empty (D59.6). */
  | 'unknown-condition'
  /** The template has no repeat with that ID; `details` are empty (D59.6). */
  | 'unknown-repeat'
  /** The input is still bound or named by a placeholder; `details` list the bindings, sorted (D58.6). */
  | 'input-in-use'
  /**
   * The command would break a binding, a condition, or a repeat it does not
   * edit — remove its node, scene, or asset, change a bound property or asset
   * away from its input's default, make a bound text no pattern, move an item
   * binding out of its repeat, or nest a repeat; `details` list their IDs,
   * sorted (D58.6, D59.6).
   */
  | 'binding-in-use'
  /** No animation of the document has that ID; `details` are empty (D41.5). */
  | 'unknown-animation'
  /** No node or scene of the document has an effect with that ID; `details` are empty (D71). */
  | 'unknown-effect'
  /** `svgToShapes` was given bytes or text the sanitiser refuses; `details` are its code and the path of the offence (D74.3). */
  | 'svg-refused'
  /** `svgToShapes` met what a shape node cannot state; `details` name the element (D74.5). */
  | 'svg-not-convertible'
  /** The animation has no keyframe at that time; `details` are empty (D41.5). */
  | 'unknown-keyframe'
  /** The animation already has a keyframe at the time to fill; `details` are empty (D41.5). */
  | 'keyframe-exists'
  /** The removal would leave fewer keyframes than the schema allows; `details` hold the animation's ID (D41.4). */
  | 'too-few-keyframes'
  /** A typed keyframe command names an animation of another property; `details` are empty (D41.5). */
  | 'animation-property-mismatch'
  /** `SetKeyframeValue` names an animation of opacity, position, or scale, which have typed commands (D65.2). */
  | 'use-typed-command'
  /** The node already animates that property; `details` hold the ID of the animation that does (D41.5). */
  | 'duplicate-animation-target'
  /**
   * The command sets the sampled source range of a video node, and the host
   * supplied no media facts for its asset; `details` name the nodes (D49.6, D50.6).
   */
  | 'media-facts-missing'
  /** A video node would sample past the end of its source; `details` name the nodes and ranges (D49.6). */
  | 'source-range-exceeded'
  /**
   * The two clips of a transition at a cut do not meet: the outgoing one does not
   * end exactly where the incoming one starts in the same scene; `details` name
   * both (D66).
   */
  | 'not-a-cut'
  /**
   * A clip at a cut cannot be extended across it: the incoming one would start
   * before its scene, or the outgoing one end past the largest time; `details`
   * name it (D66).
   */
  | 'no-room-at-cut';

/**
 * A typed failure of the command bus (D30.8). Check `code` instead of
 * `instanceof`, which fails across realms; `details` lists validation errors as
 * `path: message`, in the idiom of `PlayerError`.
 */
export class EditorError extends Error {
  readonly code: EditorErrorCode;
  readonly details: readonly string[];

  constructor(code: EditorErrorCode, message: string, details: readonly string[] = []) {
    super(message);
    this.name = 'EditorError';
    this.code = code;
    this.details = details;
  }
}
