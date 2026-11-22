/**
 * The clear of a page of the Producer (D89.2): a white document opens and
 * captures the page as before; a transparent one states a transparent
 * background in the host document, and each capture overrides the default
 * background colour of the page with transparent black on its own session,
 * right before it captures. The browser is a double here; what Chromium
 * paints is measured in the pinned environment (`tests/pinned/clear.pinned.test.ts`).
 */
import { RENDER_PAGE_FRAME_STYLE } from '@kadrion/renderer-dom';
import type { Clear } from '@kadrion/schema';
import type { Browser } from 'playwright-core';
import { describe, expect, it } from 'vitest';

import { captureAs, TRANSPARENT_BACKGROUND } from '../src/capture.js';
import type { LaunchedChromium } from '../src/environment.js';
import { hostDocument, openRenderSession } from '../src/render.js';
import type { RuntimeBuild } from '../src/runtime.js';

const RUNTIME: RuntimeBuild = {
  script: '/* runtime */',
  contentHash: `sha256:${'0'.repeat(64)}`,
  bundler: 'esbuild',
  compiler: 'typescript',
};

/** A browser that records what the session asks of it, in order. */
function fakeChromium(log: string[]): LaunchedChromium {
  const session = {
    send(method: string, params: unknown) {
      log.push(
        method === 'Page.captureScreenshot'
          ? `send ${method}`
          : `send ${method} ${JSON.stringify(params)}`,
      );
      return Promise.resolve({ data: Buffer.from('png').toString('base64') });
    },
    detach() {
      log.push('detach');
      return Promise.resolve();
    },
  };
  const renderFrame = { waitForFunction: () => Promise.resolve() };
  const context = {
    route: () => Promise.resolve(),
    on: () => undefined,
    newPage: () => Promise.resolve(page),
    newCDPSession: (target: unknown) => {
      log.push(target === page ? 'session of the page' : 'session of another target');
      return Promise.resolve(session);
    },
    close: () => {
      log.push('close');
      return Promise.resolve();
    },
  };
  const page = {
    on: () => undefined,
    context: () => context,
    mainFrame: () => ({ childFrames: () => [renderFrame] }),
    setContent: (html: string) => {
      log.push(
        `content ${html.includes('html{background-color:transparent}') ? 'transparent' : 'as before'}`,
      );
      return Promise.resolve();
    },
  };
  return {
    browser: { newContext: () => Promise.resolve(context) } as unknown as Browser,
    reportedVersion: 'fake',
  };
}

async function openAndClose(clear?: Clear): Promise<string[]> {
  const log: string[] = [];
  const session = await openRenderSession({
    chromium: fakeChromium(log),
    width: 64,
    height: 36,
    customHtmlNodes: 0,
    runtime: RUNTIME,
    ...(clear === undefined ? {} : { clear }),
  });
  log.push('open');
  await session.close();
  return log;
}

describe('the frame and the host document of a page (D28.1, D89.2)', () => {
  it('states the colour scheme normal on the frame, besides its layout', () => {
    expect(RENDER_PAGE_FRAME_STYLE).toEqual({
      display: 'block',
      'border-style': 'none',
      'color-scheme': 'normal',
    });
  });

  it('is the host document it was before for a white clear, the default', () => {
    const html = hostDocument('/* runtime */', 64, 36);
    expect(hostDocument('/* runtime */', 64, 36, 'white')).toBe(html);
    expect(html).toContain('<style>html,body{margin:0;padding:0;overflow:hidden}</style>');
    expect(html).not.toContain('transparent');
  });

  it('states a transparent background for a transparent clear, and nothing else differs', () => {
    const white = hostDocument('/* runtime */', 64, 36);
    const transparent = hostDocument('/* runtime */', 64, 36, 'transparent');
    expect(transparent).toBe(
      white.replace(
        '<style>html,body{margin:0;padding:0;overflow:hidden}</style>',
        '<style>html,body{margin:0;padding:0;overflow:hidden}html{background-color:transparent}</style>',
      ),
    );
  });
});

describe('the override of the default background (D89.2)', () => {
  it('is transparent black', () => {
    expect(TRANSPARENT_BACKGROUND).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(Object.isFrozen(TRANSPARENT_BACKGROUND)).toBe(true);
  });

  it('is set on the session of a capture of a transparent page, right before it captures', async () => {
    const log: string[] = [];
    const chromium = fakeChromium(log);
    const context = await chromium.browser.newContext();
    const page = await context.newPage();
    log.length = 0;
    await captureAs(page, 64, 36, 'reference', 'transparent');
    expect(log).toEqual([
      'session of the page',
      'send Emulation.setDefaultBackgroundColorOverride {"color":{"r":0,"g":0,"b":0,"a":0}}',
      'send Page.captureScreenshot',
      'detach',
    ]);
  });

  it.each([['white' as const], [undefined]])(
    'is not set on a capture of a clear of %s, which captures as before',
    async (clear) => {
      const log: string[] = [];
      const chromium = fakeChromium(log);
      const context = await chromium.browser.newContext();
      const page = await context.newPage();
      log.length = 0;
      await (clear === undefined
        ? captureAs(page, 64, 36, 'reference')
        : captureAs(page, 64, 36, 'reference', clear));
      expect(log).toEqual(['session of the page', 'send Page.captureScreenshot', 'detach']);
    },
  );

  it.each([['transparent' as const], ['white' as const], [undefined]])(
    'opens a page of a clear of %s with no session of its own: only its host document differs',
    async (clear) => {
      expect(await openAndClose(clear)).toEqual([
        clear === 'transparent' ? 'content transparent' : 'content as before',
        'open',
        'close',
      ]);
    },
  );
});
