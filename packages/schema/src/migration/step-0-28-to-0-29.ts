/**
 * The forward step from schema 0.28 to 0.29 (D35.2, D89.1): `schemaVersion`
 * becomes 0.29 and nothing else changes. 0.29 only widens the bound of a side
 * of the canvas and of a safe inset, for the composition and its definitions,
 * so every document of 0.28 is a document of 0.29 with the same frames: every
 * other key and its place, every array and its order, every ID, and every
 * value stay as they are.
 *
 * It is pure, total over valid documents of 0.28, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV028 } from '../v0-28/composition-schema.js';

export function step028To029(document: CompositionV028): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] =>
      key === 'schemaVersion' ? [key, '0.29'] : [key, detached(child)],
    ),
  );
}
