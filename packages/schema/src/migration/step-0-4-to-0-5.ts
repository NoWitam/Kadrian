/**
 * The forward step from schema 0.4 to 0.5 (D35.2, D49.7, D54.4): the one scene
 * gets `durationUs`, the composition's own `durationUs`, directly after its
 * `id`, and an empty list `clips` as its last key, so it spans the whole
 * composition as it did in 0.4 (D16.2). With one scene starting at 0, scene time
 * is composition time, so no time value moves: every node lifetime, keyframe,
 * and source mapping stays where it was, and the composition's clips stay in
 * composition time (D49.7). `schemaVersion` becomes 0.5. Nothing else changes:
 * every other key and its place, every array and its order, every ID, and every
 * value.
 *
 * It is pure, total over valid documents of 0.4, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV04 } from '../v0-4/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

export function step04To05(document: CompositionV04): unknown {
  const scene = (source: Fields): Fields =>
    Object.fromEntries([
      ...Object.entries(source).flatMap(([key, child]): [string, unknown][] =>
        key === 'id'
          ? [
              [key, detached(child)],
              ['durationUs', document.durationUs],
            ]
          : [[key, detached(child)]],
      ),
      ['clips', []],
    ]);
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.5'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
