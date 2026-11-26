/**
 * The forward step from schema 0.30 to 0.31 (D35.2, D91.2): every text node
 * gets `number: { kind: 'none' }`, no number, directly after its `text`, in
 * every scene and every definition, and among the children of a group;
 * `schemaVersion` becomes 0.31. A text without a number shows its text as it
 * did, so every frame stays what it was. Captions are no text node and keep
 * their words. Nothing else changes: every other key and its place, every
 * array and its order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.30, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV030 } from '../v0-30/composition-schema.js';

type Entries = [string, unknown][];

/**
 * A node of 0.30: a text gets no number directly after its `text`, and the
 * children of a group are nodes in turn; no other node has a `text`.
 */
function node(value: unknown): unknown {
  const record = value as Readonly<Record<string, unknown>>;
  const isText = record['type'] === 'text';
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, child]): Entries => {
      if (isText && key === 'text') {
        return [
          [key, detached(child)],
          ['number', { kind: 'none' }],
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

export function step030To031(document: CompositionV030): unknown {
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.31'];
      if (key === 'scenes' || key === 'definitions') {
        return [key, (child as readonly unknown[]).map(holder)];
      }
      return [key, detached(child)];
    }),
  );
}
