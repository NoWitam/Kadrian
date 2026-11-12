/**
 * The forward step from schema 0.23 to 0.24 (D35.2, D49.7, D82.8): every video
 * node, in a scene or in a group, and every audio clip, of the composition, of
 * a scene, or of a definition, gets `sourceStartRemainder: 0`,
 * `speed: { num: 1, den: 1 }`, and `reverse: false` directly after its
 * `sourceStartUs`, and `schemaVersion` becomes 0.24. The map of speed 1,
 * remainder 0, forwards is the source time of D49.5 exactly, so every frame
 * shown and every sample heard stays what it was. Nothing else changes: every
 * other key and its place, every array and its order, every ID, and every
 * value, every time value included (D49.7). A definition holds no video node
 * (D76.1), and an instance keeps its own `sourceStartUs`, which has no speed
 * (D82.7).
 *
 * It is pure, total over valid documents of 0.23, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV023 } from '../v0-23/composition-schema.js';

type Entries = [string, unknown][];

/** A video node or an audio clip of 0.23 with the time map of speed 1 after its source start (D82.8). */
function mapped(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, child]): Entries => {
      if (key === 'sourceStartUs')
        return [
          [key, child],
          ['sourceStartRemainder', 0],
          ['speed', { num: 1, den: 1 }],
          ['reverse', false],
        ];
      return [[key, detached(child)]];
    }),
  );
}

/** A node of a scene: a video node, or a group whose children may be video nodes. */
function node(value: unknown): unknown {
  const record = value as Readonly<Record<string, unknown>>;
  if (record['type'] === 'video') return mapped(value);
  if (record['type'] !== 'group') return detached(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      key === 'children' ? (child as readonly unknown[]).map(node) : detached(child),
    ]),
  );
}

/** A scene or a definition: its nodes and its clips. */
function holder(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).map(([key, child]) => {
      if (key === 'nodes') return [key, (child as readonly unknown[]).map(node)];
      if (key === 'clips') return [key, (child as readonly unknown[]).map(mapped)];
      return [key, detached(child)];
    }),
  );
}

export function step023To024(document: CompositionV023): unknown {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): Entries => {
      if (key === 'schemaVersion') return [[key, '0.24']];
      if (key === 'scenes' || key === 'definitions')
        return [[key, (child as readonly unknown[]).map(holder)]];
      if (key === 'clips') return [[key, (child as readonly unknown[]).map(mapped)]];
      return [[key, detached(child)]];
    }),
  );
}
