/**
 * The page's clear (D89.2): `frame` sets the background colour of the page's
 * root to `transparent` for a transparent document and removes it for a white
 * one, so that the white the page's style states shows (D42.5). What a browser
 * paints for it is measured in the pinned environment
 * (`tests/pinned/clear.pinned.test.ts`); here the root's style is checked.
 */
import { compatibilityCorpus } from '@kadrion/test-fixtures/compatibility';
import type { DOMWindow } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { mount, frame } from '../src/page.js';
import { hostDouble } from './elements.js';
import { createRoot, createWindow, TRUSTED } from './support.js';

/** The document of the corpus with no node, in the current schema, with the given clear. */
function minimal(clear: 'white' | 'transparent'): unknown {
  const entry = compatibilityCorpus.find(({ id }) => id === 'minimal-0-1');
  if (entry === undefined) throw new Error('No minimal document in the corpus.');
  return JSON.parse(JSON.stringify({ ...(entry.expected as object), clear })) as unknown;
}

/** A settled font set: the document has no image and no font to wait for. */
function settledFonts(window: DOMWindow): void {
  Object.defineProperty(window.document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
}

function rootStyle(window: DOMWindow): string {
  return window.document.documentElement.getAttribute('style') ?? '';
}

describe("the page's clear (D89.2)", () => {
  it('is stated in the current schema by the minimal document, white', () => {
    expect((minimal('white') as { clear: string }).clear).toBe('white');
  });

  it('sets the background colour of the root to transparent for a transparent document', async () => {
    const window = createWindow();
    settledFonts(window);
    const root = createRoot(window);
    const document = minimal('transparent');
    expect(mount(root, document, {}, TRUSTED)).toEqual({ ok: true });
    const result = frame(root, document, 0, hostDouble(window).host);
    // Written with the frame, before it is ready.
    expect(window.document.documentElement.style.getPropertyValue('background-color')).toBe(
      'transparent',
    );
    await expect(result).resolves.toEqual({ ok: true });
    expect(rootStyle(window)).toBe('background-color: transparent;');
  });

  it('leaves the root without a background colour of its own for a white document', async () => {
    const window = createWindow();
    settledFonts(window);
    const root = createRoot(window);
    const document = minimal('white');
    mount(root, document, {}, TRUSTED);
    await expect(frame(root, document, 0, hostDouble(window).host)).resolves.toEqual({ ok: true });
    expect(window.document.documentElement.style.getPropertyValue('background-color')).toBe('');
    expect(rootStyle(window)).toBe('');
  });

  it('removes a transparent clear when the next frame is of a white document', async () => {
    const window = createWindow();
    settledFonts(window);
    const root = createRoot(window);
    const transparent = minimal('transparent');
    const white = minimal('white');
    mount(root, transparent, {}, TRUSTED);
    await frame(root, transparent, 0, hostDouble(window).host);
    expect(rootStyle(window)).toBe('background-color: transparent;');
    await frame(root, white, 0, hostDouble(window).host);
    expect(window.document.documentElement.style.getPropertyValue('background-color')).toBe('');
    await frame(root, transparent, 0, hostDouble(window).host);
    expect(rootStyle(window)).toBe('background-color: transparent;');
  });

  it('writes nothing for an invalid document', async () => {
    const window = createWindow();
    settledFonts(window);
    const root = createRoot(window);
    const invalid = { ...(minimal('transparent') as object), clear: 'black' };
    await expect(frame(root, invalid, 0, hostDouble(window).host)).resolves.toMatchObject({
      ok: false,
    });
    expect(rootStyle(window)).toBe('');
  });
});
