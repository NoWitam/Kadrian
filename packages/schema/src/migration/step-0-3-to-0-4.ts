/**
 * The forward step from schema 0.3 to 0.4 (D35.2, D49.7, D52.6): every video
 * node, and every video child of a group, gets `volume: 0` as its last key — the
 * silence it had in 0.3 (D50.1) — and every audio clip gets
 * `sourceStartUs: 0`, `volume: 1`, `fadeInUs: 0`, and `fadeOutUs: 0` as its
 * last keys — the clip as it sounded in 0.3, from the first sample of its
 * asset, unchanged and unfaded (D29.6). `schemaVersion` becomes 0.4.
 * Nothing else changes: every other key and its place, every array and its
 * order, every ID, and every value, every time value included (D49.7).
 *
 * It is pure, total over valid documents of 0.3, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV03 } from '../v0-3/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The node with its children carried through, and its sound added at its end if it is a video. */
function node(source: Fields): Fields {
  const entries = Object.entries(source).map(([key, child]): [string, unknown] => [
    key,
    key === 'children' && Array.isArray(child)
      ? (child as readonly Fields[]).map(node)
      : detached(child),
  ]);
  return Object.fromEntries(source['type'] === 'video' ? [...entries, ['volume', 0]] : entries);
}

function clip(source: Fields): Fields {
  return Object.fromEntries([
    ...Object.entries(source).map(([key, child]): [string, unknown] => [key, detached(child)]),
    ['sourceStartUs', 0],
    ['volume', 1],
    ['fadeInUs', 0],
    ['fadeOutUs', 0],
  ]);
}

export function step03To04(document: CompositionV03): unknown {
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
      if (key === 'schemaVersion') return [key, '0.4'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      if (key === 'clips' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(clip)];
      }
      return [key, detached(child)];
    }),
  );
}
