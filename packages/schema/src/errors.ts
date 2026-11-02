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
  | 'duplicate-animation-target';

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
