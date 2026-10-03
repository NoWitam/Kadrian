/**
 * A copy of JSON data that shares no object with its source (D42.7, D42.8).
 * Arrays keep their order, objects keep the order of their keys, and every
 * primitive is carried as it is — a `-0` stays `-0`, which a round trip through
 * JSON text would turn into `0`. It is called on validated documents only, whose
 * values are plain objects, arrays, strings, numbers, booleans, and null.
 */
export function detached(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map(detached);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]): [string, unknown] => [key, detached(child)]),
    );
  }
  return value;
}
