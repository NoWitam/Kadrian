/**
 * The forward step from schema 0.21 to 0.22 (D35.2, D49.7, D77): every
 * definition gets `sourceHash: ""` directly after its `id` and an empty
 * `template` as its last key, every instance gets `inputs: []` directly after
 * its `definitionId`, and `schemaVersion` becomes 0.22. A definition without a
 * template is no element, and an instance without values shows it as it is, so
 * the document renders byte for byte as it did. Nothing else changes: every
 * other key and its place, every array and its order, every ID, and every
 * value, every time value included (D49.7).
 *
 * It is pure, total over valid documents of 0.21, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV021 } from '../v0-21/composition-schema.js';

type Entries = [string, unknown][];

/** A node of 0.21, an instance with its `inputs` (D77). */
function node(value: unknown): unknown {
  const record = value as Readonly<Record<string, unknown>>;
  if (record['type'] !== 'instance') return detached(value);
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, child]): Entries => {
      if (key === 'definitionId')
        return [
          [key, child],
          ['inputs', []],
        ];
      return [[key, detached(child)]];
    }),
  );
}

function nodes(value: unknown): unknown[] {
  return (value as readonly unknown[]).map(node);
}

/** A holder of nodes, a scene or a definition, with its instances given `inputs`. */
function holder(value: unknown, extra: (key: string, child: unknown) => Entries | null): unknown {
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>).flatMap(([key, child]): Entries => {
      const replaced = extra(key, child);
      if (replaced !== null) return replaced;
      if (key === 'nodes') return [[key, nodes(child)]];
      return [[key, detached(child)]];
    }),
  );
}

function definition(value: unknown): unknown {
  return holder(value, (key, child) => {
    if (key === 'id')
      return [
        [key, child],
        ['sourceHash', ''],
      ];
    if (key === 'transitions')
      return [
        [key, detached(child)],
        ['template', { inputs: [], bindings: [], conditions: [], repeats: [] }],
      ];
    return null;
  });
}

export function step021To022(document: CompositionV021): unknown {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, child]): Entries => {
      if (key === 'schemaVersion') return [[key, '0.22']];
      if (key === 'scenes')
        return [[key, (child as readonly unknown[]).map((scene) => holder(scene, () => null))]];
      if (key === 'definitions') return [[key, (child as readonly unknown[]).map(definition)]];
      return [[key, detached(child)]];
    }),
  );
}
