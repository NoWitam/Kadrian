/**
 * The forward step from schema 0.25 to 0.26 (D35.2, D85.7): every video node,
 * in a scene or in a group, gets `fadeInUs: 0` and `fadeOutUs: 0` directly
 * after its `volume`, every audio clip, of the composition, of a scene, or of
 * a definition, gets `animations: []` directly after its `fadeOutUs`, and
 * `schemaVersion` becomes 0.26. No fade and no curve are today's sounds, and
 * neither touches a picture, so every sample heard and every frame shown stays
 * what it was. Nothing else changes: every other key and its place, every
 * array and its order, every ID, and every value. A definition holds no video
 * node (D76.1).
 *
 * It is pure, total over valid documents of 0.25, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV025 } from '../v0-25/composition-schema.js';

type Entries = [string, unknown][];

/** A record of 0.25 with `added` directly after its key `after`, every other key detached. */
function after(value: unknown, key: string, added: Entries): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([name, child]): Entries =>
      name === key ? [[name, child], ...added] : [[name, detached(child)]],
    ),
  );
}

/** A video node of 0.25 with no fades after its volume (D85.1). */
function video(value: unknown): unknown {
  return after(value, 'volume', [
    ['fadeInUs', 0],
    ['fadeOutUs', 0],
  ]);
}

/** An audio clip of 0.25 with no volume curve after its fade-out (D85.2). */
function clip(value: unknown): unknown {
  return after(value, 'fadeOutUs', [['animations', []]]);
}

/** A node of a scene: a video node, or a group whose children may be video nodes. */
function node(value: unknown): unknown {
  const record = value as Readonly<Record<string, unknown>>;
  if (record['type'] === 'video') return video(value);
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
      if (key === 'clips') return [key, (child as readonly unknown[]).map(clip)];
      return [key, detached(child)];
    }),
  );
}

export function step025To026(document: CompositionV025): unknown {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): Entries => {
      if (key === 'schemaVersion') return [[key, '0.26']];
      if (key === 'scenes' || key === 'definitions')
        return [[key, (child as readonly unknown[]).map(holder)]];
      if (key === 'clips') return [[key, (child as readonly unknown[]).map(clip)]];
      return [[key, detached(child)]];
    }),
  );
}
