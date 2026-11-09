/**
 * The forward step from schema 0.16 to 0.17 (D35.2, D49.7, D72): schema 0.17
 * only adds kinds of effects, so `schemaVersion` becomes 0.17 and nothing else
 * changes: every key and its place, every array and its order, every ID, and
 * every value, every time value included (D49.7). Every document of 0.16
 * renders byte for byte as it did.
 *
 * It is pure, total over valid documents of 0.16, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV016 } from '../v0-16/composition-schema.js';

export function step016To017(document: CompositionV016): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] =>
      key === 'schemaVersion' ? [key, '0.17'] : [key, detached(child)],
    ),
  );
}
