/**
 * The host example of the README, run (D43.7).
 *
 * What this proves, and what it does not. `parseComposition` is a pure function
 * of its text: it sees no bus, so a refused text cannot touch one, and that is a
 * property of Kadrion. Replacing the open document is the host's own code — one
 * assignment after a success. This test runs the example host of the README,
 * `readme-host-example.ts`, whose code the README prints character for
 * character, and shows that this host keeps its bus, its history, and its
 * listener when a load is refused, and that after a load that succeeded all
 * three are those of the new document. A test of synchronous code sees the
 * state before a call and after it, never a moment in between. It is evidence
 * for that example, and for the pattern it shows; it proves nothing about a
 * host that is written otherwise.
 */
import type { BusChange } from '@kadrion/editor-sdk';
import { SCHEMA_VERSION } from '@kadrion/schema';
import { referenceComposition, referenceCompositionV01 } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createHost } from './readme-host-example.js';
import { readText } from './repo.js';

const readme = readText('README.md');
const source = readText('tests', 'repo', 'readme-host-example.ts');

const currentText = JSON.stringify(referenceComposition);
const olderText = JSON.stringify(referenceCompositionV01);

/** A host of the example with a record of what its listener was told. */
function host(): { readonly app: ReturnType<typeof createHost>; readonly changes: BusChange[] } {
  const changes: BusChange[] = [];
  const app = createHost(
    (change) => changes.push(change),
    (error) => {
      throw error;
    },
  );
  return { app, changes };
}

const edit = (startUs: number) => ({
  type: 'SetNodeLifetime',
  nodeId: 'node-title',
  startUs,
  durationUs: 1_000_000,
});

describe('the host example of the README (D43.7)', () => {
  it('is the code this test runs: the block of the README is the code of the module, character for character', () => {
    const block =
      /<!-- host-example:start -->\n\n```ts\n([\s\S]*?\n)```\n\n<!-- host-example:end -->/.exec(
        readme,
      )?.[1];
    expect(block).toBeDefined();
    // Everything below the comment that heads the module, white space included.
    const code = source.slice(source.indexOf('\nimport {') + 1);
    expect(code.startsWith('import {')).toBe(true);
    expect(block).toBe(code);
  });

  it('opens a saved text into a bus with an empty history', () => {
    const { app, changes } = host();
    expect(app.bus()).toBeNull();
    expect(app.save()).toBeNull();
    const result = app.open(currentText);
    expect(result.ok && result.versions).toEqual([SCHEMA_VERSION]);
    const bus = app.bus();
    expect(bus?.canUndo()).toBe(false);
    expect(bus?.canRedo()).toBe(false);
    expect(JSON.stringify(bus?.getDocument())).toBe(currentText);
    expect(changes).toEqual([]);
  });

  it.each([
    ['a text that is no JSON', '{'],
    ['a byte order mark', `\uFEFF${currentText}`],
    ['a version this build does not know', currentText.replace('"0.2"', '"0.3"')],
    ['an invalid document', currentText.replace('"fps":30', '"fps":0')],
    ['an invalid document of an earlier version', olderText.replace('"fps":30', '"fps":0')],
    ['a value that is no string', 5 as unknown as string],
  ])('keeps the open document, its history, and its listener when %s is refused', (_, text) => {
    const { app, changes } = host();
    expect(app.open(currentText).ok).toBe(true);
    const bus = app.bus();
    if (bus === null) throw new Error('No bus.');
    // A history with something to undo and something to redo.
    bus.dispatch(edit(1));
    bus.dispatch(edit(2));
    bus.undo();
    const before = {
      document: bus.getDocument(),
      text: JSON.stringify(bus.getDocument()),
      canUndo: bus.canUndo(),
      canRedo: bus.canRedo(),
      changes: changes.length,
    };
    expect([before.canUndo, before.canRedo, before.changes]).toEqual([true, true, 3]);

    const result = app.open(text);
    expect(result.ok).toBe(false);

    // The same bus, the same document object, the same history, and no event.
    expect(app.bus()).toBe(bus);
    expect(bus.getDocument()).toBe(before.document);
    expect(JSON.stringify(bus.getDocument())).toBe(before.text);
    expect([bus.canUndo(), bus.canRedo()]).toEqual([before.canUndo, before.canRedo]);
    expect(changes).toHaveLength(before.changes);
    // And the listener still hears this bus.
    bus.redo();
    expect(changes).toHaveLength(before.changes + 1);
  });

  it('has the bus, the history, and the listener of the new document after a load succeeded', () => {
    const { app, changes } = host();
    app.open(currentText);
    const first = app.bus();
    if (first === null) throw new Error('No bus.');
    first.dispatch(edit(1));
    expect([first.canUndo(), changes.length]).toEqual([true, 1]);

    // A document of 0.1: migrated on the way in, and reported as such.
    const result = app.open(olderText);
    expect(result.ok && result.versions).toEqual(['0.1', SCHEMA_VERSION]);
    const second = app.bus();
    if (second === null) throw new Error('No bus.');
    expect(second).not.toBe(first);
    expect([second.canUndo(), second.canRedo()]).toEqual([false, false]);
    // The migrated reference is the reference of the current version.
    expect(JSON.stringify(second.getDocument())).toBe(currentText);
    expect(changes).toHaveLength(1);

    // The old bus is no longer listened to; the new one is.
    first.dispatch(edit(3));
    expect(changes).toHaveLength(1);
    second.dispatch(edit(4));
    expect(changes).toHaveLength(2);
    expect(changes[1]?.document).toBe(second.getDocument());
  });

  it('saves the document of the bus as text that loads as the same document', () => {
    const { app } = host();
    app.open(olderText);
    app.bus()?.dispatch(edit(5));
    const text = app.save();
    expect(text).toBe(JSON.stringify(app.bus()?.getDocument()));
    expect(text).not.toBe(currentText);
    // Loaded by another host: current, so no step, and the same text again.
    const other = host();
    const result = other.app.open(text ?? '');
    expect(result.ok && result.versions).toEqual([SCHEMA_VERSION]);
    expect(other.app.save()).toBe(text);
  });
});
