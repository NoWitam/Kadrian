/**
 * The stretch of a sound in pinned Chromium (D82.6, PR-59): `stretchSound` of
 * `@kadrion/runtime/stretch`, as built, gives the same 32-bit samples in the pinned
 * Chromium as in Node — the same SHA-256 for the speech and music fixtures at
 * every checked speed, forwards and reversed — and both equal the hashes that
 * `packages/runtime/test/stretch.test.ts` pins. The Producer and the Player
 * will compute a mapped sound with this one function (PR-61), so this is the
 * premise of their parity of sound.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

import { contextOptions, launchChromium, type LaunchedChromium } from '@kadrion/producer';
import { stretchSound } from '@kadrion/runtime/stretch';
import { clipTimeMap, type Speed } from '@kadrion/schema/time-map';
import { generateSoundFixture } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinnedRun, repoRoot, writeReport } from './support.js';

const ORIGIN = 'http://localhost:4524';
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const PACKAGES = ['runtime'];

/** The speeds of the quality check (D82, question 11). */
const SPEEDS: readonly Speed[] = [
  { num: 1, den: 4 },
  { num: 1, den: 2 },
  { num: 3, den: 4 },
  { num: 3, den: 2 },
  { num: 2, den: 1 },
  { num: 4, den: 1 },
];

/** One sound to stretch: the map as plain data (its intercept as a decimal string), on both sides. */
interface StretchCase {
  readonly name: string;
  readonly fixture: 'speech' | 'music';
  readonly intercept: string;
  readonly slope: number;
  readonly den: number;
  readonly sampleCount: number;
}

/** The cases of `stretch.test.ts`: a clip from composition time 0 reading its one-second source from 0. */
function cases(): StretchCase[] {
  const sourceUs = Math.floor((48_000 * 125) / 6);
  return (['speech', 'music'] as const).flatMap((fixture) =>
    SPEEDS.flatMap((speed) =>
      [false, true].map((reverse) => {
        const durationUs = Math.floor((sourceUs * speed.den) / speed.num);
        const map = clipTimeMap({
          startUs: 0,
          durationUs,
          sourceStartUs: 0,
          sourceStartRemainder: 0,
          speed,
          reverse,
        });
        return {
          name: `${fixture} ${String(speed.num)}/${String(speed.den)}${reverse ? ' reversed' : ''}`,
          fixture,
          intercept: map.intercept.toString(),
          slope: map.slope,
          den: map.den,
          sampleCount: Math.floor((durationUs * 6) / 125),
        };
      }),
    ),
  );
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="module">
import { stretchSound } from '/pkg/runtime/stretch.js';

window.stretch = async (sources, cases) => {
  const hashes = {};
  for (const item of cases) {
    const samples = Float32Array.from(sources[item.fixture]);
    const [out] = stretchSound({
      map: { intercept: BigInt(item.intercept), slope: item.slope, den: item.den },
      source: { channels: [samples], startSample: 0 },
      startSample: 0,
      sampleCount: item.sampleCount,
    });
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', out));
    hashes[item.name] = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return hashes;
};
window.ready = true;
</script></head><body></body></html>`;

interface StretchWindow {
  stretch(
    sources: Readonly<Record<string, readonly number[]>>,
    cases: readonly StretchCase[],
  ): Promise<Record<string, string>>;
}

/** A file of a built package that the page imports, and the page itself. */
function served(pathname: string): { body: Buffer; type: string } | null {
  if (pathname === '/') return { body: Buffer.from(PAGE), type: 'text/html; charset=utf-8' };
  const pkg = /^\/pkg\/([a-z-]+)\/(.+\.js)$/.exec(pathname);
  if (pkg?.[1] === undefined || pkg[2] === undefined || !PACKAGES.includes(pkg[1])) return null;
  const base = join(repoRoot, 'packages', pkg[1], 'dist');
  const file = normalize(join(base, ...pkg[2].split('/')));
  if (!file.startsWith(base + sep) || extname(file) !== '.js' || !existsSync(file)) return null;
  return { body: readFileSync(file), type: 'text/javascript; charset=utf-8' };
}

describe('the stretch of a sound in pinned Chromium (D82.6)', () => {
  let chromium: LaunchedChromium;

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('gives the same SHA-256 in Chromium as in Node, and as pinned, for every fixture and speed', async () => {
    const sources = {
      speech: generateSoundFixture('speech', 1),
      music: generateSoundFixture('music', 1),
    };
    const all = cases();
    const node = Object.fromEntries(
      all.map((item) => {
        const [out] = stretchSound({
          map: { intercept: BigInt(item.intercept), slope: item.slope, den: item.den },
          source: { channels: [sources[item.fixture]], startSample: 0 },
          startSample: 0,
          sampleCount: item.sampleCount,
        });
        const bytes = out ?? new Float32Array(0);
        return [
          item.name,
          createHash('sha256')
            .update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
            .digest('hex'),
        ];
      }),
    );
    const pinned = JSON.parse(
      readFileSync(join(repoRoot, 'packages', 'runtime', 'test', 'stretch.sha256.json'), 'utf8'),
    ) as Record<string, string>;
    const context = await chromium.browser.newContext(contextOptions(640, 360));
    const unexpected: string[] = [];
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const file = url.origin === ORIGIN ? served(url.pathname) : null;
      if (file === null) {
        unexpected.push(route.request().url());
        return route.abort('blockedbyclient');
      }
      return route.fulfill({
        status: 200,
        body: file.body,
        headers: {
          'content-type': file.type,
          'content-security-policy': POLICY,
          'cache-control': 'no-store',
        },
      });
    });
    try {
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/`);
      await page.waitForFunction(() => 'ready' in window);
      const browser = await page.evaluate(
        ([plain, items]) => (window as unknown as StretchWindow).stretch(plain, items),
        [{ speech: [...sources.speech], music: [...sources.music] }, all] as const,
      );
      const differingFromNode = all
        .map(({ name }) => name)
        .filter((name) => browser[name] !== node[name]);
      const differingFromPinned = all
        .map(({ name }) => name)
        .filter((name) => node[name] !== pinned[name]);
      writeReport('stretch/node-vs-chromium.json', {
        environment: pinnedRun(chromium),
        cases: all.length,
        node,
        differingFromNode,
        differingFromPinned,
      });
      expect(unexpected).toEqual([]);
      // The premise: every case was computed on both sides.
      expect(Object.keys(browser).sort()).toEqual(Object.keys(node).sort());
      expect(all).toHaveLength(24);
      expect(differingFromNode).toEqual([]);
      expect(differingFromPinned).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
