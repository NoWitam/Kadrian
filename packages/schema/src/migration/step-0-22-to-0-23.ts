/**
 * The forward step from schema 0.22 to 0.23 (D35.2, D49.7, D78): every Custom
 * HTML node gets `fontAssetIds: []` and `parameters: []` directly after its
 * `html`, and `schemaVersion` becomes 0.23. An element without fonts and
 * parameters has the shell of before but for its managed clock (D78), which
 * leaves an element that derives its state from the time it is pushed exactly
 * as it was. Nothing else changes: every other key and its place, every array
 * and its order, every ID, and every value, every time value included (D49.7).
 * A Custom HTML node lies in a scene only: a group and a definition hold none
 * (D16, D76).
 *
 * It is pure, total over valid documents of 0.22, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV022 } from '../v0-22/composition-schema.js';

type Entries = [string, unknown][];

/** A node of 0.22, a Custom HTML node with its fonts and parameters (D78). */
function node(value: unknown): unknown {
  const record = value as Readonly<Record<string, unknown>>;
  if (record['type'] !== 'custom-html') return detached(value);
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, child]): Entries => {
      if (key === 'html')
        return [
          [key, child],
          ['fontAssetIds', []],
          ['parameters', []],
        ];
      return [[key, detached(child)]];
    }),
  );
}

function scene(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).map(([key, child]) => [
      key,
      key === 'nodes' ? (child as readonly unknown[]).map(node) : detached(child),
    ]),
  );
}

export function step022To023(document: CompositionV022): unknown {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): Entries => {
      if (key === 'schemaVersion') return [[key, '0.23']];
      if (key === 'scenes') return [[key, (child as readonly unknown[]).map(scene)]];
      return [[key, detached(child)]];
    }),
  );
}
