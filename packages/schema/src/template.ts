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
import { templateStructure } from './template-structure.js';
import { copiedFrom, copyId, numberText, patternParts, valueProblem } from './template-values.js';
import type {
  Composition,
  SceneNode,
  TemplateCondition,
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
  /** The copies of the repeats would hold too many IDs, or times past the safe integers (D59.4). */
  | 'repeat-limit'
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

type Mutable = Record<string, unknown>;

/** The most IDs the copies of one instantiation hold together (D59.4): a typed limit. */
export const MAX_REPEAT_IDS = 100_000;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Every node of a composition by ID, group children included, as mutable records. */
function nodesById(composition: Composition): Map<string, Mutable> {
  const nodes = new Map<string, Mutable>();
  const visit = (node: SceneNode | Extract<SceneNode, { type: 'group' }>['children'][number]) => {
    nodes.set(node.id, node);
    if (node.type === 'group') node.children.forEach(visit);
  };
  for (const scene of composition.scenes) scene.nodes.forEach(visit);
  return nodes;
}

/** The value of a condition's test of its input's value (D59.1). */
function holds(condition: TemplateCondition, value: unknown): boolean {
  switch (condition.test) {
    case 'empty':
      return typeof value === 'string'
        ? value.length === 0
        : (value as readonly unknown[]).length === 0;
    case 'not-empty':
      return typeof value === 'string'
        ? value.length > 0
        : (value as readonly unknown[]).length > 0;
    case 'true':
      return value === true;
    case 'false':
      return value === false;
    case 'equal-text':
    case 'equal-number':
      return value === condition.value;
  }
}

/** The text of a pattern with its placeholders filled from the inputs and, in a copy, its item (D58.2, D59.3). */
function filled(
  text: string,
  resolved: ReadonlyMap<string, unknown>,
  item: Readonly<Record<string, unknown>> | null,
): string {
  const parts = patternParts(text);
  if (parts === null) return text;
  return parts
    .map((part) => {
      if (typeof part === 'string') return part;
      const value = part.key === null ? resolved.get(part.inputId) : item?.[part.key];
      return typeof value === 'number' ? numberText(value) : String(value);
    })
    .join('');
}

/** A copy of a value whose IDs, and the references to them, are those of copy `index` (D59.2). */
function copied(
  value: unknown,
  renamed: ReadonlySet<string>,
  assets: ReadonlySet<string>,
  index: number,
): unknown {
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).map((item) => copied(item, renamed, assets, index));
  }
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]): [string, unknown] => {
      if (typeof child === 'string') {
        if (
          (key === 'id' || key === 'fromNodeId' || key === 'toNodeId' || key === 'nodeId') &&
          renamed.has(child)
        ) {
          return [key, copyId(child, index)];
        }
        if (key === 'assetId' && assets.has(child)) return [key, copyId(child, index)];
        return [key, child];
      }
      return [key, copied(child, renamed, assets, index)];
    }),
  );
}

/** Moves every scene time of a node, its children, keyframes, effects, mask, words, and accents, by `offset` (D59.2, D69, D71, D75). */
function shifted(node: Mutable, offset: bigint): boolean {
  let safe = true;
  const move = (holder: Mutable, key: string): void => {
    const time = BigInt(holder[key] as number) + offset;
    if (time > MAX_SAFE) safe = false;
    holder[key] = Number(time);
  };
  const visit = (member: Mutable): void => {
    move(member, 'startUs');
    const animations = member['animations'];
    if (Array.isArray(animations)) {
      for (const animation of animations as Mutable[]) {
        for (const keyframe of animation['keyframes'] as Mutable[]) move(keyframe, 'timeUs');
      }
    }
    // The keyframes of its effects are scene times like its own (D71).
    const effects = member['effects'];
    if (Array.isArray(effects)) {
      for (const effect of effects as Mutable[]) {
        for (const animation of effect['animations'] as Mutable[]) {
          for (const keyframe of animation['keyframes'] as Mutable[]) move(keyframe, 'timeUs');
        }
      }
    }
    // So are the keyframes of its mask (D75).
    const mask = member['mask'] as Mutable | undefined;
    if (mask !== undefined && Array.isArray(mask['animations'])) {
      for (const animation of mask['animations'] as Mutable[]) {
        for (const keyframe of animation['keyframes'] as Mutable[]) move(keyframe, 'timeUs');
      }
    }
    const words = member['words'];
    if (Array.isArray(words)) for (const word of words as Mutable[]) move(word, 'startUs');
    // The scene time of an accent moves with its node like a keyframe (D69).
    const textAnimations = member['textAnimations'];
    if (Array.isArray(textAnimations)) {
      for (const item of textAnimations as Mutable[]) {
        const phase = item['phase'] as Mutable;
        if (phase['kind'] === 'accent') move(phase, 'startUs');
      }
    }
    const children = member['children'];
    if (Array.isArray(children)) for (const child of children as Mutable[]) visit(child);
  };
  visit(node);
  return safe;
}

/** Where an element lives: the array that holds it and its index there. */
function placeOf(
  composition: Composition,
  id: string,
): { list: unknown[]; index: number; sceneIndex: number } | null {
  const scenes = composition.scenes as unknown as Mutable[];
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (scene['id'] === id) return { list: scenes, index: sceneIndex, sceneIndex };
    const nodes = scene['nodes'] as Mutable[];
    for (const [index, node] of nodes.entries()) {
      if (node['id'] === id) return { list: nodes, index, sceneIndex };
      const children = node['children'];
      if (Array.isArray(children)) {
        const at = (children as Mutable[]).findIndex((child) => child['id'] === id);
        if (at >= 0) return { list: children as unknown[], index: at, sceneIndex };
      }
    }
  }
  return null;
}

/** Every `id` of a value, at any depth. */
function idsOf(value: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value as readonly unknown[]) idsOf(item, into);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' && typeof child === 'string') into.add(child);
      else idsOf(child, into);
    }
  }
  return into;
}

/** Every node of a value that is a scene, a node, or a list of them. */
function nodesIn(value: Mutable): Mutable[] {
  const found: Mutable[] = [];
  const visit = (node: Mutable): void => {
    found.push(node);
    const children = node['children'];
    if (Array.isArray(children)) (children as Mutable[]).forEach(visit);
  };
  const nodes = value['nodes'];
  if (Array.isArray(nodes)) (nodes as Mutable[]).forEach(visit);
  else visit(value);
  return found;
}

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
  const { inputs, bindings, conditions, repeats } = template.template;
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
  const itemsOf = (inputId: string): readonly Readonly<Record<string, unknown>>[] =>
    resolved.get(inputId) as readonly Readonly<Record<string, unknown>>[];
  // The durations a repeat reads from its items (D59.2).
  for (const repeat of repeats) {
    if (repeat.duration !== 'field') continue;
    itemsOf(repeat.inputId).forEach((item, index) => {
      const duration = item[repeat.key];
      if (typeof duration === 'number' && Number.isSafeInteger(duration) && duration >= 1) return;
      errors.push({
        code: 'invalid-input-value',
        inputId: repeat.inputId,
        path: pointer(pointer(pointer('', repeat.inputId), index), repeat.key),
        message: `The duration of a copy of "${repeat.targetId}": a whole number of microseconds from 1.`,
      });
    });
  }
  if (errors.length > 0) return failure(errors);

  // A JSON round trip: a tree that shares nothing with the template, the caller's to keep.
  const result = JSON.parse(JSON.stringify(template)) as Composition;
  const structure = templateStructure(result);
  const nodes = nodesById(result);
  const assets = new Map(result.assets.map((asset) => [asset.id, asset as unknown as Mutable]));
  for (const binding of bindings) {
    if (binding.kind === 'asset') {
      const asset = assets.get(binding.assetId);
      if (asset !== undefined) asset['contentHash'] = resolved.get(binding.inputId);
    } else if (binding.kind === 'property') {
      const node = nodes.get(binding.nodeId);
      if (node !== undefined) node[binding.property] = resolved.get(binding.inputId);
    }
  }

  // Conditions (D59.1): an element is kept only while every one of its conditions holds.
  const removed = new Set<string>();
  for (const condition of conditions) {
    if (!holds(condition, resolved.get(condition.inputId))) removed.add(condition.targetId);
  }
  const mutable = result as unknown as Mutable;
  if (removed.size > 0) {
    const keep = (entity: unknown): boolean => !removed.has((entity as Mutable)['id'] as string);
    mutable['scenes'] = (result.scenes as unknown as Mutable[]).filter(keep);
    for (const scene of mutable['scenes'] as Mutable[]) {
      scene['nodes'] = (scene['nodes'] as Mutable[]).filter(keep);
      for (const node of scene['nodes'] as Mutable[]) {
        if (Array.isArray(node['children']))
          node['children'] = (node['children'] as Mutable[]).filter(keep);
      }
    }
  }

  // Repeats (D59.2): every target becomes one copy per item, and its references follow.
  const placeholders = new Map<string, true>();
  for (const binding of bindings)
    if (binding.kind === 'placeholders') placeholders.set(binding.nodeId, true);
  const assetCopies = new Map<string, Mutable[]>();
  const firstAndLast = new Map<string, readonly [string, string] | null>();
  let copiedIds = 0;
  for (const repeat of repeats) {
    const place = placeOf(result, repeat.targetId);
    const users = (assetId: string): boolean =>
      (structure.assetUsers.get(assetId) ?? []).some(
        (user) => user !== null && structure.repeatHolding(user)?.id === repeat.id,
      );
    const itemAssets = bindings.filter(
      (binding): binding is Extract<typeof binding, { kind: 'item-asset' }> =>
        binding.kind === 'item-asset' &&
        binding.inputId === repeat.inputId &&
        users(binding.assetId),
    );
    for (const binding of itemAssets) assetCopies.set(binding.assetId, []);
    if (place === null) continue;
    const target = place.list[place.index] as Mutable;
    const items = itemsOf(repeat.inputId);
    const renamed = idsOf(target, new Set());
    copiedIds += (renamed.size + itemAssets.length) * items.length;
    if (copiedIds > MAX_REPEAT_IDS) {
      return failure([
        {
          code: 'repeat-limit',
          inputId: repeat.inputId,
          path: pointer('', repeat.inputId),
          message: `The copies of the repeats would hold more than ${String(MAX_REPEAT_IDS)} IDs.`,
        },
      ]);
    }
    const assetIds = new Set(itemAssets.map((binding) => binding.assetId));
    const isScene = place.list === (mutable['scenes'] as unknown[]);
    let offset = 0n;
    const copies = items.map((item, index) => {
      const copy = copied(target, renamed, assetIds, index) as Mutable;
      const durationUs =
        repeat.duration === 'field'
          ? (item[repeat.key] as number)
          : (target['durationUs'] as number);
      if (!isScene && !shifted(copy, offset)) {
        errors.push({
          code: 'repeat-limit',
          inputId: repeat.inputId,
          path: pointer(pointer('', repeat.inputId), index),
          message: `A copy of "${repeat.targetId}" would start past the safe integers.`,
        });
      }
      copy['durationUs'] = durationUs;
      offset += BigInt(durationUs);
      for (const node of nodesIn(copy)) {
        const from = copiedFrom(node['id'] as string) ?? '';
        for (const binding of bindings) {
          if (binding.kind === 'item-property' && binding.nodeId === from) {
            node[binding.property] = item[binding.key];
          }
        }
        if (placeholders.has(from) && typeof node['text'] === 'string') {
          node['text'] = filled(node['text'], resolved, item);
        }
      }
      for (const binding of itemAssets) {
        const asset = assets.get(binding.assetId);
        if (asset === undefined) continue;
        assetCopies.get(binding.assetId)?.push({
          ...asset,
          id: copyId(binding.assetId, index),
          contentHash: item[binding.key],
        });
      }
      return copy;
    });
    place.list.splice(place.index, 1, ...copies);
    if (isScene) {
      const ids = copies.map((copy) => copy['id'] as string);
      firstAndLast.set(repeat.targetId, ids.length === 0 ? null : [ids[0] ?? '', ids.at(-1) ?? '']);
    }
  }
  if (errors.length > 0) return failure(errors);

  // Every placeholder of an input outside the copies (D58.2).
  for (const [id] of placeholders) {
    const node = nodes.get(id);
    if (node !== undefined && typeof node['text'] === 'string') {
      node['text'] = filled(node['text'], resolved, null);
    }
  }
  // An asset bound to a field is one asset per item, where it stood (D59.3).
  if (assetCopies.size > 0) {
    mutable['assets'] = (result.assets as unknown as Mutable[]).flatMap(
      (asset) => assetCopies.get(asset['id'] as string) ?? [asset],
    );
  }
  // Transitions follow their scenes and nodes: to the first copy, from the last, or away (D59.1, D59.2).
  const sceneIds = new Set((mutable['scenes'] as Mutable[]).map((scene) => scene['id'] as string));
  mutable['transitions'] = (result.transitions as unknown as Mutable[]).flatMap((transition) => {
    let from = transition['fromSceneId'] as string;
    let to = transition['toSceneId'] as string;
    const outgoing = firstAndLast.get(from);
    const incoming = firstAndLast.get(to);
    if (outgoing === null || incoming === null) return [];
    if (outgoing !== undefined) from = outgoing[1];
    if (incoming !== undefined) to = incoming[0];
    if (!sceneIds.has(from) || !sceneIds.has(to)) return [];
    return [{ ...transition, fromSceneId: from, toSceneId: to }];
  });
  let totalUs = 0n;
  for (const scene of mutable['scenes'] as Mutable[]) {
    const ids = new Set(nodesIn(scene).map((node) => node['id'] as string));
    // A matte follows its node: a node whose matte a condition removed takes none (D75).
    for (const node of nodesIn(scene)) {
      const matte = node['matte'] as Mutable | undefined;
      if (matte?.['kind'] === 'node' && !ids.has(matte['nodeId'] as string)) {
        node['matte'] = { kind: 'none' };
      }
    }
    scene['transitions'] = (scene['transitions'] as Mutable[]).filter(
      (transition) =>
        ids.has(transition['fromNodeId'] as string) && ids.has(transition['toNodeId'] as string),
    );
    totalUs += BigInt(scene['durationUs'] as number);
  }
  for (const transition of mutable['transitions'] as Mutable[]) {
    totalUs -= BigInt(transition['durationUs'] as number);
  }
  if (removed.size > 0 || repeats.length > 0) mutable['durationUs'] = Number(totalUs);
  mutable['template'] = { inputs: [], bindings: [], conditions: [], repeats: [] };

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
