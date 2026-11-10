/**
 * The forward step from schema 0.20 to 0.21 (D35.2, D49.7, D76): the document
 * gets `definitions: []` directly before its `template`, and `schemaVersion`
 * becomes 0.21. A document without definitions places no instance, so it
 * renders byte for byte as it did. Nothing else changes: every other key and
 * its place, every array and its order, every ID, and every value, every time
 * value included (D49.7).
 *
 * It is pure, total over valid documents of 0.20, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV020 } from '../v0-20/composition-schema.js';

export function step020To021(document: CompositionV020): unknown {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): [string, unknown][] => {
      if (key === 'schemaVersion') return [[key, '0.21']];
      if (key === 'template')
        return [
          ['definitions', []],
          [key, detached(child)],
        ];
      return [[key, detached(child)]];
    }),
  );
}
