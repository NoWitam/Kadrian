/**
 * The forward step from schema 0.6 to 0.7 (D35.2, D49.7, D57): 0.7 adds the
 * node `captions`, which no document of 0.6 has, so the step only sets
 * `schemaVersion` to 0.7. Nothing else changes: every other key and its place,
 * every array and its order, every ID, and every value; no time value moves.
 *
 * It is pure, total over valid documents of 0.6, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV06 } from '../v0-6/composition-schema.js';

export function step06To07(document: CompositionV06): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] =>
      key === 'schemaVersion' ? [key, '0.7'] : [key, detached(child)],
    ),
  );
}
