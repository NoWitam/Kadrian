/**
 * The forward step from schema 0.19 to 0.20 (D35.2, D49.7, D75): every image,
 * video, text, captions node, shape, and group, at any depth, gets
 * `mask: { kind: 'none' }`, `matte: { kind: 'none' }`, and `blendMode: 'normal'`
 * as its last keys, and `schemaVersion` becomes 0.20. No mask, no matte, and
 * the normal blend mode write nothing, so every document renders byte for byte
 * as it did. Nothing else changes: every other key and its place, every array
 * and its order, every ID, and every value, every time value included (D49.7).
 *
 * It is pure, total over valid documents of 0.19, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV019 } from '../v0-19/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The node types that take a mask, a matte, and a blend mode (D75). */
const COMPOSITED: readonly unknown[] = ['image', 'video', 'text', 'captions', 'shape', 'group'];

/** A node with its children carried through, and the keys of D75 where its type takes them. */
function node(source: Fields): Fields {
  const copy: [string, unknown][] = Object.entries(source).map(([key, child]) =>
    key === 'children' && Array.isArray(child)
      ? [key, (child as readonly Fields[]).map(node)]
      : [key, detached(child)],
  );
  if (COMPOSITED.includes(source.type)) {
    copy.push(['mask', { kind: 'none' }], ['matte', { kind: 'none' }], ['blendMode', 'normal']);
  }
  return Object.fromEntries(copy);
}

/** A scene with its nodes carried through. */
function scene(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).map(([key, child]): [string, unknown] =>
      key === 'nodes' && Array.isArray(child)
        ? [key, (child as readonly Fields[]).map(node)]
        : [key, detached(child)],
    ),
  );
}

export function step019To020(document: CompositionV019): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.20'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
