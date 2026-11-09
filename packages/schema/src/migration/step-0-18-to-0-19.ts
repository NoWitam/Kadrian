/**
 * The forward step from schema 0.18 to 0.19 (D35.2, D49.7, D74): schema 0.19
 * only adds the asset type `svg`, which an image node may show, so
 * `schemaVersion` becomes 0.19 and nothing else changes: every key and its
 * place, every array and its order, every ID, and every value, every time value
 * included (D49.7). Every document of 0.18 renders byte for byte as it did.
 *
 * It is pure, total over valid documents of 0.18, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV018 } from '../v0-18/composition-schema.js';

export function step018To019(document: CompositionV018): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] =>
      key === 'schemaVersion' ? [key, '0.19'] : [key, detached(child)],
    ),
  );
}
