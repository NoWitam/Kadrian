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
   * opacity, and only a text node has a text (D30.8, D38.10).
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
  | 'id-in-use';

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
