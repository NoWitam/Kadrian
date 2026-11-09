/**
 * The forward step from schema 0.15 to 0.16 (D35.2, D49.7, D71): every image,
 * video, text, captions node, and group, at any depth, and every scene gets
 * an empty list of `effects` as its last key, and `schemaVersion` becomes
 * 0.16. An empty list writes no filter, so every document renders byte for
 * byte as it did (D65.5). Nothing else changes: every other key and its place,
 * every array and its order, every ID, and every value, every time value
 * included (D49.7).
 *
 * It is pure, total over valid documents of 0.15, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV015 } from '../v0-15/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The node types that take effects (D71). */
const WITH_EFFECTS: readonly unknown[] = ['image', 'video', 'text', 'captions', 'group'];

/** A node with its children carried through, and an empty list of effects where its type takes one. */
function node(source: Fields): Fields {
  const copy: [string, unknown][] = Object.entries(source).map(([key, child]) =>
    key === 'children' && Array.isArray(child)
      ? [key, (child as readonly Fields[]).map(node)]
      : [key, detached(child)],
  );
  if (WITH_EFFECTS.includes(source.type)) copy.push(['effects', []]);
  return Object.fromEntries(copy);
}

/** A scene with its nodes carried through and an empty list of effects as its last key. */
function scene(source: Fields): Fields {
  return Object.fromEntries([
    ...Object.entries(source).map(([key, child]): [string, unknown] =>
      key === 'nodes' && Array.isArray(child)
        ? [key, (child as readonly Fields[]).map(node)]
        : [key, detached(child)],
    ),
    ['effects', []],
  ]);
}

export function step015To016(document: CompositionV015): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.16'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      return [key, detached(child)];
    }),
  );
}
