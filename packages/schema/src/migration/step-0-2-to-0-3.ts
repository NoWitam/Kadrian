/**
 * The forward step from schema 0.2 to 0.3 (D35.2, D49.7, D50.7): every image
 * node, and every image child of a group, gets `fit: "fill"` as its last key —
 * the `object-fit: fill` it always had (D22) — and `schemaVersion` becomes 0.3.
 * Nothing else changes: every other key and its place, every array and its
 * order, every ID, and every value, every time value included (D49.7). A
 * document of 0.2 has no video, so the step adds none.
 *
 * It is pure, total over valid documents of 0.2, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV02 } from '../v0-2/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The node with its children carried through, and `fit` added at its end if it is an image. */
function node(source: Fields): Fields {
  const entries = Object.entries(source).map(([key, child]): [string, unknown] => [
    key,
    key === 'children' && Array.isArray(child)
      ? (child as readonly Fields[]).map(node)
      : detached(child),
  ]);
  return Object.fromEntries(source['type'] === 'image' ? [...entries, ['fit', 'fill']] : entries);
}

export function step02To03(document: CompositionV02): unknown {
  const scene = (source: Fields): Fields =>
    Object.fromEntries(
      Object.entries(source).map(([key, child]): [string, unknown] => [
        key,
        key === 'nodes' && Array.isArray(child)
          ? (child as readonly Fields[]).map(node)
          : detached(child),
      ]),
    );
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.3'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
