/**
 * The host's policy for Custom HTML (D36, D23.1 as amended by PR-16). Only the
 * host decides whether the HTML of a document runs: it is never a field of the
 * document (D16), and the runtime build has no default. `trusted` mounts every
 * element in its sandboxed frame; `disabled` mounts its sized placeholder only,
 * so the element's HTML is never parsed, run, or put into any attribute.
 * `trusted` is the host's decision to run the document's code, not a promise of
 * network isolation (D36).
 */
import { RenderError } from './errors.js';

/** A discriminated union, so that a later policy (per element, say) is a new member. */
export type CustomHtmlPolicy = { readonly mode: 'disabled' } | { readonly mode: 'trusted' };

/** What the host states when it mounts a document. */
export interface MountOptions {
  readonly customHtml: CustomHtmlPolicy;
}

/** Set on the placeholder of a Custom HTML element that was mounted without its frame. */
export const CUSTOM_HTML_ATTRIBUTE = 'data-kadrion-custom-html';
/** The only value of `CUSTOM_HTML_ATTRIBUTE`. */
export const CUSTOM_HTML_DISABLED = 'disabled';

const MODES: readonly CustomHtmlPolicy['mode'][] = ['disabled', 'trusted'];

/** The own data properties of a plain object, exactly `keys`; nothing is read through a getter. */
function exactly(value: unknown, keys: readonly string[]): Map<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length) return null;
  const values = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) return null;
    values.set(key, descriptor.value);
  }
  return values;
}

/**
 * The options of a mount, checked: exactly `{ customHtml: { mode } }` with a
 * known mode, as own data properties. Anything else, `undefined` included,
 * throws the `RenderError` code `invalid-options` before the DOM is touched. A
 * value that crosses a realm or a message has no brand, so every mount checks.
 */
export function mountOptions(value: unknown): MountOptions {
  const mode = exactly(exactly(value, ['customHtml'])?.get('customHtml'), ['mode'])?.get('mode');
  const known = MODES.find((candidate) => candidate === mode);
  if (known === undefined) {
    throw new RenderError(
      'invalid-options',
      'The options must be exactly { customHtml: { mode: "disabled" | "trusted" } } (D36).',
    );
  }
  return Object.freeze({ customHtml: Object.freeze({ mode: known }) });
}
