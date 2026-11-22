/**
 * The forward step from schema 0.27 to 0.28 (D35.2, D89.2): the composition
 * gets `clear: 'white'` directly after its `safeArea`, and `schemaVersion`
 * becomes 0.28. A white clear is the page's own white of D42.5, so every frame
 * stays what it was. A definition gets no clear. Nothing else changes: every
 * other key and its place, every array and its order, every ID, and every
 * value.
 *
 * It is pure, total over valid documents of 0.27, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV027 } from '../v0-27/composition-schema.js';

export function step027To028(document: CompositionV027): unknown {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): [string, unknown][] => {
      if (key === 'schemaVersion') return [[key, '0.28']];
      if (key === 'safeArea') {
        return [
          [key, detached(child)],
          ['clear', 'white'],
        ];
      }
      return [[key, detached(child)]];
    }),
  );
}
