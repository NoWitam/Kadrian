/**
 * Elements in the schema (D77): an instance of a definition with a template
 * shows the definition as `instantiateTemplate` makes it with the instance's
 * values — bindings, the words of captions, conditions, and repeats — under the
 * paths of D76.3; the result does not depend on what was asked before; the
 * values are validated against the inputs and the instantiated definition as a
 * definition; and the copies of every instance count toward one budget.
 */
import { elementsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  instanceDefinition,
  validateComposition,
  type Composition,
  type InstanceNode,
  type ValidatedComposition,
} from '../src/index.js';
import { instantiateTemplate, MAX_REPEAT_IDS } from '../src/template.js';

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.composition;
}

const elements = validated(elementsComposition);

type Mutable = Record<string, unknown>;
type Draft = Mutable & {
  scenes: { nodes: Mutable[] }[];
  definitions: (Mutable & { id: string; nodes: Mutable[]; template: Mutable })[];
};

function draft(): Draft {
  return structuredClone(elementsComposition) as Draft;
}

function instanceOf(document: Composition, id: string): InstanceNode {
  const found = document.scenes[0]?.nodes.find((node) => node.id === id);
  if (found?.type !== 'instance') throw new Error(`No instance ${id}.`);
  return found;
}

/**
 * The definition seen as a composition of one scene, as a host would make a
 * template of it, so that `instantiateTemplate` instantiates it as a whole
 * document (D58.4).
 */
function asTemplate(document: Composition, definitionId: string): ValidatedComposition {
  const definition = document.definitions.find(({ id }) => id === definitionId);
  if (definition === undefined) throw new Error(`No definition ${definitionId}.`);
  return validated({
    ...document,
    width: definition.width,
    height: definition.height,
    durationUs: definition.durationUs,
    scenes: [
      {
        id: 'scene-of-definition',
        durationUs: definition.durationUs,
        nodes: definition.nodes,
        clips: definition.clips,
        transitions: definition.transitions,
        effects: [],
      },
    ],
    clips: [],
    transitions: [],
    definitions: [],
    template: definition.template,
  });
}

/** The values of an instance as a host gives them. */
function valuesOf(instance: InstanceNode): Record<string, unknown> {
  return Object.fromEntries(
    instance.inputs.map((input) => [
      input.inputId,
      input.type === 'list'
        ? input.value.map((item) => Object.fromEntries(item.map(({ key, value }) => [key, value])))
        : input.value,
    ]),
  );
}

/** Every ID of a value with the prefix of an instance's path taken off. */
function unprefixed(value: unknown, prefix: string): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => unprefixed(item, prefix));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        ['id', 'nodeId', 'fromNodeId', 'toNodeId'].includes(key) && typeof child === 'string'
          ? child.slice(prefix.length)
          : unprefixed(child, prefix),
      ]),
    );
  }
  return value;
}

describe('an element instance (D77)', () => {
  it.each(['third-a', 'third-b', 'speech-a'])(
    'shows its definition as instantiateTemplate makes it with its values: %s',
    (id) => {
      const instance = instanceOf(elements, id);
      const shown = instanceDefinition(elements, instance);
      const made = instantiateTemplate(
        asTemplate(elements, instance.definitionId),
        valuesOf(instance),
      );
      if (!made.ok) throw new Error(JSON.stringify(made.errors));
      const scene = made.composition.scenes[0];
      expect(shown).not.toBeNull();
      expect(JSON.stringify(unprefixed(shown?.nodes, `${id}/`))).toBe(JSON.stringify(scene?.nodes));
      expect(shown?.template).toEqual({ inputs: [], bindings: [], conditions: [], repeats: [] });
    },
  );

  it('fills placeholders, bound colours, and the words of captions, and keeps what its conditions hold', () => {
    const first = instanceDefinition(elements, instanceOf(elements, 'third-a'));
    expect(first?.nodes.map((node) => node.id)).toEqual([
      'third-a/lt-background',
      'third-a/lt-title',
      'third-a/lt-badge',
    ]);
    expect(first?.nodes[0]).toMatchObject({ color: '#12b76a' });
    expect(first?.nodes[1]).toMatchObject({ text: 'Dance' });
    const second = instanceDefinition(elements, instanceOf(elements, 'third-b'));
    // No badge: show-badge is false; the colour is the default.
    expect(second?.nodes.map((node) => node.id)).toEqual([
      'third-b/lt-background',
      'third-b/lt-title',
    ]);
    expect(second?.nodes[0]).toMatchObject({ color: '#f79009' });
    expect(second?.nodes[1]).toMatchObject({ text: 'Kadrion design' });
    const speech = instanceDefinition(elements, instanceOf(elements, 'speech-a'));
    expect(speech?.nodes.map((node) => node.id)).toEqual(['speech-a/sp-bold']);
    const [captions] = speech?.nodes ?? [];
    if (captions?.type !== 'captions') throw new Error('No captions.');
    expect(captions.words.map(({ text }) => text)).toEqual([
      'Dance',
      'on',
      'time',
      'and',
      'design',
    ]);
  });

  it('shows the definition with its defaults when it gives no value', () => {
    const document = draft();
    const third = document.scenes[0]?.nodes.find((node) => node['id'] === 'third-b');
    if (third === undefined) throw new Error('No instance.');
    third['inputs'] = [];
    const shown = instanceDefinition(
      validated(document),
      instanceOf(validated(document), 'third-b'),
    );
    expect(shown?.nodes.map((node) => node.id)).toEqual([
      'third-b/lt-background',
      'third-b/lt-title',
      'third-b/lt-badge',
    ]);
    expect(shown?.nodes[1]).toMatchObject({ text: 'Kadrion' });
  });

  it('gives the same result whatever was asked before, and a value of its own each time', () => {
    const instance = instanceOf(elements, 'speech-a');
    const fresh = JSON.stringify(
      instanceDefinition(
        validated(elementsComposition),
        instanceOf(validated(elementsComposition), 'speech-a'),
      ),
    );
    for (const id of ['third-a', 'third-b', 'speech-a', 'third-a']) {
      instanceDefinition(elements, instanceOf(elements, id));
    }
    const first = instanceDefinition(elements, instance) as unknown as Mutable;
    expect(JSON.stringify(first)).toBe(fresh);
    first['nodes'] = [];
    expect(JSON.stringify(instanceDefinition(elements, instance))).toBe(fresh);
  });

  it('repeats a node of its definition once for each item, one after another', () => {
    const document = draft();
    const lower = document.definitions[0];
    if (lower === undefined) throw new Error('No definition.');
    lower.template['inputs'] = [
      ...(lower.template['inputs'] as unknown[]),
      {
        id: 'dots',
        type: 'list',
        minItems: 0,
        maxItems: 4,
        fields: [{ key: 'name', type: 'text', minLength: 0, maxLength: 9 }],
        default: [[{ key: 'name', type: 'text', value: 'a' }]],
      },
    ];
    lower.template['repeats'] = [
      { id: 'dot-repeat', duration: 'target', targetId: 'lt-badge', inputId: 'dots' },
    ];
    const badge = lower.nodes[2];
    if (badge === undefined) throw new Error('No badge.');
    badge['durationUs'] = 500_000;
    const third = document.scenes[0]?.nodes.find((node) => node['id'] === 'third-a');
    if (third === undefined) throw new Error('No instance.');
    third['inputs'] = [
      { inputId: 'accent', type: 'color', value: '#12b76a' },
      {
        inputId: 'dots',
        type: 'list',
        value: [
          [{ key: 'name', type: 'text', value: 'x' }],
          [{ key: 'name', type: 'text', value: 'y' }],
          [{ key: 'name', type: 'text', value: 'z' }],
        ],
      },
    ];
    const valid = validated(document);
    const shown = instanceDefinition(valid, instanceOf(valid, 'third-a'));
    expect(shown?.nodes.map((node) => [node.id, node.startUs])).toEqual([
      ['third-a/lt-background', 0],
      ['third-a/lt-title', 0],
      ['third-a/lt-badge--0', 0],
      ['third-a/lt-badge--1', 500_000],
      ['third-a/lt-badge--2', 1_000_000],
    ]);
  });
});

describe('the validation of elements (D77)', () => {
  it('refuses a value outside the constraints of its input, at its path', () => {
    const document = draft();
    const third = document.scenes[0]?.nodes[1];
    if (third === undefined) throw new Error('No instance.');
    third['inputs'] = [{ inputId: 'title', type: 'text', value: '' }];
    const result = validateComposition(document);
    expect(result.ok ? [] : result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'instance-input-invalid', path: '/scenes/0/nodes/1/inputs/0/value' },
    ]);
  });

  it('refuses values for a definition that is no element', () => {
    const document = draft();
    const lower = document.definitions[0];
    if (lower === undefined) throw new Error('No definition.');
    // The template emptied, its pattern and colour plain values again.
    lower.template = { inputs: [], bindings: [], conditions: [], repeats: [] };
    const title = lower.nodes[1];
    if (title === undefined) throw new Error('No title.');
    title['text'] = 'Kadrion';
    const result = validateComposition(document);
    expect(result.ok ? [] : result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unresolved-input-reference', path: '/scenes/0/nodes/1/inputs/0/inputId' },
      { code: 'unresolved-input-reference', path: '/scenes/0/nodes/1/inputs/1/inputId' },
      { code: 'unresolved-input-reference', path: '/scenes/0/nodes/2/inputs/0/inputId' },
      { code: 'unresolved-input-reference', path: '/scenes/0/nodes/2/inputs/1/inputId' },
    ]);
  });

  it('counts the copies of every instance toward one budget', () => {
    const document = draft();
    const lower = document.definitions[0];
    if (lower === undefined) throw new Error('No definition.');
    const items = Array.from({ length: 10_000 }, () => [{ key: 'name', type: 'text', value: '' }]);
    lower.template['inputs'] = [
      ...(lower.template['inputs'] as unknown[]),
      {
        id: 'dots',
        type: 'list',
        minItems: 0,
        maxItems: 10_000,
        fields: [{ key: 'name', type: 'text', minLength: 0, maxLength: 9 }],
        default: [],
      },
    ];
    lower.template['repeats'] = [
      { id: 'dot-repeat', duration: 'target', targetId: 'lt-badge', inputId: 'dots' },
    ];
    const badge = lower.nodes[2];
    if (badge === undefined) throw new Error('No badge.');
    badge['durationUs'] = 1;
    const scene = document.scenes[0];
    if (scene === undefined) throw new Error('No scene.');
    const template = scene.nodes[1];
    if (template === undefined) throw new Error('No instance.');
    // Each instance copies the badge 10 000 times, and with it the ID of the copy.
    const count = Math.floor(MAX_REPEAT_IDS / 10_000) + 1;
    scene.nodes.splice(
      1,
      2,
      ...Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `third-${String(index)}`,
        inputs: [{ inputId: 'dots', type: 'list', value: items }],
      })),
    );
    const result = validateComposition(document);
    expect(result.ok ? [] : result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'instance-input-invalid', path: '/definitions' },
    ]);
    // One instance fewer stays within the budget.
    scene.nodes.splice(1, 1);
    expect(validateComposition(document).ok).toBe(true);
  });
});

describe('the words of a captions node bound to a list (D77)', () => {
  it('is filled by instantiateTemplate in a document of its own too', () => {
    const template = asTemplate(elements, 'speech');
    const made = instantiateTemplate(template, {
      words: [
        { text: 'Kadrion', startUs: 0, durationUs: 100_000 },
        { text: 'design', startUs: 100_000, durationUs: 100_000 },
      ],
      style: 'plain',
    });
    if (!made.ok) throw new Error(JSON.stringify(made.errors));
    const [captions] = made.composition.scenes[0]?.nodes ?? [];
    if (captions?.type !== 'captions') throw new Error('No captions.');
    expect(captions.id).toBe('sp-plain');
    expect(captions.words).toEqual([
      { text: 'Kadrion', startUs: 0, durationUs: 100_000 },
      { text: 'design', startUs: 100_000, durationUs: 100_000 },
    ]);
  });

  it('refuses words that are no timed words, as invalid-composition', () => {
    const made = instantiateTemplate(asTemplate(elements, 'speech'), {
      words: [{ text: 'Kadrion', startUs: 0, durationUs: 100_000.5 }],
    });
    expect(made.ok ? [] : made.errors.map(({ code }) => code)).toEqual(['invalid-composition']);
  });
});
