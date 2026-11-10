/**
 * The render check of `check_custom_html` (D78) on a fake render: the
 * document of the element alone, the sampled times, the two passes in opposite
 * orders, and what it reports. The pinned Chromium runs it in
 * tests/pinned/custom-html-ai.pinned.test.ts.
 */
import { customHtmlComposition } from '@kadrion/test-fixtures';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

import {
  checkCustomHtmlWith,
  customHtmlCheckDocument,
  sampledTimes,
  type CheckRender,
} from '../src/custom-html-check.js';
import { ProducerError } from '../src/errors.js';
import type { RenderResult } from '../src/render.js';

const resolveAsset = (): null => null;

function composition(): ValidatedComposition {
  const result = validateComposition(customHtmlComposition);
  if (!result.ok) throw new Error('The fixture is invalid.');
  return result.composition;
}

/** A render whose frame at each time is `pick(timeUs, pass)`; it records each request. */
function fakeRender(pick: (timeUs: number, pass: number) => number): {
  render: CheckRender;
  calls: { document: unknown; timesUs: readonly number[] }[];
} {
  const calls: { document: unknown; timesUs: readonly number[] }[] = [];
  const render: CheckRender = (request) => {
    calls.push({ document: request.document, timesUs: request.timesUs });
    const pass = calls.length;
    return Promise.resolve({
      frames: request.timesUs.map((timeUs) => ({
        timeUs,
        png: new Uint8Array([pick(timeUs, pass)]),
      })),
    } as unknown as RenderResult);
  };
  return { render, calls };
}

describe('the document of the element alone (D78)', () => {
  it('holds the element at the top-left corner from 0, unanimated, over grey, with its fonts only', () => {
    const source = composition();
    const node = source.scenes[0]?.nodes.find(({ id }) => id === 'html-script');
    if (node?.type !== 'custom-html') throw new Error('No element.');
    const document = customHtmlCheckDocument(source, node) as ValidatedComposition;
    expect(validateComposition(document).ok).toBe(true);
    expect(document.durationUs).toBe(9_000_000);
    expect(document.assets.map(({ id }) => id)).toEqual(['asset-font']);
    expect(document.scenes[0]?.nodes).toEqual([
      {
        id: 'check-background',
        type: 'background',
        startUs: 0,
        durationUs: 9_000_000,
        color: '#808080',
        animations: [],
      },
      {
        ...node,
        startUs: 0,
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        origin: { x: 0, y: 0 },
        opacity: 1,
        animations: [],
      },
    ]);
  });

  it('samples the first and the last frame and evenly between, each once', () => {
    expect(sampledTimes(300, 30, 5)).toEqual([0, 2_500_000, 5_000_000, 7_466_666, 9_966_666]);
    expect(sampledTimes(2, 30, 5)).toEqual([0, 33_333]);
    expect(sampledTimes(300, 30, 1)).toEqual([0]);
  });
});

describe('checkCustomHtmlWith (D78)', () => {
  it('renders forward, then backward, and finds nothing when the frames agree', async () => {
    const { render, calls } = fakeRender((timeUs) => timeUs % 251);
    const check = await checkCustomHtmlWith(
      { document: customHtmlComposition, nodeId: 'html-css', resolveAsset },
      render,
    );
    expect(check.problems).toEqual([]);
    expect(check.timesUs).toEqual([0, 2_500_000, 5_000_000, 7_466_666, 9_966_666]);
    expect(calls.map(({ timesUs }) => timesUs)).toEqual([
      check.timesUs,
      [...check.timesUs].reverse(),
    ]);
    expect(calls[0]?.document).toBe(calls[1]?.document);
  });

  it('reports each time whose frame differs between the two renders', async () => {
    const { render } = fakeRender((timeUs, pass) => (timeUs === 5_000_000 ? pass : 0));
    const check = await checkCustomHtmlWith(
      { document: customHtmlComposition, nodeId: 'html-css', resolveAsset },
      render,
    );
    expect(check.problems.map(({ code, timeUs }) => [code, timeUs])).toEqual([
      ['frames-differ', 5_000_000],
    ]);
  });

  it('reports a time the element did not answer, a navigation, and any other failure', async () => {
    const failing =
      (reason: Error): CheckRender =>
      () =>
        Promise.reject(reason);
    const codes = async (reason: Error): Promise<unknown> =>
      (
        await checkCustomHtmlWith(
          { document: customHtmlComposition, nodeId: 'html-css', resolveAsset },
          failing(reason),
        )
      ).problems.map(({ code }) => code);
    expect(await codes(new ProducerError('custom-html-timeout', 'late'))).toEqual([
      'no-acknowledgement',
    ]);
    expect(await codes(new ProducerError('custom-html-navigated', 'gone'))).toEqual(['navigated']);
    expect(await codes(new Error('crash'))).toEqual(['render-failed']);
  });

  it('refuses an invalid document, a node that is no Custom HTML, and a bad sample count', async () => {
    const { render } = fakeRender(() => 0);
    const code = async (request: Parameters<typeof checkCustomHtmlWith>[0]): Promise<string> =>
      checkCustomHtmlWith(request, render).then(
        () => 'resolved',
        (reason: unknown) => (reason instanceof ProducerError ? reason.code : 'other'),
      );
    expect(await code({ document: {}, nodeId: 'html-css', resolveAsset })).toBe('invalid-document');
    expect(
      await code({ document: customHtmlComposition, nodeId: 'html-background', resolveAsset }),
    ).toBe('invalid-document');
    expect(await code({ document: customHtmlComposition, nodeId: 'nope', resolveAsset })).toBe(
      'invalid-document',
    );
    expect(
      await code({ document: customHtmlComposition, nodeId: 'html-css', resolveAsset, samples: 0 }),
    ).toBe('invalid-document');
  });
});
