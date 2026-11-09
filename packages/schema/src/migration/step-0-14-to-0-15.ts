/**
 * The forward step from schema 0.14 to 0.15 (D35.2, D49.7, D70): the
 * `highlightColor` of every captions style becomes, in its place, a
 * `highlight` of that colour with no scale, no tracks, no underline, and no
 * box; every captions style gets no outline, no shadow, no box, and no page
 * animations after its `maxLines`; the composition gets a safe area of the
 * whole canvas after its `height`; and `schemaVersion` becomes 0.15. Every
 * document therefore renders byte for byte as it did. Nothing else changes:
 * every other key and its place, every array and its order, every ID, and
 * every value, every time value included (D49.7).
 *
 * It is pure, total over valid documents of 0.14, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV014 } from '../v0-14/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The style of a captions node of 0.14 as a style of 0.15. */
function captionStyle(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, value]): [string, unknown][] => {
      if (key === 'highlightColor') {
        return [
          [
            'highlight',
            {
              color: value,
              scale: 1,
              tracks: [],
              underline: { kind: 'none' },
              box: { kind: 'none' },
            },
          ],
        ];
      }
      if (key === 'maxLines') {
        return [
          [key, value],
          ['stroke', { kind: 'none' }],
          ['shadow', { kind: 'none' }],
          ['box', { kind: 'none' }],
          ['pageIn', { kind: 'none' }],
          ['pageOut', { kind: 'none' }],
        ];
      }
      return [[key, detached(value)]];
    }),
  );
}

/** A node with its captions style carried over, and its children carried through. */
function node(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).map(([key, child]): [string, unknown] => {
      if (key === 'children' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(node)];
      }
      if (key === 'style' && source.type === 'captions')
        return [key, captionStyle(child as Fields)];
      return [key, detached(child)];
    }),
  );
}

export function step014To015(document: CompositionV014): unknown {
  const scene = (source: Fields): Fields =>
    Object.fromEntries(
      Object.entries(source).map(([key, child]): [string, unknown] =>
        key === 'nodes' && Array.isArray(child)
          ? [key, (child as readonly Fields[]).map(node)]
          : [key, detached(child)],
      ),
    );
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): [string, unknown][] => {
      if (key === 'schemaVersion') return [[key, '0.15']];
      if (key === 'height') {
        return [
          [key, child],
          ['safeArea', { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 }],
        ];
      }
      if (key === 'scenes' && Array.isArray(child)) {
        return [[key, (child as readonly Fields[]).map(scene)]];
      }
      return [[key, detached(child)]];
    }),
  );
}
