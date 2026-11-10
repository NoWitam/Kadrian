/**
 * Nested compositions in the schema (D76): the path IDs of a placed
 * definition, the refusals of validation (an unknown definition, an instance
 * longer than what it shows, a cycle, and a nesting deeper than 8), and the
 * sounds of definitions in the audio plan, placed and cut by the rule of
 * time of an instance. The expected values are derived by hand from the
 * nested fixture.
 */
import { nestedComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  audioPlan,
  instanceDefinition,
  MAX_INSTANCE_DEPTH,
  validateComposition,
  type Composition,
  type ValidatedComposition,
} from '../src/index.js';

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.composition;
}

const nested = validated(nestedComposition);

type Draft = { -readonly [K in keyof Composition]: unknown } & {
  scenes: { nodes: Record<string, unknown>[] }[];
  definitions: { id: string; nodes: Record<string, unknown>[] }[];
};

function draft(): Draft {
  return structuredClone(nestedComposition) as Draft;
}

function sceneInstance(document: Draft, id: string): Record<string, unknown> {
  const found = document.scenes[0]?.nodes.find((node) => node['id'] === id);
  if (found === undefined) throw new Error(`No node ${id}.`);
  return found;
}

function codes(input: unknown): string[] {
  const result = validateComposition(input);
  return result.ok ? [] : result.errors.map(({ code, path }) => `${code} ${path}`);
}

describe('the definition an instance places (D76)', () => {
  it('addresses every ID inside by the path through the instance and keeps its own', () => {
    const card = instanceDefinition(nested, { id: 'card-left', definitionId: 'card' });
    expect(card?.id).toBe('card');
    expect(card?.nodes.map(({ id }) => id)).toEqual([
      'card-left/card-background',
      'card-left/card-photo',
      'card-left/card-title',
      'card-left/card-bar-a',
      'card-left/card-bar-b',
      'card-left/card-badge',
    ]);
    expect(card?.clips.map(({ id, assetId }) => [id, assetId])).toEqual([
      ['card-left/card-sound', 'asset-audio'],
    ]);
    expect(card?.transitions[0]).toMatchObject({
      id: 'card-left/card-bars',
      fromNodeId: 'card-left/card-bar-a',
      toNodeId: 'card-left/card-bar-b',
    });
    // The nested instance still names its definition as the document does.
    expect(card?.nodes[5]).toMatchObject({ type: 'instance', definitionId: 'badge' });
  });

  it('is null for a definition the document does not have', () => {
    expect(instanceDefinition(nested, { id: 'x', definitionId: 'none' })).toBeNull();
  });
});

describe('the validation of definitions and instances (D76)', () => {
  it('accepts the nested fixture', () => {
    expect(codes(nestedComposition)).toEqual([]);
  });

  it('refuses an instance of an unknown definition', () => {
    const document = draft();
    sceneInstance(document, 'card-left')['definitionId'] = 'none';
    expect(codes(document)).toEqual([
      'unresolved-definition-reference /scenes/0/nodes/1/definitionId',
    ]);
  });

  it('refuses an instance that shows more than its definition has', () => {
    const document = draft();
    sceneInstance(document, 'card-left')['sourceStartUs'] = 1;
    expect(codes(document)).toEqual([
      'instance-exceeds-definition /scenes/0/nodes/1/sourceStartUs',
    ]);
  });

  it('refuses a definition that holds itself', () => {
    const document = draft();
    const badge = document.definitions[1];
    const square = badge?.nodes[1];
    if (badge === undefined || square === undefined) throw new Error('No badge.');
    badge.nodes.push({
      ...sceneInstance(document, 'badge-solo'),
      id: 'badge-again',
      width: 10,
      height: 10,
      effects: [],
    });
    expect(codes(document)).toEqual(['definition-cycle /definitions/1']);
  });

  it(`accepts a nesting ${String(MAX_INSTANCE_DEPTH)} instances deep and refuses one deeper`, () => {
    const chain = (depth: number): Draft => {
      const document = draft();
      const leaf = document.definitions[1];
      if (leaf === undefined) throw new Error('No badge.');
      const template = sceneInstance(document, 'badge-solo');
      // depth − 1 definitions, each placing the next, the last placing the badge.
      const levels = Array.from({ length: depth - 1 }, (_, at) => ({
        ...leaf,
        id: `level-${String(at)}`,
        nodes: [
          {
            ...template,
            id: `level-${String(at)}-inner`,
            definitionId: at === depth - 2 ? 'badge' : `level-${String(at + 1)}`,
            width: 80,
            height: 80,
            effects: [],
          },
        ],
        clips: [],
        transitions: [],
      }));
      document.definitions.push(...levels);
      const solo = sceneInstance(document, 'badge-solo');
      solo['definitionId'] = depth > 1 ? 'level-0' : 'badge';
      solo['effects'] = [];
      return document;
    };
    expect(codes(chain(MAX_INSTANCE_DEPTH))).toEqual([]);
    expect(codes(chain(MAX_INSTANCE_DEPTH + 1))).toContain('definition-too-deep /definitions/2');
  });

  it('refuses video and Custom HTML inside a definition', () => {
    const document = draft();
    const card = document.definitions[0];
    if (card === undefined) throw new Error('No card.');
    card.nodes.push({ id: 'card-html', type: 'custom-html' });
    expect(codes(document)[0]).toMatch(/^invalid-value \/definitions\/0\/nodes\/6\/type$/);
  });
});

describe('the sounds of definitions in the audio plan (D76)', () => {
  it('places the clip of a definition once for each instance that shows it', () => {
    const entries = audioPlan(nested).entries;
    expect(entries.map(({ id, startUs, durationUs }) => [id, startUs, durationUs])).toEqual([
      ['card-left/card-sound', 0, 1_000_000],
      ['card-right/card-sound', 500_000, 1_000_000],
      ['card-small/card-sound', 300_000, 1_000_000],
    ]);
  });

  it('cuts a clip an instance starts inside: its source moves on and its fade-in is dropped', () => {
    const document = draft();
    const left = sceneInstance(document, 'card-left');
    left['sourceStartUs'] = 300_000;
    left['durationUs'] = 1_200_000;
    const [first] = audioPlan(validated(document)).entries;
    expect(first).toEqual({
      kind: 'clip',
      id: 'card-left/card-sound',
      assetId: 'asset-audio',
      startUs: 0,
      durationUs: 700_000,
      sourceStartUs: 300_000,
      volume: 0.5,
      lifetimeUs: 700_000,
      fadeInUs: 0,
      fadeOutUs: 100_000,
    });
  });

  it('cuts a clip at the end of the instance that shows it', () => {
    const document = draft();
    sceneInstance(document, 'card-left')['durationUs'] = 400_000;
    const [first] = audioPlan(validated(document)).entries;
    expect(first).toMatchObject({ id: 'card-left/card-sound', startUs: 0, durationUs: 400_000 });
  });
});
