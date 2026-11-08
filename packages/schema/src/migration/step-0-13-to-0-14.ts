/**
 * The forward step from schema 0.13 to 0.14 (D35.2, D49.7, D69): every text
 * node gets `style` with no stroke, no shadow, and no box, and an empty
 * `textAnimations` list, right after its `color`, so that it is drawn in one
 * piece as before; and `schemaVersion` becomes 0.14. Every document therefore
 * renders byte for byte as it did. Nothing else changes: every other key and
 * its place, every array and its order, every ID, and every value, every time
 * value included (D49.7).
 *
 * It is pure, total over valid documents of 0.13, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV013 } from '../v0-13/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The fields each key of a node of 0.13 is followed by in 0.14. */
function added(type: unknown, key: string): [string, unknown][] {
  if (key === 'color' && type === 'text') {
    return [
      ['style', { stroke: { kind: 'none' }, shadow: { kind: 'none' }, box: { kind: 'none' } }],
      ['textAnimations', []],
    ];
  }
  return [];
}

/** The node with its new fields, and its children carried through. */
function node(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]): [string, unknown][] => [
      [
        key,
        key === 'children' && Array.isArray(child)
          ? (child as readonly Fields[]).map(node)
          : detached(child),
      ],
      ...added(source.type, key),
    ]),
  );
}

export function step013To014(document: CompositionV013): unknown {
  const scene = (source: Fields): Fields =>
    Object.fromEntries(
      Object.entries(source).map(([key, child]): [string, unknown] =>
        key === 'nodes' && Array.isArray(child)
          ? [key, (child as readonly Fields[]).map(node)]
          : [key, detached(child)],
      ),
    );
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.14'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
