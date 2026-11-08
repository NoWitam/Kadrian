/**
 * The forward step from schema 0.12 to 0.13 (D35.2, D49.7, D68): every
 * transformable node gets `rotation: 0` and `origin: { x: 0, y: 0 }` right
 * after its `scale`, the top-left corner of D15, so nothing turns and nothing
 * moves; every image and video gets `crop` with four insets of 0 and
 * `cornerRadius: 0` right after its `focus`, so its whole picture is shown with
 * square corners; every background gets an empty `animations` list right after
 * its `color`; and `schemaVersion` becomes 0.13. Every document therefore
 * renders byte for byte as it did. Nothing else changes: every other key and
 * its place, every array and its order, every ID, and every value, every time
 * value included (D49.7).
 *
 * It is pure, total over valid documents of 0.12, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV012 } from '../v0-12/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The fields each key of a node of 0.12 is followed by in 0.13. */
function added(type: unknown, key: string): [string, unknown][] {
  if (key === 'scale') {
    return [
      ['rotation', 0],
      ['origin', { x: 0, y: 0 }],
    ];
  }
  if (key === 'focus' && (type === 'image' || type === 'video')) {
    return [
      ['crop', { top: 0, right: 0, bottom: 0, left: 0 }],
      ['cornerRadius', 0],
    ];
  }
  if (key === 'color' && type === 'background') return [['animations', []]];
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

export function step012To013(document: CompositionV012): unknown {
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
      if (key === 'schemaVersion') return [key, '0.13'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
