/**
 * The host's Custom HTML policy (D36; D23.1 and D22.3 as amended by PR-16): the
 * renderer mounts an element's sandboxed frame only when the host trusts it,
 * and otherwise an empty placeholder of the same geometry that never reads the
 * element's HTML. jsdom neither loads `srcdoc` nor runs its scripts; that no
 * element runs without the opt-in in a browser is shown in Chromium by
 * `tests/pinned/player.pinned.test.ts`.
 */
import { evaluateComposition } from '@kadrion/runtime';
import type { ValidatedComposition } from '@kadrion/schema';
import { referenceExpectedRender } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  mountComposition,
  renderState,
  synchronizeCustomHtml,
  type MountOptions,
} from '../src/index.js';
import { hostDouble, settledState } from './elements.js';
import {
  createRoot,
  createWindow,
  derived,
  describeNode,
  describeRoot,
  draftNode,
  elementOf,
  reference,
  referenceUrls,
  DISABLED,
  TRUSTED,
} from './support.js';

const NODE = 'node-custom-html';
/** Written out independently of `policy.ts`. */
const MARK = 'data-kadrion-custom-html';
const goldenTimes = referenceExpectedRender.golden.map(({ timeUs }) => timeUs);

function mountedWith(options: MountOptions, composition: ValidatedComposition = reference) {
  const window = createWindow();
  const root = createRoot(window);
  mountComposition(root, composition, referenceUrls, options);
  return { window, root, placeholder: elementOf(root, NODE) };
}

function codeOf(action: () => unknown): unknown {
  try {
    action();
  } catch (reason) {
    return (reason as { code?: unknown }).code;
  }
  return 'no error';
}

describe('the policy is required, in exactly one of its forms (D36)', () => {
  const withGetter = {
    get customHtml() {
      return { mode: 'trusted' };
    },
  };
  const withSymbol = { customHtml: { mode: 'trusted' }, [Symbol('extra')]: 1 };
  const refused: [string, unknown][] = [
    ['no options', undefined],
    ['null', null],
    ['an empty object', {}],
    ['an array', [{ customHtml: { mode: 'trusted' } }]],
    ['no mode', { customHtml: {} }],
    ['a mode in another case', { customHtml: { mode: 'Trusted' } }],
    ['an unknown mode', { customHtml: { mode: 'sandboxed' } }],
    ['a boolean', { customHtml: true }],
    ['a mode as a boolean', { customHtml: { mode: true } }],
    ['an extra key in the policy', { customHtml: { mode: 'trusted', ids: [] } }],
    ['an extra key beside it', { customHtml: { mode: 'disabled' }, trusted: true }],
    ['a getter instead of a value', withGetter],
    ['a symbol key beside it', withSymbol],
  ];

  it.each(refused)('refuses %s with invalid-options, before the DOM is touched', (_, options) => {
    const root = createRoot();
    root.innerHTML = '<p>before</p>';
    expect(
      codeOf(() => {
        mountComposition(root, reference, referenceUrls, options as MountOptions);
      }),
    ).toBe('invalid-options');
    expect(root.innerHTML).toBe('<p>before</p>');
  });

  it('accepts a policy made in another realm, as a document is (D21)', () => {
    const window = createWindow();
    const root = createRoot(window);
    const foreign = window.JSON.parse('{"customHtml":{"mode":"disabled"}}') as MountOptions;
    mountComposition(root, reference, referenceUrls, foreign);
    expect(elementOf(root, NODE).getAttribute(MARK)).toBe('disabled');
  });
});

describe('disabled: an empty placeholder, never the element (D36)', () => {
  it('mounts no frame at all, only the marked placeholder with no child', () => {
    const { window, root, placeholder } = mountedWith(DISABLED);
    expect(root.querySelectorAll('iframe')).toHaveLength(0);
    expect(window.frames.length).toBe(0);
    expect(placeholder.childNodes).toHaveLength(0);
    expect(placeholder.getAttributeNames().sort()).toEqual([MARK, 'data-kadrion-node', 'style']);
    expect(placeholder.getAttribute(MARK)).toBe('disabled');
  });

  it('is the trusted tree without the frame, and with the mark', () => {
    const trusted = describeRoot(mountedWith(TRUSTED).root);
    const disabled = describeRoot(mountedWith(DISABLED).root);
    interface Described {
      attributes?: Record<string, string>;
      children?: Described[];
    }
    const expected = structuredClone(trusted) as Described[];
    let changed = 0;
    const visit = (node: Described): void => {
      if (node.attributes?.['data-kadrion-composition'] === '') {
        node.attributes[MARK] = 'disabled';
        changed += 1;
      }
      if (node.attributes?.['data-kadrion-node'] === NODE) {
        expect(node.children?.map((child) => (child as { tag?: string }).tag)).toEqual(['iframe']);
        node.attributes[MARK] = 'disabled';
        node.children = [];
        changed += 1;
      }
      node.children?.forEach(visit);
    };
    expected.forEach(visit);
    expect(changed).toBe(2);
    expect(disabled).toEqual(expected);
  });

  it("never reads the element's HTML, so nothing parses, runs, or shows it", () => {
    const marker = 'kadrion-d36-marker';
    const composition = derived((draft) => {
      const node = draftNode(draft, NODE);
      if (node.type !== 'custom-html') throw new Error('Not a Custom HTML node.');
      node.html = `<script>window.parent.ran = true</script><p title="${marker}">${marker}</p>`;
    });
    const { window, root } = mountedWith(DISABLED, composition);
    expect(root.outerHTML).not.toContain(marker);
    for (const element of root.querySelectorAll('*')) {
      for (const name of element.getAttributeNames()) {
        expect(element.getAttribute(name), name).not.toContain(marker);
      }
    }
    // jsdom runs no script here either way; the scan above and the getter below are the evidence.
    expect((window as unknown as { ran?: unknown }).ran).toBeUndefined();

    // A forged document whose HTML throws when read: disabled never reads it.
    const forged = JSON.parse(JSON.stringify(reference)) as {
      scenes: { nodes: { id: string; html?: string }[] }[];
    };
    const node = forged.scenes.flatMap((scene) => scene.nodes).find(({ id }) => id === NODE);
    if (node === undefined) throw new Error('No Custom HTML node.');
    Object.defineProperty(node, 'html', {
      get() {
        throw new Error('The HTML was read.');
      },
    });
    const branded = forged as unknown as ValidatedComposition;
    expect(() => mountedWith(DISABLED, branded)).not.toThrow();
    expect(() => mountedWith(TRUSTED, branded)).toThrow('The HTML was read.');
  });

  it('keeps the size, place, transform, and opacity of the trusted element at every golden time', () => {
    const trusted = mountedWith(TRUSTED);
    const disabled = mountedWith(DISABLED);
    for (const timeUs of goldenTimes) {
      const state = evaluateComposition(reference, timeUs);
      renderState(trusted.root, state);
      renderState(disabled.root, state);
      const { style: trustedStyle } = describeNode(trusted.placeholder) as { style: unknown };
      const { style: disabledStyle } = describeNode(disabled.placeholder) as { style: unknown };
      expect(disabledStyle, String(timeUs)).toEqual(trustedStyle);
      expect(disabled.placeholder.style.getPropertyValue('width')).toBe(
        trusted.placeholder.style.getPropertyValue('width'),
      );
      expect(disabled.placeholder.style.getPropertyValue('width')).toMatch(/^[1-9]\d*px$/);
    }
  });
});

describe('synchronizing a disabled element (D23.4 as amended, D36)', () => {
  it('posts nothing and registers no listener and no timer', async () => {
    const { window, root } = mountedWith(DISABLED);
    const host = hostDouble(window);
    const state = evaluateComposition(reference, 5_000_000);
    renderState(root, state);
    expect(await settledState(synchronizeCustomHtml(root, state, host.host))).toBe('resolved');
    expect(host.listeners()).toBe(0);
    expect(host.timersStarted()).toBe(0);
    expect(root.querySelectorAll('iframe')).toHaveLength(0);
  });

  const altered: [string, (placeholder: HTMLElement) => void][] = [
    [
      'a child',
      (placeholder) => {
        placeholder.append('x');
      },
    ],
    [
      'an empty text child',
      (placeholder) => {
        placeholder.append('');
      },
    ],
    [
      'another value of the mark',
      (placeholder) => {
        placeholder.setAttribute(MARK, 'trusted');
      },
    ],
    [
      'an extra attribute',
      (placeholder) => {
        placeholder.setAttribute('title', 'x');
      },
    ],
  ];

  it.each(altered)('refuses a disabled placeholder with %s as not-mounted', async (_, alter) => {
    const { window, root, placeholder } = mountedWith(DISABLED);
    alter(placeholder);
    const host = hostDouble(window);
    await expect(
      synchronizeCustomHtml(root, evaluateComposition(reference, 0), host.host),
    ).rejects.toMatchObject({ code: 'not-mounted' });
    expect(host.listeners()).toBe(0);
  });

  const stageOf = (root: Element): Element => {
    const stage = root.firstElementChild;
    if (stage === null) throw new Error('No stage.');
    return stage;
  };
  const mixed: [string, MountOptions, (mounted: ReturnType<typeof mountedWith>) => void][] = [
    [
      'the mark on a trusted placeholder',
      TRUSTED,
      ({ placeholder }) => {
        placeholder.setAttribute(MARK, 'disabled');
      },
    ],
    [
      'a trusted element whose frame was replaced by a disabled placeholder',
      TRUSTED,
      ({ placeholder }) => {
        placeholder.replaceChildren();
        placeholder.setAttribute(MARK, 'disabled');
      },
    ],
    [
      'a disabled placeholder without its mark',
      DISABLED,
      ({ placeholder }) => {
        placeholder.removeAttribute(MARK);
      },
    ],
    [
      'a disabled tree whose stage lost its mark',
      DISABLED,
      ({ root }) => {
        stageOf(root).removeAttribute(MARK);
      },
    ],
    [
      'another value of the mark on the stage',
      DISABLED,
      ({ root }) => {
        stageOf(root).setAttribute(MARK, 'trusted');
      },
    ],
  ];

  it.each(mixed)(
    'refuses %s as not-mounted: the mount decides, not a placeholder',
    async (_, options, alter) => {
      const mounted = mountedWith(options);
      alter(mounted);
      const host = hostDouble(mounted.window);
      await expect(
        synchronizeCustomHtml(mounted.root, evaluateComposition(reference, 0), host.host),
      ).rejects.toMatchObject({ code: 'not-mounted' });
      expect(host.listeners()).toBe(0);
      expect(host.timersStarted()).toBe(0);
    },
  );
});
