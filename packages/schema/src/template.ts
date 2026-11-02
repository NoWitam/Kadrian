/**
 * @kadrion/schema/template — instantiating a template (D58.4): a pure,
 * deterministic function that makes a composition from a template and the
 * values of its inputs.
 *
 * It is an entry point of its own, as `@kadrion/schema/migrate` is, so that the
 * render page, which imports `@kadrion/schema` only, carries none of it (D21):
 * a template is never rendered as it is; a host renders its instantiation.
 */
import { pointer, type ValidationError } from './errors.js';
import { numberText, patternParts, valueProblem } from './template-values.js';
import type {
  Composition,
  SceneNode,
  TemplateFieldValue,
  TemplateInput,
  ValidatedComposition,
} from './types.js';
import { validateComposition } from './validate.js';

export { isTemplate } from './template-values.js';

/** The value of one field of one item of a list, as a host gives it (D58.4). */
export type TemplateItemValue = string | number | boolean;

/**
 * The value of one input as a host gives it (D58.4): a string for a text, a
 * colour, or the content hash of an asset; a number; a boolean; and for a list
 * an array of objects whose keys are the keys of its fields.
 */
export type TemplateValue =
  string | number | boolean | readonly Readonly<Record<string, TemplateItemValue>>[];

/** The values of the inputs a host gives, by input ID; an input left out takes its default. */
export type TemplateValues = Readonly<Record<string, TemplateValue>>;

export type TemplateErrorCode =
  /** The values are not a plain object (D58.4). */
  | 'invalid-values'
  /** A value is given for an ID that is no input of the template (D58.4). */
  | 'unknown-input'
  /** A value does not have its input's type, or breaks its constraints (D58.4). */
  | 'invalid-input-value'
  /** The result is not a valid composition; the template allows what it must not (D58.4). */
  | 'invalid-composition';

/** A typed refusal of `instantiateTemplate` (D58.4). */
export interface TemplateError {
  readonly code: TemplateErrorCode;
  /** The input the error is about, or `null` when it is about no one input. */
  readonly inputId: string | null;
  /**
   * RFC 6901 JSON Pointer: into the values (`/title`, `/people/0/name`), or,
   * for `invalid-composition`, into the composition.
   */
  readonly path: string;
  readonly message: string;
}

export type InstantiationResult =
  | { readonly ok: true; readonly composition: ValidatedComposition }
  | { readonly ok: false; readonly errors: readonly TemplateError[] };

type PlainObject = Readonly<Record<string, unknown>>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The default of an input as a host gives a value: a list's items become objects (D58.4). */
function defaultOf(input: TemplateInput): TemplateValue {
  if (input.type !== 'list') return input.default;
  return input.default.map((item) =>
    Object.fromEntries(item.map((entry: TemplateFieldValue) => [entry.key, entry.value])),
  );
}

/**
 * The defaults of every input of a template, by input ID, as a host gives
 * values (D58.4): what `instantiateTemplate(template, {})` uses. A fresh,
 * frozen value.
 */
export function templateDefaults(template: ValidatedComposition): TemplateValues {
  const defaults: Record<string, TemplateValue> = {};
  for (const input of template.template.inputs) defaults[input.id] = defaultOf(input);
  return Object.freeze(JSON.parse(JSON.stringify(defaults)) as TemplateValues);
}

/** The errors of one value against its input (D58.1, D58.4). */
function valueErrors(input: TemplateInput, value: unknown): TemplateError[] {
  const path = pointer('', input.id);
  const error = (at: string, message: string): TemplateError => ({
    code: 'invalid-input-value',
    inputId: input.id,
    path: at,
    message,
  });
  if (input.type !== 'list') {
    const problem = valueProblem(input, value);
    return problem === null ? [] : [error(path, problem)];
  }
  if (!Array.isArray(value)) return [error(path, 'Expected an array of items.')];
  const items = value as readonly unknown[];
  const errors: TemplateError[] = [];
  if (items.length < input.minItems || items.length > input.maxItems) {
    errors.push(
      error(
        path,
        `Expected ${String(input.minItems)} to ${String(input.maxItems)} items, got ${String(items.length)}.`,
      ),
    );
  }
  const keys = input.fields.map((field) => field.key);
  // An index loop also visits the holes of a sparse array, which are no items.
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const itemPath = pointer(path, index);
    if (!isPlainObject(item)) {
      errors.push(error(itemPath, 'Expected an object with a value for each field.'));
      continue;
    }
    for (const field of input.fields) {
      const fieldPath = pointer(itemPath, field.key);
      if (!Object.hasOwn(item, field.key)) {
        errors.push(error(fieldPath, `Missing the field "${field.key}".`));
        continue;
      }
      const problem = valueProblem(field, item[field.key]);
      if (problem !== null) errors.push(error(fieldPath, problem));
    }
    for (const key of Object.keys(item).sort()) {
      if (!keys.includes(key)) {
        errors.push(error(pointer(itemPath, key), `The items have no field "${key}".`));
      }
    }
  }
  return errors;
}

type MutableNode = Record<string, unknown>;

/** Every node of a composition by ID, group children included, as mutable records. */
function nodesById(composition: Composition): Map<string, MutableNode> {
  const nodes = new Map<string, MutableNode>();
  const visit = (node: SceneNode | Extract<SceneNode, { type: 'group' }>['children'][number]) => {
    nodes.set(node.id, node);
    if (node.type === 'group') node.children.forEach(visit);
  };
  for (const scene of composition.scenes) scene.nodes.forEach(visit);
  return nodes;
}

/**
 * Makes a composition from a template and the values of its inputs (D58.4):
 *
 * 1. the values are validated against the inputs — an own key that is no
 *    input is `unknown-input`, a value of the wrong type or outside its
 *    constraints `invalid-input-value`, each naming the input and the path of
 *    the value; an input left out takes its default;
 * 2. every binding writes its input's value: a property takes it whole, an
 *    asset takes it as its content hash, and every placeholder `{{inputId}}`
 *    of a bound text becomes the text of its value, a number as ECMAScript
 *    writes it;
 * 3. the template section is emptied, and the result is validated in full as
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
  if (!isPlainObject(values)) {
    return failure([
      {
        code: 'invalid-values',
        inputId: null,
        path: '',
        message: 'The values must be a plain object keyed by input ID.',
      },
    ]);
  }
  const { inputs, bindings } = template.template;
  const errors: TemplateError[] = [];
  const resolved = new Map<string, unknown>();
  for (const input of inputs) {
    if (!Object.hasOwn(values, input.id)) {
      resolved.set(input.id, defaultOf(input));
      continue;
    }
    const value = values[input.id];
    const problems = valueErrors(input, value);
    errors.push(...problems);
    resolved.set(input.id, value);
  }
  for (const key of Object.keys(values).sort()) {
    if (!inputs.some((input) => input.id === key)) {
      errors.push({
        code: 'unknown-input',
        inputId: key,
        path: pointer('', key),
        message: `The template has no input "${key}".`,
      });
    }
  }
  if (errors.length > 0) return failure(errors);

  // A JSON round trip: a tree that shares nothing with the template, the caller's to keep.
  const result = JSON.parse(JSON.stringify(template)) as Composition;
  const nodes = nodesById(result);
  const assets = new Map(
    result.assets.map((asset) => [asset.id, asset as unknown as Record<string, unknown>]),
  );
  for (const binding of bindings) {
    if (binding.kind === 'asset') {
      const asset = assets.get(binding.assetId);
      if (asset !== undefined) asset['contentHash'] = resolved.get(binding.inputId);
      continue;
    }
    const node = nodes.get(binding.nodeId);
    if (node === undefined) continue;
    if (binding.kind === 'property') {
      node[binding.property] = resolved.get(binding.inputId);
      continue;
    }
    const text = node['text'];
    const parts = typeof text === 'string' ? patternParts(text) : null;
    if (parts === null) continue;
    node['text'] = parts
      .map((part) => {
        if (typeof part === 'string') return part;
        const value = resolved.get(part.inputId);
        return typeof value === 'number' ? numberText(value) : String(value);
      })
      .join('');
  }
  (result as unknown as Record<string, unknown>)['template'] = { inputs: [], bindings: [] };

  const validated = validateComposition(result);
  if (!validated.ok) {
    return failure(
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

function failure(errors: readonly TemplateError[]): InstantiationResult {
  return Object.freeze({
    ok: false,
    errors: Object.freeze(errors.map((error) => Object.freeze(error))),
  });
}
