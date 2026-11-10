/**
 * The head of the shell of a Custom HTML element (D78): the fonts as faces of
 * `data:` URLs, the number and colour parameters as custom properties, and the
 * managed clock, run here in a window of its own as the shell runs it before
 * the author's html. The clock gives every clock the element can read the
 * pushed time less the node's start, restarts the random source from that
 * time, runs the frame callbacks once per message, and answers once.
 */
import type { CustomHtmlNode } from '@kadrion/schema';
import { JSDOM, type DOMWindow } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { RenderError } from '../src/index.js';
import { CONTENT_SECURITY_POLICY, sandboxShell, shellHead } from '../src/sandbox.js';

const FONT = 'data:font/ttf;base64,AAEAAA==';

function node(overrides: Partial<CustomHtmlNode> = {}): CustomHtmlNode {
  return {
    id: 'html-node',
    type: 'custom-html',
    startUs: 1_000_000,
    durationUs: 9_000_000,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    origin: { x: 0, y: 0 },
    opacity: 1,
    animations: [],
    width: 100,
    height: 100,
    html: '',
    fontAssetIds: [],
    parameters: [],
    ...overrides,
  };
}

/** The script of the head, without its element. */
function clockScript(head: string): string {
  const start = head.indexOf('<script>') + '<script>'.length;
  return head.slice(start, head.lastIndexOf('</script>'));
}

interface Element {
  readonly window: DOMWindow;
  readonly acks: unknown[];
  /** Pushes a time as the host does, from the parent, and waits for the answer. */
  push(timeUs: number, requestId?: number): Promise<void>;
}

/** A window that runs the clock of `custom` as the shell does, then `author`. */
function element(custom: CustomHtmlNode, author = ''): Element {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const acks: unknown[] = [];
  // The window is its own parent here: the clock accepts its parent as the source.
  window.parent.postMessage = (message: unknown): void => {
    acks.push(message);
  };
  window.eval(clockScript(shellHead(custom, {})));
  if (author !== '') window.eval(author);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return {
    window,
    acks,
    async push(timeUs, requestId = 0) {
      window.dispatchEvent(
        new window.MessageEvent('message', {
          source: window as unknown as Window,
          data: { type: 'kadrion:time', version: 1, instanceId: custom.id, requestId, timeUs },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('the head of the shell (D78)', () => {
  it('admits fonts as data: URLs in the policy of the element, and nothing else new', () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'",
    );
    expect(sandboxShell('html-node')).toBe(
      `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><meta name="kadrion-instance" content="html-node">`,
    );
  });

  it('writes a face for each font, named by its asset ID, and the number and colour parameters as custom properties', () => {
    const head = shellHead(
      node({
        fontAssetIds: ['asset-font'],
        parameters: [
          { key: 'accent', type: 'color', value: '#f79009' },
          { key: 'label', type: 'text', value: 'Kadrion' },
          { key: 'show', type: 'boolean', value: true },
          { key: 'size', type: 'number', value: 1.5 },
        ],
      }),
      { 'asset-font': FONT },
    );
    expect(
      head.startsWith(
        `<style>@font-face{font-family:"asset-font";src:url("${FONT}")}:root{--accent:#f79009;--size:1.5}</style><script>`,
      ),
    ).toBe(true);
    expect(head.endsWith('</script></head>')).toBe(true);
  });

  it('writes no style element for an element without fonts and number or colour parameters', () => {
    expect(shellHead(node(), {}).startsWith('<script>')).toBe(true);
  });

  it('refuses a font whose URL is no data: URL of base64 bytes', () => {
    for (const url of [undefined, 'blob:x', 'https://example.com/a.ttf', 'data:font/ttf,abc")}']) {
      const assetUrls: Record<string, string> = url === undefined ? {} : { 'asset-font': url };
      const error = (() => {
        try {
          shellHead(node({ fontAssetIds: ['asset-font'] }), assetUrls);
        } catch (thrown) {
          return thrown;
        }
        return null;
      })();
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).code).toBe('asset-url-invalid');
    }
  });

  it('never lets a parameter end its script element', () => {
    const head = shellHead(
      node({ parameters: [{ key: 'label', type: 'text', value: '</script><script>alert(1)' }] }),
      {},
    );
    expect(head.match(/<\/script/gi)).toHaveLength(1);
    expect(head).toContain('\\u003c/script>\\u003cscript>alert(1)');
  });
});

describe('the managed clock (D78)', () => {
  it('gives Date, performance, and the frame callbacks the pushed time less the start', async () => {
    const seen: number[][] = [];
    const custom = element(
      node(),
      'requestAnimationFrame(function draw(t){window.seen.push([t, Date.now(), performance.now(), new Date().getTime(), kadrion.timeUs]);requestAnimationFrame(draw)})',
    );
    (custom.window as unknown as { seen: number[][] }).seen = seen;
    await custom.push(2_500_000, 75);
    await custom.push(500_000, 15);
    expect(seen).toEqual([
      [1500, 1500, 1500, 1500, 1_500_000],
      // Before its start the element sees 0, never a negative time.
      [0, 0, 0, 0, 0],
    ]);
  });

  it('answers each time once, after the frame, with the values it was given', async () => {
    const custom = element(node());
    await custom.push(2_500_000, 75);
    expect(custom.acks).toEqual([
      {
        type: 'kadrion:time-ack',
        version: 1,
        instanceId: 'html-node',
        requestId: 75,
        timeUs: 2_500_000,
      },
    ]);
  });

  it('leaves the answer to an element that listens to messages itself', async () => {
    const custom = element(node(), 'addEventListener("message", function(){})');
    await custom.push(2_500_000, 75);
    expect(custom.acks).toEqual([]);
  });

  it('ignores a message that is not exactly kadrion:time from its parent', async () => {
    const custom = element(node());
    custom.window.dispatchEvent(
      new custom.window.MessageEvent('message', {
        source: null,
        data: {
          type: 'kadrion:time',
          version: 1,
          instanceId: 'html-node',
          requestId: 1,
          timeUs: 1,
        },
      }),
    );
    custom.window.dispatchEvent(
      new custom.window.MessageEvent('message', {
        source: custom.window as unknown as Window,
        data: { type: 'kadrion:time', version: 1, instanceId: 'other', requestId: 1, timeUs: 1 },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(custom.acks).toEqual([]);
  });

  it('draws the same random numbers at the same time, whatever came before', async () => {
    const draws = async (times: readonly number[]): Promise<Map<number, number[]>> => {
      const custom = element(node());
      const out = new Map<number, number[]>();
      for (const timeUs of times) {
        await custom.push(timeUs);
        const random = custom.window.Math.random;
        out.set(timeUs, [random(), random(), random()]);
      }
      return out;
    };
    const forward = await draws([1_000_000, 2_000_000, 3_000_000]);
    const backward = await draws([3_000_000, 2_000_000, 1_000_000]);
    for (const timeUs of [1_000_000, 2_000_000, 3_000_000]) {
      expect(forward.get(timeUs)).toEqual(backward.get(timeUs));
    }
    expect(forward.get(2_000_000)).not.toEqual(forward.get(3_000_000));
    for (const value of forward.get(2_000_000) ?? []) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('offers the parameters frozen, and the instance', () => {
    const custom = element(
      node({ parameters: [{ key: 'label', type: 'text', value: 'Kadrion' }] }),
    );
    const kadrion = (
      custom.window as unknown as {
        kadrion: { instanceId: string; parameters: Record<string, unknown> };
      }
    ).kadrion;
    expect(kadrion.instanceId).toBe('html-node');
    expect(kadrion.parameters).toEqual({ label: 'Kadrion' });
    expect(Object.isFrozen(kadrion.parameters)).toBe(true);
  });
});
