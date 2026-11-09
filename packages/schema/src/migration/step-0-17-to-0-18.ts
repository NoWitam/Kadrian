/**
 * The forward step from schema 0.17 to 0.18 (D35.2, D49.7, D73): schema 0.18
 * only adds the node type `shape`, so `schemaVersion` becomes 0.18 and nothing else
 * changes: every key and its place, every array and its order, every ID, and
 * every value, every time value included (D49.7). Every document of 0.17
 * renders byte for byte as it did.
 *
 * It is pure, total over valid documents of 0.17, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV017 } from '../v0-17/composition-schema.js';

export function step017To018(document: CompositionV017): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] =>
      key === 'schemaVersion' ? [key, '0.18'] : [key, detached(child)],
    ),
  );
}
