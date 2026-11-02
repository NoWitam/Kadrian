/**
 * The forward step from schema 0.8 to 0.9 (D35.2, D49.7, D59): the template
 * section gets an empty list of conditions and an empty list of repeats, in
 * this order, after its bindings. A template without conditions and repeats
 * instantiates as it did, so no time value moves. `schemaVersion` becomes 0.9.
 * Nothing else changes: every other key and its place, every array and its
 * order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.8, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV08 } from '../v0-8/composition-schema.js';

export function step08To09(document: CompositionV08): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.9'];
      if (key === 'template') {
        return [key, { ...(detached(child) as object), conditions: [], repeats: [] }];
      }
      return [key, detached(child)];
    }),
  );
}
