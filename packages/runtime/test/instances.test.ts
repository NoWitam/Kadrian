/**
 * Nested compositions at one instant (D65.4, D76): an instance node carries
 * its definition evaluated at `sourceStartUs + (t − startUs)`, held to the
 * nearest instant of its lifetime outside it, with every ID inside addressed
 * by the path of instance IDs to it. The expected values are derived by hand
 * from the nested fixture.
 */
import { definitionTimeUs } from '@kadrion/schema';
import { nestedComposition, nestedGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition, type InstanceNodeState, type NodeState } from '../src/index.js';
import { validated } from './support.js';

const composition = validated(nestedComposition);

function instance(nodes: readonly NodeState[], id: string): InstanceNodeState {
  const found = nodes.find((node) => node.id === id);
  if (found?.type !== 'instance') throw new Error(`No instance ${id}.`);
  return found;
}

function sceneNodes(timeUs: number): readonly NodeState[] {
  return evaluateComposition(composition, timeUs).scenes[0]?.nodes ?? [];
}

describe('the definition time of an instance (D65.4, D76)', () => {
  it('is sourceStartUs + (t − startUs) in the lifetime, the nearest instant of it outside', () => {
    const node = { startUs: 500_000, durationUs: 1_000_000, sourceStartUs: 200_000 };
    expect(definitionTimeUs(node, 500_000)).toBe(200_000);
    expect(definitionTimeUs(node, 800_000)).toBe(500_000);
    expect(definitionTimeUs(node, 1_499_999)).toBe(1_199_999);
    expect(definitionTimeUs(node, 0)).toBe(200_000);
    expect(definitionTimeUs(node, 1_500_000)).toBe(1_199_999);
    expect(definitionTimeUs(node, 9_000_000)).toBe(1_199_999);
  });
});

describe('an instance in the state (D76)', () => {
  it('evaluates its definition at its own time, once per instance', () => {
    const nodes = sceneNodes(800_000);
    expect(instance(nodes, 'card-left')).toMatchObject({
      active: true,
      definitionId: 'card',
      definitionTimeUs: 800_000,
    });
    expect(instance(nodes, 'card-right')).toMatchObject({
      active: true,
      definitionTimeUs: 300_000,
    });
    expect(instance(nodes, 'card-small')).toMatchObject({
      active: true,
      definitionTimeUs: 500_000,
    });
    expect(instance(nodes, 'badge-solo')).toMatchObject({
      active: true,
      definitionTimeUs: 800_000,
    });
  });

  it('addresses every node inside by the path of instance IDs to it', () => {
    const left = instance(sceneNodes(800_000), 'card-left');
    expect(left.nodes.map(({ id }) => id)).toEqual([
      'card-left/card-background',
      'card-left/card-photo',
      'card-left/card-title',
      'card-left/card-bar-a',
      'card-left/card-bar-b',
      'card-left/card-badge',
    ]);
    const badge = instance(left.nodes, 'card-left/card-badge');
    // The badge of the card starts 0.2 s into the card.
    expect(badge).toMatchObject({ definitionId: 'badge', definitionTimeUs: 600_000 });
    expect(badge.nodes.map(({ id }) => id)).toEqual([
      'card-left/card-badge/badge-disc',
      'card-left/card-badge/badge-square',
    ]);
  });

  it('gives the nodes inside the lifetimes of the definition time', () => {
    const right = instance(sceneNodes(800_000), 'card-right');
    const active = (id: string): boolean | undefined =>
      right.nodes.find((node) => node.id === id)?.active;
    // At definition time 0.3 s the first bar is on, the second not yet.
    expect(active('card-right/card-bar-a')).toBe(true);
    expect(active('card-right/card-bar-b')).toBe(false);
  });

  it('is inactive outside its lifetime and holds the nearest instant of it', () => {
    const before = instance(sceneNodes(0), 'card-right');
    expect(before).toMatchObject({ active: false, definitionTimeUs: 0 });
    const after = instance(sceneNodes(1_600_000), 'badge-solo');
    expect(after).toMatchObject({ active: false, definitionTimeUs: 999_999 });
  });

  it('is the same state for the same time, whatever was evaluated before', () => {
    for (const { timeUs } of nestedGoldenTimestamps) {
      const first = JSON.stringify(evaluateComposition(composition, timeUs));
      evaluateComposition(composition, 1_999_999);
      expect(JSON.stringify(evaluateComposition(composition, timeUs))).toBe(first);
    }
  });
});
