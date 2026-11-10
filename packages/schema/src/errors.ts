import type { ValidatedComposition } from './types.js';

export type ValidationErrorCode =
  /** The gate: `schemaVersion` is present but not supported by this build. */
  | 'unsupported-schema-version'
  | 'missing-field'
  | 'unknown-field'
  /** Wrong JSON type, a fractional value where an integer is required, or a value that is not JSON data. */
  | 'invalid-type'
  /** Right type, but not the expected constant, not an allowed value, or not matching the pattern. */
  | 'invalid-value'
  | 'out-of-range'
  /** Too few or too many array items. */
  | 'invalid-length'
  | 'duplicate-id'
  /** A reference inside the document points at no asset. Not a resolver failure. */
  | 'unresolved-asset-reference'
  | 'asset-type-mismatch'
  | 'keyframes-not-ascending'
  /** The last source time of a video node or an audio clip, `sourceStartUs + durationUs − 1`, is not a safe integer (D50.2, D52.3). */
  | 'source-time-out-of-range'
  /** An audio clip's `fadeInUs + fadeOutUs` exceeds its `durationUs` (D52.3). */
  | 'clip-fades-exceed-duration'
  /** The composition's `durationUs` is not the sum of its scenes' `durationUs` (D49.3, D54.2). */
  | 'composition-duration-mismatch'
  /** A scene transition names a scene the composition does not have (D56). */
  | 'unresolved-scene-reference'
  /** A clip transition names a node its scene does not have (D56). */
  | 'unresolved-node-reference'
  /** A scene transition's incoming scene does not directly follow its outgoing one (D56). */
  | 'transition-not-adjacent'
  /** A clip transition's two nodes are not two children of one parent (D49.2, D56). */
  | 'transition-not-siblings'
  /** A clip transition names a background, which has no opacity (D56). */
  | 'transition-node-type'
  /** A clip transition's two lifetimes do not overlap by exactly its duration (D49.4, D56). */
  | 'transition-overlap-mismatch'
  /** A transition is longer than a side, or the two of one side together are (D49.4, D56). */
  | 'transition-too-long'
  /** A side meets two transitions at one of its ends (D49.4, D56). */
  | 'duplicate-transition'
  /** A caption word starts before the word before it ends (D57). */
  | 'caption-words-overlap'
  | 'duplicate-animation-target'
  /** Two opposite insets of a crop leave less than 1 per mille of the picture (D68). */
  | 'crop-empty'
  /** Two opposite insets of the safe area leave no pixel of the canvas (D70). */
  | 'safe-area-empty'
  /** A bound property is animated too, and the animation would hide the bound value (D68). */
  | 'bound-property-animated'
  /** An input's constraints contradict each other, or its default breaks them (D58.1). */
  | 'template-input-invalid'
  /** A binding or a placeholder names an input the template does not have (D58.2). */
  | 'unresolved-input-reference'
  /** A binding joins an input and a target of different types, or a target that takes no binding (D58.2). */
  | 'binding-type-mismatch'
  /** A bound property or asset does not hold the default of its input (D58.3). */
  | 'binding-value-mismatch'
  /** Two bindings write the same property or asset (D58.2). */
  | 'duplicate-binding-target'
  /** A bound text has a `{{` that does not begin a placeholder `{{inputId}}` (D58.2). */
  | 'invalid-placeholder'
  /** A condition or a repeat names no scene and no node (D59.1, D59.2). */
  | 'unresolved-target-reference'
  /** An item binding, a placeholder, or a repeat names a key that is no field of its list (D59.2, D59.3). */
  | 'unresolved-field-reference'
  /** A condition's test does not fit the type of its input (D59.1). */
  | 'condition-type-mismatch'
  /** A repeat reads an input that is no list, or takes its duration from a field that is no number (D59.2). */
  | 'repeat-type-mismatch'
  /** A target is repeated twice, or lies inside another repeated target (D59.2). */
  | 'nested-repeat'
  /** A repeated node is a side of a clip transition, whose overlap its copies cannot keep (D59.2). */
  | 'repeat-in-transition'
  /** A repeated node is the matte of a sibling, which its copies would not be (D75). */
  | 'repeat-of-matte'
  /** An ID has the form of the ID of a copy of a repeat, `<id>--<index>` (D59.2). */
  | 'repeat-id-reserved'
  /** An item binding or placeholder lies outside every repeat over its list (D59.3). */
  | 'item-outside-repeat'
  /** The path of a shape does not start with a move (D73). */
  | 'path-start-not-move'
  /** The stops of a gradient do not ascend in offset (D73). */
  | 'gradient-stops-not-ascending'
  /** The dashes of a stroke are an odd number of lengths (D73). */
  | 'stroke-dash-odd'
  /** A fill animation on a shape whose fill is not one colour (D73). */
  | 'fill-not-solid'
  /** A geometry keyframe whose structure is not that of the shape's geometry (D73). */
  | 'geometry-mismatch'
  /** A matte names no other node of the same scene or group (D75). */
  | 'matte-not-sibling'
  /** A matte names a node that is not a shape (D75). */
  | 'matte-not-shape'
  /** A matte has a mask, a matte, or a blend mode other than normal itself (D75). */
  | 'matte-not-plain'
  /** A matte is a side of a clip transition (D75). */
  | 'matte-in-transition'
  /** An instance names no definition of the document (D76). */
  | 'unresolved-definition-reference'
  /** An instance shows more time than its definition has: sourceStartUs + durationUs exceeds it (D65.4, D76). */
  | 'instance-exceeds-definition'
  /** A definition places itself, directly or through other definitions (D65.4, D76). */
  | 'definition-cycle'
  /** A definition places instances more than 8 deep (D65.4, D76). */
  | 'definition-too-deep'
  /** The template of a definition has an input of an asset type, or binds an asset: an element has no asset inputs (D77). */
  | 'element-asset-input'
  /** The values of an instance do not fit the inputs of its definition, or its definition instantiated with them is no valid definition (D77). */
  | 'instance-input-invalid';

export interface ValidationError {
  readonly code: ValidationErrorCode;
  /** RFC 6901 JSON Pointer to the offending field; for a missing field, to where it belongs. */
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly composition: ValidatedComposition }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

/** Appends one reference token to a JSON Pointer. */
export function pointer(path: string, token: string | number): string {
  return `${path}/${String(token).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}
