/**
 * Every showcase of the playground in Chromium (D32.10): the page that
 * `apps/playground/scripts/serve.ts` serves, with the media
 * `apps/playground/scripts/media.ts` makes from the recipes of the fixtures,
 * opens each showcase, plays it to its end, runs its tool call and undoes it,
 * and reports no error — on the page, in the console, or as an uncaught
 * exception. A template is also instantiated with the values of its showcase
 * and played. A document whose asset has another hash and an invalid document
 * are refused with their codes. This replaces the manual check of D32 and its
 * missing record.
 *
 * Nothing here compares pixels: the showcases are not reference compositions,
 * and their frames are the Player's, which `parity.pinned.test.ts` and
 * `player-video.pinned.test.ts` measure. Skipped without `KADRION_FFMPEG`,
 * because the video is made by the pinned FFmpeg; required where the run is
 * pinned.
 */
import type { AddressInfo } from 'node:net';

import {
  contextOptions,
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  type LaunchedChromium,
} from '@kadrion/producer';
import type { Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makePlaygroundMedia } from '../../apps/playground/scripts/media.ts';
import { createPlaygroundServer } from '../../apps/playground/scripts/serve.ts';
import { SHOWCASES } from '../../apps/playground/src/showcases.js';

const ffmpegPath = process.env.KADRION_FFMPEG;
const available = ffmpegPath !== undefined && ffmpegPath !== '';
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;

/** How long a showcase may take to open and to play to its end: its length and a margin. */
const OPEN_MS = 30_000;
const MARGIN_MS = 15_000;

let chromium: LaunchedChromium | null = null;
let server: ReturnType<typeof createPlaygroundServer> | null = null;
let origin = '';

/** What a page reported that is an error, in the order it came. */
interface Watched {
  readonly page: Page;
  readonly problems: string[];
}

async function openPage(): Promise<Watched> {
  if (chromium === null) throw new Error('No browser.');
  const context = await chromium.browser.newContext(contextOptions(1600, 1400));
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    // The browser asks for a favicon the server does not have; that is not the page's error.
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
      problems.push(`console: ${message.text()}`);
    }
  });
  return { page, problems };
}

/** The status lines of the page, as a map from their first word. */
async function status(page: Page): Promise<Record<string, string>> {
  const text = (await page.locator('#status').textContent()) ?? '';
  return Object.fromEntries(
    text.split('\n').map((line) => {
      const at = line.indexOf(' ');
      return at === -1 ? [line, ''] : [line.slice(0, at), line.slice(at).trim()];
    }),
  );
}

async function until(
  page: Page,
  what: string,
  test: (lines: Record<string, string>) => boolean,
  timeoutMs: number,
): Promise<Record<string, string>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lines = await status(page);
    if (test(lines)) return lines;
    const errors = (await page.locator('#errors').textContent()) ?? '';
    if (errors !== '') throw new Error(`${what}: the page reports ${errors}`);
    if (Date.now() > deadline) throw new Error(`${what}: still ${JSON.stringify(lines)}`);
    await page.waitForTimeout(100);
  }
}

async function errorsOf(page: Page): Promise<string> {
  return (await page.locator('#errors').textContent()) ?? '';
}

/** Plays the document on screen from its start to its end, as a user presses Play. */
async function playToEnd(page: Page, label: string, durationUs: number): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await until(
    page,
    `${label} plays`,
    (lines) => lines['status'] === 'ended',
    durationUs / 1000 + MARGIN_MS,
  );
  expect(await errorsOf(page), label).toBe('');
}

describe.skipIf(!available && !pinned)(
  'the showcases of the playground in Chromium (D32.10)',
  () => {
    beforeAll(async () => {
      if (!available) throw new Error('A pinned run needs KADRION_FFMPEG for the video showcase.');
      await makePlaygroundMedia(ffmpegPath);
      const started = createPlaygroundServer();
      server = started;
      await new Promise<void>((resolve) => {
        started.listen(0, '127.0.0.1', resolve);
      });
      origin = `http://127.0.0.1:${String((started.address() as AddressInfo).port)}`;
      chromium = await launchChromium();
    });

    afterAll(async () => {
      await chromium?.browser.close();
      await new Promise<void>((resolve) => {
        if (server === null) resolve();
        else
          server.close(() => {
            resolve();
          });
      });
    });

    it.each(SHOWCASES.map((showcase) => [showcase.id, showcase] as const))(
      'opens, plays to the end, and edits the showcase %s without an error',
      async (id, showcase) => {
        const { page, problems } = await openPage();
        try {
          await page.goto(`${origin}/#${id}`);
          await until(
            page,
            `${id} opens`,
            (lines) => lines['document'] === `showcase ${id}` && lines['status'] === 'ready',
            OPEN_MS,
          );
          expect(await errorsOf(page)).toBe('');
          const source = JSON.parse((await page.locator('#source').inputValue()) || '{}') as {
            durationUs: number;
          };
          await playToEnd(page, id, source.durationUs);

          // The showcase's tool call, on the bus, then undone (D32.5).
          await page.getByRole('button', { name: 'Run tool call' }).click();
          await expect.poll(() => page.locator('#tool-result').textContent()).toMatch(/^Applied\./);
          await until(
            page,
            `${id} after the tool`,
            (lines) => lines['history'] === 'undo 1 / -',
            OPEN_MS,
          );
          await page.getByRole('button', { name: 'Undo', exact: true }).click();
          await until(
            page,
            `${id} after undo`,
            (lines) => lines['history'] === '- / redo 1',
            OPEN_MS,
          );
          expect(await errorsOf(page)).toBe('');

          // A template: the values of the showcase make another document, which plays too (D58.4).
          const template = page.locator('#template');
          expect(await template.isHidden(), id).toBe(showcase.templateValues === null);
          if (showcase.templateValues !== null) {
            await page.getByRole('button', { name: 'Instantiate with these values' }).click();
            await until(
              page,
              `${id} instantiated`,
              (lines) =>
                lines['document'] === `instantiated from showcase ${id}` &&
                lines['status'] === 'ready',
              OPEN_MS,
            );
            const made = JSON.parse(await page.locator('#source').inputValue()) as {
              durationUs: number;
            };
            await playToEnd(page, `${id} instantiated`, made.durationUs);
          }
          expect(problems).toEqual([]);
        } finally {
          await page.context().close();
        }
      },
      120_000,
    );

    it('refuses a document whose asset has another hash, and an invalid one, with their codes', async () => {
      const { page, problems } = await openPage();
      try {
        const first = SHOWCASES[0];
        if (first === undefined) throw new Error('No showcase.');
        await page.goto(`${origin}/#${first.id}`);
        await until(page, 'the first showcase', (lines) => lines['status'] === 'ready', OPEN_MS);
        const document = JSON.parse(await page.locator('#source').inputValue()) as {
          assets: { id: string; contentHash: string }[];
        };
        const image = document.assets.find((asset) => asset.id === 'asset-image');
        if (image === undefined) throw new Error('The first showcase has no image.');
        image.contentHash = `sha256:${'0'.repeat(64)}`;
        await page.locator('#source').fill(JSON.stringify(document));
        await page.getByRole('button', { name: 'Load this JSON' }).click();
        await expect
          .poll(() => errorsOf(page), { timeout: OPEN_MS })
          .toMatch(/^asset-hash-mismatch: /);

        await page.locator('#source').fill(JSON.stringify({ ...document, fps: 0 }));
        await page.getByRole('button', { name: 'Load this JSON' }).click();
        await expect
          .poll(() => errorsOf(page), { timeout: OPEN_MS })
          .toMatch(/^invalid-document: /);
        // The page logs both refusals to the console too; no exception escaped it.
        expect(problems.filter((problem) => problem.startsWith('pageerror'))).toEqual([]);
      } finally {
        await page.context().close();
      }
    }, 120_000);
  },
);
