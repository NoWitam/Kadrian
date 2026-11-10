/**
 * @kadrion/schema/template — instantiating a template (D58.4): a pure,
 * deterministic function that makes a composition from a template and the
 * values of its inputs.
 *
 * It is an entry point of its own, as `@kadrion/schema/migrate` is, so that the
 * render page, which imports `@kadrion/schema` only, carries none of it (D21):
 * a template is never rendered as it is; a host renders its instantiation.
 */
import type { ValidationError } from './errors.js';
import {
  failed,
  fillTemplate,
  resolveTemplateValues,
  type InstantiationResult,
} from './template-fill.js';
import type { Composition, ValidatedComposition } from './types.js';
import { validateComposition } from './validate.js';

export { isTemplate } from './template-values.js';
export {
  MAX_REPEAT_IDS,
  templateDefaults,
  type InstantiationResult,
  type TemplateError,
  type TemplateErrorCode,
  type TemplateItemValue,
  type TemplateValue,
  type TemplateValues,
} from './template-fill.js';

/**
 * Makes a composition from a template and the values of its inputs (D58.4,
 * D59.4):
 *
 * 1. the values are validated against the inputs — an own key that is no
 *    input is `unknown-input`, a value of the wrong type or outside its
 *    constraints `invalid-input-value`, each naming the input and the path of
 *    the value; an input left out takes its default; the duration a repeat
 *    reads from a field must be a whole number of microseconds from 1;
 * 2. every binding of an input writes its value: a property takes it whole,
 *    an asset takes it as its content hash;
 * 3. every scene and node whose conditions do not all hold is removed, with
 *    everything inside it and every transition that names it;
 * 4. every repeat replaces its target by one copy for each item of its list,
 *    in their order, each starting where the one before it ends; the IDs of
 *    copy `k` are `<id>--<k>`; item bindings and placeholders of fields write
 *    the item of their copy, and an asset bound to a field becomes one asset
 *    for each item; more than `MAX_REPEAT_IDS` IDs in all is `repeat-limit`;
 * 5. every placeholder of an input becomes the text of its value, a number as
 *    ECMAScript writes it; the composition's durationUs becomes that of its
 *    scenes less their transitions;
 * 6. the template section is emptied, and the result is validated in full as
 *    a composition.
 *
 * It is pure and deterministic: the same template and values give the same
 * composition, key order included, so the same `compositionHash` (D28.7). It
 * never writes its inputs; the composition it returns is a new tree that
 * belongs to the caller and is not frozen. A template without inputs gives
 * itself without the section. It never throws for passive data.
 */
export function instantiateTemplate(
  template: ValidatedComposition,
  values: unknown,
): InstantiationResult {
  const checked = resolveTemplateValues(template.template, values);
  if (!checked.ok) return checked;
  // A JSON round trip: a tree that shares nothing with the template, the caller's to keep.
  const result = JSON.parse(JSON.stringify(template)) as Composition;
  const filled = fillTemplate(result, checked.resolved);
  if (!filled.ok) return filled;
  const validated = validateComposition(result);
  if (!validated.ok) {
    return failed(
      validated.errors.map(({ path, message }: ValidationError) => ({
        code: 'invalid-composition',
        inputId: null,
        path,
        message,
      })),
    );
  }
  return Object.freeze({ ok: true, composition: validated.composition });
}
