/**
 * The forward step from schema 0.24 to 0.25 (D35.2, D49.7, D83.9): every text
 * node, in a scene, in a group, or in a definition, gets `frame: { kind:
 * 'none' }` directly after its `fontSize`, and its style gets `align: 'left'`
 * and `verticalAlign: 'top'` directly after its `box`; every captions node's
 * style gets `lineBreak: 'characters'` directly after its `maxLines`, and its
 * highlight `stroke: { kind: 'none' }` and `shadow: { kind: 'none' }` directly
 * after its `box`; `schemaVersion` becomes 0.25. These are the looks of 0.24:
 * a text without a frame is the box of its lines, left-aligned as CSS aligns
 * it, captions break by characters as D57.3 does, and the spoken word keeps
 * the outline and the shadow of the style. Nothing else changes: every other
 * key and its place, every array and its order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.24, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV024 } from '../v0-24/composition-schema.js';

type Entries = [string, unknown][];

/** A record with `added` after the key `after`, every other entry detached. */
function after(value: unknown, key: string, added: Entries): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([name, child]): Entries =>
      name === key ? [[name, detached(child)], ...added] : [[name, detached(child)]],
    ),
  );
}

/** A text node of 0.24 with no frame and its lines aligned left and top (D83.9). */
function text(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, child]): Entries => {
      if (key === 'fontSize')
        return [
          [key, child],
          ['frame', { kind: 'none' }],
        ];
      if (key === 'style')
        return [
          [
            key,
            after(child, 'box', [
              ['align', 'left'],
              ['verticalAlign', 'top'],
            ]),
          ],
        ];
      return [[key, detached(child)]];
    }),
  );
}

/** A captions node of 0.24 broken by characters, its spoken word with no outline or shadow of its own (D83.9). */
function captions(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).map(([key, child]) => {
      if (key !== 'style') return [key, detached(child)];
      const style = Object.fromEntries(
        Object.entries(child as Readonly<Record<string, unknown>>).flatMap(
          ([name, part]): Entries => {
            if (name === 'maxLines')
              return [
                [name, part],
                ['lineBreak', 'characters'],
              ];
            if (name === 'highlight')
              return [
                [
                  name,
                  after(part, 'box', [
                    ['stroke', { kind: 'none' }],
                    ['shadow', { kind: 'none' }],
                  ]),
                ],
              ];
            return [[name, detached(part)]];
          },
        ),
      );
      return [key, style];
    }),
  );
}

/** A node of a scene or a definition: a text, captions, or a group whose children may be texts. */
function node(value: unknown): unknown {
  const record = value as Readonly<Record<string, unknown>>;
  if (record['type'] === 'text') return text(value);
  if (record['type'] === 'captions') return captions(value);
  if (record['type'] !== 'group') return detached(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      key === 'children' ? (child as readonly unknown[]).map(node) : detached(child),
    ]),
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

export function step024To025(document: CompositionV024): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]) => {
      if (key === 'schemaVersion') return [key, '0.25'];
      if (key === 'scenes' || key === 'definitions')
        return [key, (child as readonly unknown[]).map(holder)];
      return [key, detached(child)];
    }),
  );
}
