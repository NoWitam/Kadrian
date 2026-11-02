/**
 * The forward step from schema 0.7 to 0.8 (D35.2, D49.7, D58): the composition
 * gets an empty template section, `template: { inputs: [], bindings: [] }`, as
 * its last key. A composition without inputs and bindings is no template and
 * renders as it did, so no time value moves. `schemaVersion` becomes 0.8.
 * Nothing else changes: every other key and its place, every array and its
 * order, every ID, and every value.
 *
 * It is pure, total over valid documents of 0.7, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV07 } from '../v0-7/composition-schema.js';

export function step07To08(document: CompositionV07): unknown {
  return Object.fromEntries([
    ...Object.entries(document).map(([key, child]): [string, unknown] =>
      key === 'schemaVersion' ? [key, '0.8'] : [key, detached(child)],
    ),
    ['template', { inputs: [], bindings: [] }],
  ]);
}
