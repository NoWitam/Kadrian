/**
 * Elements at one instant (D77): an instance of a definition with a template
 * carries the state of its definition instantiated with the instance's
 * values, exactly the state of that instantiation placed directly in a
 * composition of the definition's canvas, IDs aside.
 */
import type { Composition, InstanceInput, ValidatedComposition } from '@kadrion/schema';
import { definitionTimeUs } from '@kadrion/schema';
import { instantiateTemplate } from '@kadrion/schema/template';
import { elementsComposition, elementsGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition, type InstanceNodeState, type NodeState } from '../src/index.js';
import { validated } from './support.js';

const composition = validated(elementsComposition);

type Instance = Extract<Composition['scenes'][number]['nodes'][number], { type: 'instance' }>;

const instances = (composition.scenes[0]?.nodes ?? []).filter(
  (node): node is Instance => node.type === 'instance',
);

function instanceState(timeUs: number, id: string): InstanceNodeState {
  const found = evaluateComposition(composition, timeUs).scenes[0]?.nodes.find(
    (node: NodeState) => node.id === id,
  );
  if (found?.type !== 'instance') throw new Error(`No instance ${id}.`);
  return found;
}

/** The values a host gives `instantiateTemplate` for the inputs an instance stores. */
function hostValues(inputs: readonly InstanceInput[]): Record<string, unknown> {
  return Object.fromEntries(
    inputs.map((input) => [
      input.inputId,
      input.type === 'list'
        ? input.value.map((item) => Object.fromEntries(item.map(({ key, value }) => [key, value])))
        : input.value,
    ]),
  );
}

/** The definition of an instance, instantiated with its values as a composition of its own canvas. */
function placedDirectly(instance: Instance): ValidatedComposition {
  const definition = composition.definitions.find(({ id }) => id === instance.definitionId);
  if (definition === undefined) throw new Error(`No definition ${instance.definitionId}.`);
  const template = validated({
    ...(structuredClone(elementsComposition) as object),
    width: definition.width,
    height: definition.height,
    durationUs: definition.durationUs,
    scenes: [
      {
        id: 'scene-direct',
        durationUs: definition.durationUs,
        nodes: definition.nodes,
        clips: definition.clips,
        transitions: definition.transitions,
        effects: [],
      },
    ],
    clips: [],
    transitions: [],
    // The definitions of the fixture hold no instances, so the copy needs none.
    definitions: [],
    template: definition.template,
  });
  const result = instantiateTemplate(template, hostValues(instance.inputs));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

describe('an element instance in the state (D77)', () => {
  it('shows its definition instantiated with its values, as placed directly', () => {
    for (const instance of instances) {
      const direct = placedDirectly(instance);
      for (const { timeUs } of elementsGoldenTimestamps) {
        const state = instanceState(timeUs, instance.id);
        const definitionTime = definitionTimeUs(instance, timeUs);
        expect(state.definitionTimeUs).toBe(definitionTime);
        const nodes = evaluateComposition(direct, definitionTime).scenes[0]?.nodes;
        // Inside the instance every ID is addressed by the path to it (D76).
        const unscoped = JSON.stringify(state.nodes).split(`"${instance.id}/`).join('"');
        expect(unscoped, `${instance.id} at ${String(timeUs)}`).toBe(JSON.stringify(nodes));
      }
    }
  });

  it('keeps the nodes whose conditions hold and writes the values into them', () => {
    const ids = (id: string): string[] => instanceState(500_000, id).nodes.map((node) => node.id);
    expect(ids('third-a')).toEqual([
      'third-a/lt-background',
      'third-a/lt-title',
      'third-a/lt-badge',
    ]);
    // The second lower third gives show-badge false.
    expect(ids('third-b')).toEqual(['third-b/lt-background', 'third-b/lt-title']);
    // The speech is bold: the plain captions are gone.
    expect(ids('speech-a')).toEqual(['speech-a/sp-bold']);
  });

  it('is the same state for the same time, whatever was evaluated before', () => {
    for (const { timeUs } of elementsGoldenTimestamps) {
      const first = JSON.stringify(evaluateComposition(composition, timeUs));
      evaluateComposition(composition, 1_999_999);
      expect(JSON.stringify(evaluateComposition(composition, timeUs))).toBe(first);
    }
  });
});
