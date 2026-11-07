/**
 * The forward step from schema 0.10 to 0.11 (D35.2, D49.7, D66): `schemaVersion`
 * becomes 0.11 and nothing else changes. Every effect of 0.10 is an effect of
 * 0.11 with the same meaning — a clip transition of 0.10 is a `crossfade`,
 * which 0.11 renders as 0.10 did — so every document renders as it did, and no
 * key, order, ID, or value moves, every time value included (D49.7).
 *
 * It is pure, total over valid documents of 0.10, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV010 } from '../v0-10/composition-schema.js';

export function step010To011(document: CompositionV010): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => [
      key,
      key === 'schemaVersion' ? '0.11' : detached(child),
    ]),
  );
}
