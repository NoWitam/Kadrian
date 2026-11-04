/**
 * The forward step from schema 0.9 to 0.10 (D35.2, D49.7, D63): every image
 * and video node, in a scene or a child of a group, gets `focus: { x: 500,
 * y: 500 }` right after its `fit` — the centre, the `object-position` it always
 * had, so every document renders byte for byte as it did — and `schemaVersion`
 * becomes 0.10. Nothing else changes: every other key and its place, every
 * array and its order, every ID, and every value, every time value included
 * (D49.7).
 *
 * It is pure, total over valid documents of 0.9, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV09 } from '../v0-9/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** Whether a node of this type has a picture that its fit places (D50, D63). */
function hasFit(source: Fields): boolean {
  return source['type'] === 'image' || source['type'] === 'video';
}

/** The node with its children carried through, and `focus` added after `fit` if it has one. */
function node(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]): [string, unknown][] => {
      if (key === 'children' && Array.isArray(child)) {
        return [[key, (child as readonly Fields[]).map(node)]];
      }
      if (key === 'fit' && hasFit(source)) {
        return [
          [key, detached(child)],
          ['focus', { x: 500, y: 500 }],
        ];
      }
      return [[key, detached(child)]];
    }),
  );
}

export function step09To10(document: CompositionV09): unknown {
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
      if (key === 'schemaVersion') return [key, '0.10'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
