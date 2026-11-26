/**
 * The forward step from schema 0.29 to 0.30 (D35.2, D91.1): every
 * transformable node — an image, a video, a text, a captions node, a shape, a
 * group, an instance, or a Custom HTML element — gets four zero corners,
 * `corners: { topLeft: { x: 0, y: 0 }, topRight: …, bottomRight: …,
 * bottomLeft: … }`, directly after its `flip`, in every scene and every
 * definition, and in the children of a group at any depth; `schemaVersion`
 * becomes 0.30. Four zero corners are no quadrilateral, and the renderer
 * writes the transform it wrote before, so every frame stays what it was. A
 * background has no transform and is left as it is. Nothing else changes:
 * every other key and its place, every array and its order, every ID, and
 * every value.
 *
 * It is pure, total over valid documents of 0.29, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV029 } from '../v0-29/composition-schema.js';

type Entries = [string, unknown][];

/** Four zero corners, a new object at every call: no quadrilateral (D91.1). */
function zeroCorners(): unknown {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
    bottomLeft: { x: 0, y: 0 },
  };
}

/**
 * A node of 0.29: one with a `flip` gets zero corners directly after it, and
 * the children of a group are nodes in turn; a background has no `flip`.
 */
function node(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, child]): Entries => {
      if (key === 'flip') {
        return [
          [key, detached(child)],
          ['corners', zeroCorners()],
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

export function step029To030(document: CompositionV029): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.30'];
      if (key === 'scenes' || key === 'definitions') {
        return [key, (child as readonly unknown[]).map(holder)];
      }
      return [key, detached(child)];
    }),
  );
}
