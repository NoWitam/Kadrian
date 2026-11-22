/**
 * The forward step from schema 0.26 to 0.27 (D35.2, D89.3): every
 * transformable node — an image, a video, a text, a captions node, a shape, a
 * group, an instance, or a Custom HTML element — gets `flip: { x: false, y:
 * false }` directly after its `origin`, in every scene and every definition,
 * and in the children of a group at any depth; `schemaVersion` becomes 0.27.
 * No flip is today's drawing, and the renderer writes nothing for it, so every
 * frame stays what it was. A background has no transform and is left as it
 * is. Nothing else changes: every other key and its place, every array and its
 * order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.26, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV026 } from '../v0-26/composition-schema.js';

type Entries = [string, unknown][];

/**
 * A node of 0.26: one with an `origin` gets no flip directly after it, and the
 * children of a group are nodes in turn; a background has no `origin`.
 */
function node(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, child]): Entries => {
      if (key === 'origin') {
        return [
          [key, detached(child)],
          ['flip', { x: false, y: false }],
        ];
      }
      if (key === 'children') return [[key, (child as readonly unknown[]).map(node)]];
      return [[key, detached(child)]];
    }),
  );
}

/** A scene or a definition: its nodes. */
function holder(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).map(([key, child]) => [
      key,
      key === 'nodes' ? (child as readonly unknown[]).map(node) : detached(child),
    ]),
  );
}

export function step026To027(document: CompositionV026): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.27'];
      if (key === 'scenes' || key === 'definitions') {
        return [key, (child as readonly unknown[]).map(holder)];
      }
      return [key, detached(child)];
    }),
  );
}
