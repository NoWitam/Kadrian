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
  /** `parentId` names neither the scene nor a node of the document (D39.8). */
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
  /** No animation of the document has that ID; `details` are empty (D41.5). */
  | 'unknown-animation'
  /** The animation has no keyframe at that time; `details` are empty (D41.5). */
  | 'unknown-keyframe'
  /** The animation already has a keyframe at the time to fill; `details` are empty (D41.5). */
  | 'keyframe-exists'
  /** The removal would leave fewer keyframes than the schema allows; `details` hold the animation's ID (D41.4). */
  | 'too-few-keyframes'
  /** A typed keyframe command names an animation of another property; `details` are empty (D41.5). */
  | 'animation-property-mismatch'
  /** The node already animates that property; `details` hold the ID of the animation that does (D41.5). */
  | 'duplicate-animation-target';

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
