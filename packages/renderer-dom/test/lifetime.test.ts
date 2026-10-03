/**
 * The lifetime of a node in the rendered tree (D42.4): an inactive node gets
 * `visibility: hidden`, an active one carries no `visibility` declaration at
 * all, on every call and with no memory of an earlier one. The expectations of
 * the lifetime fixture are hand-derived. What a browser paints for a hidden
 * element is measured in the pinned environment (D42.6); here the declarations
 * are checked, and inheritance is computed as CSS defines it.
 */
import { evaluateComposition, type CompositionState } from '@kadrion/runtime';
import { lifetimeComposition, lifetimeExpected } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState, synchronizeCustomHtml } from '../src/index.js';
import { elementDouble, hostDouble, REQUEST_ID, settledState } from './elements.js';
import {
  createRoot,
  createWindow,
  describeRoot,
  draftNode,
  elementOf,
  elementsOf,
  reference,
  referenceUrls,
  shuffled,
  TRUSTED,
  validated,
  type Draft,
} from './support.js';

const lifetimes = validated(lifetimeComposition);
const NODES = [
  'life-background',
  'life-group',
  'life-child-always',
  'life-child-late',
  'life-text',
  'life-never',
  'life-html',
];

/** The fixture has one asset, the font of the reference composition. */
const urls = { 'asset-font': referenceUrls['asset-font'] ?? '' };

function mounted(root: HTMLElement = createRoot()): HTMLElement {
  mountComposition(root, lifetimes, urls, TRUSTED);
  return root;
}

function at(timeUs: number): CompositionState {
  return evaluateComposition(lifetimes, timeUs);
}

/** The `visibility` an element declares itself: `hidden`, or nothing. */
function declared(root: Element, id: string): string {
  return elementOf(root, id).style.getPropertyValue('visibility');
}

/**
 * Whether a node is shown, as CSS decides it: `visibility` inherits, so an
 * element is hidden when it, or its nearest ancestor that declares the property,
 * says `hidden`. The renderer never declares `visible`, which a test below pins.
 */
function shown(root: Element, id: string): boolean {
  for (let element: Element | null = elementOf(root, id); element !== null;) {
    const value = (element as HTMLElement).style.getPropertyValue('visibility');
    if (value !== '') return value !== 'hidden';
    element = element === root ? null : element.parentElement;
  }
  return true;
}

describe('the lifetime fixture at its boundaries (D42.4)', () => {
  it.each(lifetimeExpected.times)(
    'hides exactly the inactive nodes at $timeUs, and shows what CSS then shows',
    ({ timeUs, active, shown: expected }) => {
      const root = mounted();
      renderState(root, at(timeUs));
      expect(NODES.filter((id) => declared(root, id) === '')).toEqual(active);
      expect(NODES.filter((id) => declared(root, id) === 'hidden')).toEqual(
        NODES.filter((id) => !active.includes(id)),
      );
      expect(NODES.filter((id) => shown(root, id))).toEqual(expected);
    },
  );

  it('hides the children of an inactive group although they declare nothing', () => {
    const root = mounted();
    renderState(root, at(5_000_000));
    expect(declared(root, 'life-group')).toBe('hidden');
    expect(declared(root, 'life-child-always')).toBe('');
    expect(declared(root, 'life-child-late')).toBe('');
    expect(shown(root, 'life-child-always')).toBe(false);
    expect(shown(root, 'life-child-late')).toBe(false);
  });

  it('hides an inactive background alone: the stage, the scene, and its siblings declare nothing', () => {
    const root = mounted();
    renderState(root, at(9_000_000));
    expect(declared(root, 'life-background')).toBe('hidden');
    const stage = root.firstElementChild as HTMLElement;
    const scene = stage.firstElementChild as HTMLElement;
    expect(stage.style.getPropertyValue('visibility')).toBe('');
    expect(scene.style.getPropertyValue('visibility')).toBe('');
    expect(shown(root, 'life-text')).toBe(true);
  });

  it('never declares visible, which would show a child of a hidden group', () => {
    const root = mounted();
    for (const { timeUs } of lifetimeExpected.times) {
      renderState(root, at(timeUs));
      const values = [root, ...elementsOf(root)].map((element) =>
        (element as HTMLElement).style.getPropertyValue('visibility'),
      );
      expect(new Set(values).has('visible'), String(timeUs)).toBe(false);
    }
  });

  it('writes the transform and the opacity of an inactive node like any other', () => {
    const root = mounted();
    renderState(root, at(0));
    const text = elementOf(root, 'life-text');
    expect(declared(root, 'life-text')).toBe('hidden');
    expect(text.style.getPropertyValue('transform')).toBe('translate(20px, 120px) scale(1, 1)');
    expect(text.style.getPropertyValue('opacity')).toBe('1');
    // The background has a lifetime and still no transform.
    expect(elementOf(root, 'life-background').style.getPropertyValue('transform')).toBe('');
  });
});

describe('no memory between renders (D22.4, D42.4)', () => {
  const times = lifetimeExpected.times.map(({ timeUs }) => timeUs);
  const fresh = new Map(
    times.map((timeUs) => {
      const root = mounted();
      renderState(root, at(timeUs));
      return [timeUs, JSON.stringify(describeRoot(root))];
    }),
  );

  it.each([
    ['ascending', times],
    ['descending', [...times].reverse()],
    ['shuffled', shuffled(times, 20_261_002)],
  ])('yields the tree of a fresh mount in %s order', (_, order) => {
    const root = mounted();
    for (const timeUs of order) {
      renderState(root, at(timeUs));
      expect(JSON.stringify(describeRoot(root)), String(timeUs)).toBe(fresh.get(timeUs));
    }
  });

  it('removes the declaration when a node becomes active again', () => {
    const root = mounted();
    renderState(root, at(0));
    expect(declared(root, 'life-background')).toBe('hidden');
    renderState(root, at(1_000_000));
    expect(declared(root, 'life-background')).toBe('');
    expect(elementOf(root, 'life-background').getAttribute('style')).not.toContain('visibility');
  });

  it('restores a declaration that something else changed in between', () => {
    const root = mounted();
    renderState(root, at(0));
    elementOf(root, 'life-background').style.removeProperty('visibility');
    elementOf(root, 'life-html').style.setProperty('visibility', 'hidden');
    renderState(root, at(0));
    expect(declared(root, 'life-background')).toBe('hidden');
    expect(declared(root, 'life-html')).toBe('');
  });
});

describe('a document whose nodes are all active (D42.4)', () => {
  it('gets no visibility declaration anywhere, at any time', () => {
    const root = createRoot();
    mountComposition(root, reference, referenceUrls, TRUSTED);
    for (const timeUs of [0, 2_500_000, 9_999_999]) {
      renderState(root, evaluateComposition(reference, timeUs));
      for (const element of elementsOf(root)) {
        expect(element.getAttribute('style') ?? '').not.toContain('visibility');
      }
    }
  });
});

describe('a state that does not fit the mounted tree (D22.4, D42.4)', () => {
  it('writes no visibility before the structure is checked', () => {
    const root = mounted();
    renderState(root, at(4_000_000));
    const before = JSON.stringify(describeRoot(root));
    // The same document with its last node renamed, at a time where the first
    // nodes would change their visibility: nothing may be written.
    const draft = structuredClone(lifetimeComposition) as Draft;
    draftNode(draft, 'life-html').id = 'life-other';
    const other = evaluateComposition(validated(draft), 0);
    expect(() => {
      renderState(root, other);
    }).toThrow(expect.objectContaining({ name: 'RenderError', code: 'state-mismatch' }));
    expect(JSON.stringify(describeRoot(root))).toBe(before);
  });

  it('writes nothing when the mismatch is a child of a group, after nodes whose visibility would change', () => {
    // The tree shows 4 000 000, where the background, the group, and both
    // children are active and declare nothing. The state is of 0, where the
    // background and the group are inactive, for a document whose last child
    // of the group has another ID. The background and the group come before
    // that child in document order: a renderer that wrote a visibility while it
    // walked the tree would have hidden them before it found the mismatch.
    const root = mounted();
    renderState(root, at(4_000_000));
    const before = JSON.stringify(describeRoot(root));
    const styles = NODES.map((id) => elementOf(root, id).getAttribute('style'));
    expect(declared(root, 'life-background')).toBe('');
    expect(declared(root, 'life-group')).toBe('');
    const draft = structuredClone(lifetimeComposition) as Draft;
    draftNode(draft, 'life-child-late').id = 'life-child-other';
    const other = evaluateComposition(validated(draft), 0);
    // The premise: this state would hide the background and the group.
    expect(other.scenes[0]?.nodes.slice(0, 2).map(({ active }) => active)).toEqual([false, false]);
    expect(() => {
      renderState(root, other);
    }).toThrow(expect.objectContaining({ name: 'RenderError', code: 'state-mismatch' }));
    expect(JSON.stringify(describeRoot(root))).toBe(before);
    expect(NODES.map((id) => elementOf(root, id).getAttribute('style'))).toEqual(styles);
    expect(declared(root, 'life-background')).toBe('');
    expect(declared(root, 'life-group')).toBe('');
  });
});

describe('an inactive Custom HTML element (D23.4, D42.4)', () => {
  it('is hidden with its frame, and still receives and must acknowledge every time', async () => {
    const window = createWindow();
    const root = mounted(createRoot(window));
    const element = elementDouble(window, root, 'life-html');
    const host = hostDouble(window);
    const state = at(5_000_000);
    renderState(root, state);
    expect(declared(root, 'life-html')).toBe('hidden');
    expect(shown(root, 'life-html')).toBe(false);
    const pending = synchronizeCustomHtml(root, state, host.host);
    const message = {
      type: 'kadrion:time',
      version: 1,
      instanceId: 'life-html',
      requestId: REQUEST_ID,
      timeUs: 5_000_000,
    };
    expect(element.posted).toEqual([{ message, targetOrigin: '*' }]);
    expect(await settledState(pending)).toBe('pending');
    element.answer({ ...message, type: 'kadrion:time-ack' });
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when the inactive element does not acknowledge', async () => {
    const window = createWindow();
    const root = mounted(createRoot(window));
    elementDouble(window, root, 'life-html');
    const host = hostDouble(window);
    const state = at(5_000_000);
    renderState(root, state);
    const pending = synchronizeCustomHtml(root, state, host.host);
    host.expire();
    await expect(pending).rejects.toMatchObject({ code: 'custom-html-timeout' });
  });
});
