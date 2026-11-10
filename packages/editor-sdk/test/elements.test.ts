/**
 * The commands of elements (D77): the values of an instance set and cleared,
 * a definition replaced whole, and the refusals that keep the instances and
 * the templates of definitions consistent. Each edit is undone by its inverse
 * to the exact text of the document before it.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { captionsComposition, elementsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, describeDocument, type Command } from '../src/index.js';

import { codeOf, errorOf, json, validated } from './support.js';

const elements = validated(elementsComposition);

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(document: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(document, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(document));
  return result.document;
}

interface Instance {
  id: string;
  type: string;
  inputs: { inputId: string; type: string; value: unknown }[];
}

interface DefinitionView {
  id: string;
  nodes: { id: string; [field: string]: unknown }[];
  template: { inputs: { id: string; [field: string]: unknown }[]; bindings: unknown[] };
  [field: string]: unknown;
}

function instance(document: unknown, id: string): Instance {
  const nodes = (document as { scenes: { nodes: Instance[] }[] }).scenes[0]?.nodes ?? [];
  const found = nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`No instance ${id}.`);
  return found;
}

function lowerThird(document: unknown = elements): DefinitionView {
  const found = (document as { definitions: DefinitionView[] }).definitions.find(
    ({ id }) => id === 'lower-third',
  );
  if (found === undefined) throw new Error('No lower third.');
  return structuredClone(found);
}

describe('SetInstanceInput and ClearInstanceInput (D77)', () => {
  it('replaces the value of an input, and undoes it', () => {
    const command: Command = {
      type: 'SetInstanceInput',
      instanceId: 'third-a',
      input: { inputId: 'title', type: 'text', value: 'Motion' },
    };
    const result = applyCommand(elements, command);
    expect(instance(result.document, 'third-a').inputs).toEqual([
      { inputId: 'accent', type: 'color', value: '#12b76a' },
      { inputId: 'title', type: 'text', value: 'Motion' },
    ]);
    expect(result.inverse).toEqual({
      type: 'SetInstanceInput',
      instanceId: 'third-a',
      input: { inputId: 'title', type: 'text', value: 'Dance' },
    });
    expect(result.createdIds).toEqual([]);
    roundTrip(elements, command);
  });

  it('inserts a value in the order of the input IDs, and clears it as its inverse', () => {
    const command: Command = {
      type: 'SetInstanceInput',
      instanceId: 'third-b',
      input: { inputId: 'accent', type: 'color', value: '#000000' },
    };
    const result = applyCommand(elements, command);
    expect(instance(result.document, 'third-b').inputs.map(({ inputId }) => inputId)).toEqual([
      'accent',
      'show-badge',
      'title',
    ]);
    expect(result.inverse).toEqual({
      type: 'ClearInstanceInput',
      instanceId: 'third-b',
      inputId: 'accent',
    });
    roundTrip(elements, command);
  });

  it('changes nothing for the value the instance already gives', () => {
    const result = applyCommand(elements, {
      type: 'SetInstanceInput',
      instanceId: 'third-a',
      input: { inputId: 'title', type: 'text', value: 'Dance' },
    });
    expect(result.inverse).toBeNull();
    expect(result.document).toBe(elements);
  });

  it('clears a value, which then takes its default, and sets it again as its inverse', () => {
    const command: Command = {
      type: 'ClearInstanceInput',
      instanceId: 'third-a',
      inputId: 'title',
    };
    const result = applyCommand(elements, command);
    expect(instance(result.document, 'third-a').inputs).toEqual([
      { inputId: 'accent', type: 'color', value: '#12b76a' },
    ]);
    expect(result.inverse).toEqual({
      type: 'SetInstanceInput',
      instanceId: 'third-a',
      input: { inputId: 'title', type: 'text', value: 'Dance' },
    });
    roundTrip(elements, command);
    // An input without a value already takes its default.
    const again = applyCommand(result.document, command);
    expect(again.inverse).toBeNull();
  });

  it('refuses an input the definition does not have, a node that is no instance, and a value that does not fit', () => {
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'SetInstanceInput',
          instanceId: 'third-a',
          input: { inputId: 'subtitle', type: 'text', value: 'x' },
        }),
      ),
    ).toBe('unknown-input');
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'ClearInstanceInput',
          instanceId: 'third-a',
          inputId: 'subtitle',
        }),
      ),
    ).toBe('unknown-input');
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'ClearInstanceInput',
          instanceId: 'elements-background',
          inputId: 'title',
        }),
      ),
    ).toBe('unsupported-node');
    expect(
      codeOf(() =>
        applyCommand(elements, { type: 'ClearInstanceInput', instanceId: 'none', inputId: 'x' }),
      ),
    ).toBe('unknown-node');
    // Longer than the input's 40 characters.
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'SetInstanceInput',
          instanceId: 'third-a',
          input: { inputId: 'title', type: 'text', value: 'x'.repeat(41) },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'SetInstanceInput',
          instanceId: 'third-a',
          input: { inputId: 'title', type: 'number', value: 1 },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(elements, { type: 'SetInstanceInput', instanceId: 'third-a', input: {} }),
      ),
    ).toBe('invalid-result');
  });
});

describe('ReplaceDefinition (D77)', () => {
  it('replaces a definition whole in its place, and undoes it to the same bytes', () => {
    const definition = lowerThird();
    const title = definition.template.inputs.find(({ id }) => id === 'title');
    if (title === undefined) throw new Error('No title.');
    title['maxLength'] = 60;
    definition['sourceHash'] = `sha256:${'a'.repeat(64)}`;
    const command: Command = { type: 'ReplaceDefinition', definitionId: 'lower-third', definition };
    const result = applyCommand(elements, command);
    expect(lowerThird(result.document)).toEqual(definition);
    expect(result.inverse).toEqual({
      type: 'ReplaceDefinition',
      definitionId: 'lower-third',
      definition: lowerThird(),
    });
    expect(result.createdIds).toEqual([]);
    roundTrip(elements, command);
    // The same definition changes nothing.
    expect(
      applyCommand(elements, {
        type: 'ReplaceDefinition',
        definitionId: 'lower-third',
        definition: lowerThird(),
      }).inverse,
    ).toBeNull();
  });

  it('reports the IDs it adds and removes, and refuses an ID the document uses', () => {
    const definition = lowerThird();
    definition.nodes = definition.nodes.map((node) =>
      node.id === 'lt-badge' ? { ...node, id: 'lt-badge-2' } : node,
    );
    const [condition] = (definition.template as unknown as { conditions: { targetId: string }[] })
      .conditions;
    if (condition === undefined) throw new Error('No condition.');
    condition.targetId = 'lt-badge-2';
    const result = applyCommand(elements, {
      type: 'ReplaceDefinition',
      definitionId: 'lower-third',
      definition,
    });
    expect(result.createdIds).toEqual(['lt-badge-2']);
    const taken = lowerThird();
    taken.nodes = taken.nodes.map((node) =>
      node.id === 'lt-badge' ? { ...node, id: 'third-a' } : node,
    );
    const error = errorOf(() =>
      applyCommand(elements, {
        type: 'ReplaceDefinition',
        definitionId: 'lower-third',
        definition: taken,
      }),
    );
    expect(error.code).toBe('id-in-use');
    expect(error.details).toEqual(['third-a']);
  });

  it('refuses another ID, and names the instances whose values would no longer fit', () => {
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'ReplaceDefinition',
          definitionId: 'lower-third',
          definition: { ...lowerThird(), id: 'speech' },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(elements, {
          type: 'ReplaceDefinition',
          definitionId: 'none',
          definition: lowerThird(),
        }),
      ),
    ).toBe('unknown-definition');
    // The title gets shorter than the values the instances give.
    const definition = lowerThird();
    const title = definition.template.inputs.find(({ id }) => id === 'title');
    if (title === undefined) throw new Error('No title.');
    title['maxLength'] = 5;
    title['default'] = 'Kad';
    const error = errorOf(() =>
      applyCommand(elements, {
        type: 'ReplaceDefinition',
        definitionId: 'lower-third',
        definition,
      }),
    );
    expect(error.code).toBe('instance-inputs-mismatch');
    expect(error.details).toEqual(['third-b']);
  });

  it('removes an input in one transaction with the values that give it, undone to the same bytes', () => {
    const definition = lowerThird();
    definition.template.inputs = definition.template.inputs.filter(({ id }) => id !== 'accent');
    definition.template.bindings = definition.template.bindings.filter(
      (binding) => (binding as { inputId?: string }).inputId !== 'accent',
    );
    const replace: Command = { type: 'ReplaceDefinition', definitionId: 'lower-third', definition };
    const alone = errorOf(() => applyCommand(elements, replace));
    expect(alone.code).toBe('instance-inputs-mismatch');
    expect(alone.details).toEqual(['third-a']);
    const bus = createCommandBus(elements);
    bus.dispatchTransaction([
      { type: 'ClearInstanceInput', instanceId: 'third-a', inputId: 'accent' },
      replace,
    ]);
    expect(instance(bus.getDocument(), 'third-a').inputs.map(({ inputId }) => inputId)).toEqual([
      'title',
    ]);
    bus.undo();
    expect(json(bus.getDocument())).toBe(json(elements));
  });
});

describe('the other commands and elements (D77)', () => {
  it('names the bindings inside a definition that an edit of its node would break', () => {
    const error = errorOf(() => applyCommand(elements, { type: 'RemoveNode', nodeId: 'lt-title' }));
    expect(error.code).toBe('binding-in-use');
    expect(error.details).toEqual(['lt-title-text']);
  });

  it('expands no element instance', () => {
    expect(
      codeOf(() => applyCommand(elements, { type: 'ExpandInstance', instanceId: 'third-a' })),
    ).toBe('instance-not-expandable');
  });

  it('describes the source hash and the template of each definition', () => {
    const [third, speech] = describeDocument(elements).definitions;
    expect(third?.sourceHash).toBe(lowerThird()['sourceHash']);
    expect(third?.template.inputs.map((input) => (input as { id: string }).id)).toEqual([
      'title',
      'accent',
      'show-badge',
    ]);
    expect(speech?.sourceHash).toBe('');
  });

  it('writes the new default of a list into the words of a captions node bound to it', () => {
    const draft = structuredClone(captionsComposition) as {
      scenes: { nodes: { id: string; type: string; words?: unknown[] }[] }[];
      template: { inputs: unknown[]; bindings: unknown[] };
    };
    const node = draft.scenes[0]?.nodes.find(({ type }) => type === 'captions');
    if (node === undefined) throw new Error('No captions.');
    node.words = [{ text: 'Kadrion', startUs: 200_000, durationUs: 300_000 }];
    const listOf = (text: string): unknown[] => [
      [
        { key: 'text', type: 'text', value: text },
        { key: 'startUs', type: 'number', value: 200_000 },
        { key: 'durationUs', type: 'number', value: 300_000 },
      ],
    ];
    const input = {
      id: 'words',
      type: 'list',
      minItems: 1,
      maxItems: 10,
      fields: [
        { key: 'text', type: 'text', minLength: 1, maxLength: 20 },
        { key: 'startUs', type: 'number', minimum: 0, maximum: 2_000_000 },
        { key: 'durationUs', type: 'number', minimum: 1, maximum: 2_000_000 },
      ],
      default: listOf('Kadrion'),
    };
    draft.template.inputs = [input];
    draft.template.bindings = [{ id: 'spoken', kind: 'words', nodeId: node.id, inputId: 'words' }];
    const document = validated(draft);
    const command: Command = {
      type: 'SetTemplateInput',
      inputId: 'words',
      input: { ...input, default: listOf('Motion') },
    };
    const edited = roundTrip(document, command);
    const words = (edited as unknown as typeof draft).scenes[0]?.nodes.find(
      ({ id }) => id === node.id,
    )?.words;
    expect(words).toEqual([{ text: 'Motion', startUs: 200_000, durationUs: 300_000 }]);
  });
});
