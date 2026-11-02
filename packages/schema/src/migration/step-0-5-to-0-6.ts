/**
 * The forward step from schema 0.5 to 0.6 (D35.2, D49.7, D56): every scene gets
 * an empty list `transitions` as its last key, and so does the composition.
 * Without a transition, scenes meet end to end as they did in 0.5 and every
 * clip is shown as it was, so no time value moves: every scene, node lifetime,
 * keyframe, source mapping, and clip stays where it was, and the composition's
 * `durationUs` is still the sum of its scenes'. `schemaVersion` becomes 0.6.
 * Nothing else changes: every other key and its place, every array and its
 * order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.5, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV05 } from '../v0-5/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

export function step05To06(document: CompositionV05): unknown {
  const scene = (source: Fields): Fields =>
    Object.fromEntries([
      ...Object.entries(source).map(([key, child]): [string, unknown] => [key, detached(child)]),
      ['transitions', []],
    ]);
  return Object.fromEntries([
    ...Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.6'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
    ['transitions', []],
  ]);
}
