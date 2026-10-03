/**
 * The forward step from schema 0.1 to 0.2 (D35.2, D42.7): every node and every
 * child of a group gets a lifetime that spans the composition, directly after
 * its `type`, and `schemaVersion` becomes 0.2. Nothing else changes: every other
 * key and its place, every array and its order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.1, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV01 } from '../v0-1/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The keys of `source` in their order, each value given by `value`; `after` adds keys behind one. */
function rebuilt(
  source: Fields,
  value: (key: string, child: unknown) => unknown,
  after: (key: string) => readonly (readonly [string, unknown])[] = () => [],
): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]): (readonly [string, unknown])[] => [
      [key, value(key, child)],
      ...after(key),
    ]),
  );
}

export function step01To02(document: CompositionV01): unknown {
  // The one value the step invents, as D42.7 names it: the whole composition.
  const lifetime = [
    ['startUs', 0],
    ['durationUs', document.durationUs],
  ] as const;
  const node = (source: Fields): Fields =>
    rebuilt(
      source,
      (key, child) =>
        key === 'children' && Array.isArray(child)
          ? (child as readonly Fields[]).map(node)
          : detached(child),
      (key) => (key === 'type' ? lifetime : []),
    );
  const scene = (source: Fields): Fields =>
    rebuilt(source, (key, child) =>
      key === 'nodes' && Array.isArray(child)
        ? (child as readonly Fields[]).map(node)
        : detached(child),
    );
  return rebuilt(document, (key, child) => {
    if (key === 'schemaVersion') return '0.2';
    if (key === 'scenes' && Array.isArray(child)) return (child as readonly Fields[]).map(scene);
    return detached(child);
  });
}
