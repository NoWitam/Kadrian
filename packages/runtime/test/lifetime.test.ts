/**
 * The lifetime of a node in the evaluated state (D42.2, D42.3): `active` says
 * whether the node's own half-open interval contains the time. The expectations
 * of the lifetime fixture are hand-derived; the cases near 2^53 − 1 are written
 * out here, with the arithmetic that decides each of them.
 *
 * These tests fix what is observable: which times are active. They cannot tell
 * the subtraction the implementation is required to use (D42.2) from a sum of
 * start and duration, because on every valid input both give the same verdict;
 * that the code subtracts is a rule of the implementation, kept by review.
 */
import { migrateComposition } from '@kadrion/schema/migrate';
import {
  goldenTimestamps,
  lifetimeComposition,
  lifetimeExpected,
  referenceCompositionV01,
  referenceExpectedStates,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition, type CompositionState, type NodeState } from '../src/index.js';
import { derived, validated } from './support.js';

const MAX = Number.MAX_SAFE_INTEGER;
const lifetimes = validated(lifetimeComposition);

/** Every node state of a composition state in document order, children after their group. */
function nodeStates(state: CompositionState): NodeState[] {
  return state.scenes.flatMap((scene) =>
    scene.nodes.flatMap((node) => [node, ...(node.type === 'group' ? node.children : [])]),
  );
}

function activeIds(state: CompositionState): string[] {
  return nodeStates(state)
    .filter(({ active }) => active)
    .map(({ id }) => id);
}

/** The reference composition with the lifetime of its title replaced, and its duration. */
function titleLiving(startUs: number, durationUs: number, compositionUs = 10_000_000) {
  return derived((draft) => {
    draft.durationUs = compositionUs;
    const title = draft.scenes[0]?.nodes.find(({ id }) => id === 'node-title');
    if (title === undefined) throw new Error('No title.');
    title.startUs = startUs;
    title.durationUs = durationUs;
  });
}

function titleActive(document: ReturnType<typeof titleLiving>, timeUs: number): boolean {
  const title = nodeStates(evaluateComposition(document, timeUs)).find(
    ({ id }) => id === 'node-title',
  );
  if (title === undefined) throw new Error('No title state.');
  return title.active;
}

describe('the lifetime fixture at its boundaries (D42.2)', () => {
  it('has an expectation on both sides of every boundary', () => {
    expect(lifetimeExpected.times.map(({ timeUs }) => timeUs)).toEqual([
      0, 1, 999_999, 1_000_000, 1_999_999, 2_000_000, 3_999_999, 4_000_000, 4_999_999, 5_000_000,
      5_999_999, 6_000_000, 7_999_999, 8_000_000, 8_999_999, 9_000_000, 9_999_999,
    ]);
  });

  it.each(lifetimeExpected.times)('marks exactly the active nodes at $timeUs', (expected) => {
    const state = evaluateComposition(lifetimes, expected.timeUs);
    expect(activeIds(state)).toEqual(expected.active);
    // Every node is in the state, active or not: the state mirrors the document.
    expect(nodeStates(state).map(({ id }) => id)).toEqual([
      'life-background',
      'life-group',
      'life-child-always',
      'life-child-late',
      'life-text',
      'life-never',
      'life-html',
    ]);
  });

  it.each(lifetimeExpected.times)(
    'evaluates an inactive node like an active one, on composition time, at $timeUs',
    ({ timeUs, positionX }) => {
      const text = nodeStates(evaluateComposition(lifetimes, timeUs)).find(
        ({ id }) => id === 'life-text',
      );
      if (text === undefined || text.type === 'background') throw new Error('No text state.');
      expect(text.position.x).toBeCloseTo(positionX, 9);
      expect(text.position.y).toBe(120);
    },
  );

  it('keeps active local: a child is active while its group is not', () => {
    const state = evaluateComposition(lifetimes, 5_000_000);
    const group = state.scenes[0]?.nodes.find(({ id }) => id === 'life-group');
    if (group?.type !== 'group') throw new Error('No group state.');
    expect(group.active).toBe(false);
    expect(group.children.map(({ id, active }) => [id, active])).toEqual([
      ['life-child-always', true],
      ['life-child-late', true],
    ]);
  });

  it('gives the background a lifetime like any node', () => {
    const background = (timeUs: number): NodeState | undefined =>
      evaluateComposition(lifetimes, timeUs).scenes[0]?.nodes[0];
    expect(background(999_999)).toStrictEqual({
      id: 'life-background',
      type: 'background',
      active: false,
    });
    expect(background(1_000_000)).toStrictEqual({
      id: 'life-background',
      type: 'background',
      active: true,
    });
  });
});

describe('the half-open interval (D42.2)', () => {
  it.each([
    ['one before the start', 1_999_999, false],
    ['the start', 2_000_000, true],
    ['the last microsecond', 4_999_999, true],
    ['the end', 5_000_000, false],
  ])('is %s', (_, timeUs, active) => {
    expect(titleActive(titleLiving(2_000_000, 3_000_000), timeUs)).toBe(active);
  });

  it('lasts one microsecond at the least', () => {
    const document = titleLiving(7, 1);
    expect([6, 7, 8].map((timeUs) => titleActive(document, timeUs))).toEqual([false, true, false]);
  });

  it('is cut by the end of the composition, and may begin at or after it', () => {
    const cut = titleLiving(8_000_000, 5_000_000);
    expect(titleActive(cut, 9_999_999)).toBe(true);
    const never = titleLiving(10_000_000, 1);
    expect([0, 5_000_000, 9_999_999].map((timeUs) => titleActive(never, timeUs))).toEqual([
      false,
      false,
      false,
    ]);
    const later = titleLiving(20_000_000, 5);
    expect(titleActive(later, 9_999_999)).toBe(false);
  });
});

describe('lifetimes near 2^53 − 1 are valid and behave as the interval says (D42.2)', () => {
  it('holds valid documents whose start and duration have no safe-integer sum', () => {
    expect(Number.isSafeInteger(MAX + MAX)).toBe(false);
    expect(Number.isSafeInteger(MAX - 1 + 1)).toBe(true);
    expect(() => titleLiving(MAX, MAX, MAX)).not.toThrow();
  });

  it.each([
    // t - 0 < MAX for every t below the composition's end.
    ['start 0, duration MAX', 0, MAX, [0, 1, MAX - 2, MAX - 1], [true, true, true, true]],
    // t >= MAX never holds for t < MAX.
    ['start MAX, duration MAX', MAX, MAX, [0, MAX - 1], [false, false]],
    // (MAX-1) - (MAX-1) = 0 < 1; (MAX-2) < MAX-1.
    ['start MAX − 1, duration 1', MAX - 1, 1, [MAX - 2, MAX - 1], [false, true]],
    // (MAX-1) - (MAX-2) = 1, not < 1.
    ['start MAX − 2, duration 1', MAX - 2, 1, [MAX - 3, MAX - 2, MAX - 1], [false, true, false]],
    // (MAX-1) - 1 = MAX-2 < MAX-1; the sum 1 + (MAX-1) is MAX, still exact.
    ['start 1, duration MAX − 1', 1, MAX - 1, [0, 1, MAX - 1], [false, true, true]],
    // 2 + MAX is not safe; (MAX-1) - 2 = MAX-3 < MAX.
    ['start 2, duration MAX', 2, MAX, [1, 2, MAX - 1], [false, true, true]],
  ])('%s', (_, startUs, durationUs, times, expected) => {
    const document = titleLiving(startUs, durationUs, MAX);
    expect(times.map((timeUs) => titleActive(document, timeUs))).toEqual(expected);
  });
});

// This is the one place where the migration entry and the runtime meet in a host
// test: the runtime package is the lowest one that depends on both. Tests are
// not package source, which is what the "who migrates" guard is about (D42.9).
describe('a migrated document (D42.7)', () => {
  it('evaluates to the state of the reference composition, every node active', () => {
    const migrated = migrateComposition(referenceCompositionV01);
    if (!migrated.ok) throw new Error('The reference of 0.1 did not migrate.');
    for (const [index, { timeUs }] of goldenTimestamps.entries()) {
      const state = evaluateComposition(migrated.composition, timeUs);
      expect(state).toStrictEqual(referenceExpectedStates.golden[index]?.state);
      expect(nodeStates(state).map(({ active }) => active)).toEqual(
        Array.from({ length: 6 }, () => true),
      );
    }
  });

  it('is active at the first and the last valid time of the composition', () => {
    const migrated = migrateComposition(referenceCompositionV01);
    if (!migrated.ok) throw new Error('The reference of 0.1 did not migrate.');
    for (const timeUs of [0, 9_999_999]) {
      expect(activeIds(evaluateComposition(migrated.composition, timeUs))).toHaveLength(6);
    }
  });
});
