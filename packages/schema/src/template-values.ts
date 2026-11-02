/**
 * What an input accepts and what a placeholder is (D58.1, D58.2), shared by
 * the validation of a document and by `instantiateTemplate`, so that a default
 * and a value of the host are judged by one rule.
 */
import type { TemplateField, TemplateInput } from './types.js';

/** An input or a field without the list: a type and its constraints. */
export type ValueSpec = TemplateField | Exclude<TemplateInput, { readonly type: 'list' }>;

const COLOR = /^#[0-9a-f]{6}$/u;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/u;

/** The length of a text in Unicode code points, as the constraints count it (D58.1). */
export function codePointLength(text: string): number {
  // Code points, not graphemes: the count must not depend on the Unicode tables of an engine.
  return Array.from(text).length;
}

/**
 * Why `value` is not a value of `spec`, or `null` when it is one: the JSON
 * type of its kind, then its constraints (D58.1).
 */
export function valueProblem(spec: ValueSpec, value: unknown): string | null {
  switch (spec.type) {
    case 'text': {
      if (typeof value !== 'string') return 'Expected a text.';
      const length = codePointLength(value);
      if (length < spec.minLength || length > spec.maxLength) {
        return `Expected ${String(spec.minLength)} to ${String(spec.maxLength)} characters, got ${String(length)}.`;
      }
      return null;
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Expected a finite number.';
      if (value < spec.minimum || value > spec.maximum) {
        return `Expected ${String(spec.minimum)} to ${String(spec.maximum)}.`;
      }
      return null;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Expected true or false.';
    case 'color':
      return typeof value === 'string' && COLOR.test(value)
        ? null
        : 'Expected a lowercase #rrggbb colour.';
    case 'image':
    case 'video':
    case 'audio':
      return typeof value === 'string' && CONTENT_HASH.test(value)
        ? null
        : `Expected the content hash of ${spec.type === 'image' ? 'an image' : spec.type === 'video' ? 'a video' : 'a sound'}, sha256: and 64 lowercase hex digits.`;
  }
}

/** Why the constraints of `spec` contradict each other, or `null` (D58.1). */
export function constraintProblem(spec: ValueSpec): { key: string; message: string } | null {
  if (spec.type === 'text' && spec.minLength > spec.maxLength) {
    return { key: 'maxLength', message: 'maxLength must not be less than minLength.' };
  }
  if (spec.type === 'number' && spec.minimum > spec.maximum) {
    return { key: 'maximum', message: 'maximum must not be less than minimum.' };
  }
  return null;
}

/**
 * One piece of a bound text: literal text, or a placeholder naming an input
 * (D58.2) — and, for `{{inputId.key}}`, the field of the item of a list (D59.3);
 * `key` is `null` for a placeholder of an input.
 */
export type PatternPart = string | { readonly inputId: string; readonly key: string | null };

const PLACEHOLDER = /^([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?$/u;

/**
 * A bound text cut into literal text and placeholders (D58.2, D59.3): every
 * `{{` begins a placeholder, `{{inputId}}` or `{{inputId.key}}` — IDs of the
 * document's form between double braces, the second the key of a field of a
 * list; anything else after a `{{` makes the text no pattern, and the result
 * is `null`. There is no escape and no expression: a lone `{`, a `}`, or a
 * `}}` is text.
 */
export function patternParts(text: string): readonly PatternPart[] | null {
  const parts: PatternPart[] = [];
  let at = 0;
  for (;;) {
    const open = text.indexOf('{{', at);
    if (open < 0) break;
    const close = text.indexOf('}}', open + 2);
    if (close < 0) return null;
    const match = PLACEHOLDER.exec(text.slice(open + 2, close));
    if (match === null) return null;
    if (open > at) parts.push(text.slice(at, open));
    parts.push({ inputId: match[1] ?? '', key: match[2] ?? null });
    at = close + 2;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/** How a number stands in a text: ECMAScript's shortest round trip, `-0` as `0` (D58.2). */
export function numberText(value: number): string {
  return String(value);
}

/**
 * Whether a composition is a template: its template section has an input, a
 * binding, a condition, or a repeat (D58.4, D59). A template is edited and
 * previewed, never rendered as it is: the Player and the Producer refuse it,
 * and a host renders an instantiation of it, `instantiateTemplate` of
 * `@kadrion/schema/template`.
 */
export function isTemplate(composition: {
  readonly template: {
    readonly inputs: readonly unknown[];
    readonly bindings: readonly unknown[];
    readonly conditions: readonly unknown[];
    readonly repeats: readonly unknown[];
  };
}): boolean {
  const { inputs, bindings, conditions, repeats } = composition.template;
  return inputs.length + bindings.length + conditions.length + repeats.length > 0;
}

/**
 * The ID of copy `index` of an entity of a repeat (D59.2): the template ID, two
 * hyphens, and the index in decimal without leading zeros. Injective: the
 * index has no hyphen, so the last `--` of a derived ID is the one added, and
 * a template that holds an ID of this form for an ID it repeats is refused
 * (`repeat-id-reserved`), so no copy takes an ID the document has.
 */
export function copyId(id: string, index: number): string {
  return `${id}--${String(index)}`;
}

/** The ID a derived ID was made from, or `null` when the ID has no form of a copy (D59.2). */
export function copiedFrom(id: string): string | null {
  const match = /^(.+)--(?:0|[1-9][0-9]*)$/su.exec(id);
  return match === null ? null : (match[1] ?? null);
}
