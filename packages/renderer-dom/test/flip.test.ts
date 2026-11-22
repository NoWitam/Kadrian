/**
 * The flip of a node in the rendered tree (D89.3): the transform list ends
 * with the mirror of the node's box, in per cent of the element's own box for
 * its element and in pixels of its box for a matte inside its mask, and
 * nothing is written without a flip, so a document of 0.26 writes the
 * transform it wrote before. What a browser paints for it is measured in the
 * pinned environment (`tests/pinned/flip.pinned.test.ts`); here the strings
 * are checked.
 */
import { evaluateComposition, type ShapeNodeState } from '@kadrion/runtime';
import { compositingComposition, referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssTransform } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { MASKS_ATTRIBUTE, matteId, svgTransform } from '../src/masks.js';
import { createRoot, elementOf, referenceUrls, TRUSTED, validated } from './support.js';

const NO_FLIP = { x: false, y: false } as const;
const base = {
  position: { x: 3, y: 4 },
  scale: { x: 2, y: 0.5 },
  rotation: 0,
  origin: { x: 0, y: 0 },
  opacity: 1,
};

describe('the flip at the end of the transform list (D89.3)', () => {
  it.each([
    [{ x: true, y: false }, 'translate(100%, 0px) scale(-1, 1)'],
    [{ x: false, y: true }, 'translate(0px, 100%) scale(1, -1)'],
    [{ x: true, y: true }, 'translate(100%, 100%) scale(-1, -1)'],
  ])('ends the list of a node flipped %o with the mirror of its box', (flip, mirror) => {
    expect(cssTransform({ ...base, flip })).toBe(`translate(3px, 4px) scale(2, 0.5) ${mirror}`);
  });

  it('writes nothing for no flip: the list of 0.26, the same string as before', () => {
    expect(cssTransform({ ...base, flip: NO_FLIP })).toBe('translate(3px, 4px) scale(2, 0.5)');
    expect(cssTransform({ ...base, rotation: 30, origin: { x: 250, y: 750 }, flip: NO_FLIP })).toBe(
      'translate(3px, 4px) translate(25%, 75%) rotate(30deg) scale(2, 0.5) translate(-25%, -75%)',
    );
  });

  it('mirrors before the pivot, the rotation, and the scale, which CSS applies after it', () => {
    expect(
      cssTransform({
        ...base,
        rotation: 30,
        origin: { x: 250, y: 750 },
        flip: { x: true, y: false },
      }),
    ).toBe(
      'translate(3px, 4px) translate(25%, 75%) rotate(30deg) scale(2, 0.5) translate(-25%, -75%) translate(100%, 0px) scale(-1, 1)',
    );
  });
});

describe('the flip of a matte inside its mask (D75, D89.3)', () => {
  const matte = (flip: { x: boolean; y: boolean }): ShapeNodeState =>
    ({
      ...base,
      rotation: -45,
      origin: { x: 500, y: 500 },
      size: { width: 150, height: 80 },
      flip,
    }) as unknown as ShapeNodeState;

  it.each([
    [{ x: true, y: false }, 'translate(150px, 0px) scale(-1, 1)'],
    [{ x: false, y: true }, 'translate(0px, 80px) scale(1, -1)'],
    [{ x: true, y: true }, 'translate(150px, 80px) scale(-1, -1)'],
  ])(
    'ends the transform of a matte flipped %o with the mirror of its box in pixels',
    (flip, mirror) => {
      expect(svgTransform(matte(flip))).toBe(
        `translate(3px, 4px) translate(75px, 40px) rotate(-45deg) scale(2, 0.5) translate(-75px, -40px) ${mirror}`,
      );
    },
  );

  it('writes nothing for a matte without a flip', () => {
    expect(svgTransform(matte(NO_FLIP))).toBe(
      'translate(3px, 4px) translate(75px, 40px) rotate(-45deg) scale(2, 0.5) translate(-75px, -40px)',
    );
  });
});

type Draft = { scenes: { nodes: Record<string, unknown>[] }[] };

/** The composition of compositing with `flip` on the nodes named. */
function flipped(flips: Readonly<Record<string, { x: boolean; y: boolean }>>): unknown {
  const draft = structuredClone(compositingComposition) as Draft;
  for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
    const flip = flips[node['id'] as string];
    if (flip !== undefined) node['flip'] = flip;
  }
  return draft;
}

function rendered(document: unknown, timeUs: number): HTMLElement {
  const composition = validated(document);
  const root = createRoot();
  const urls = { 'asset-image': 'data:image/png,', 'asset-font': 'data:font/ttf,' };
  mountComposition(root, composition, urls, TRUSTED);
  renderState(root, evaluateComposition(composition, timeUs));
  return root;
}

function matteContent(root: HTMLElement, id: string): SVGElement {
  const content = root
    .querySelector(`[${MASKS_ATTRIBUTE}]`)
    ?.querySelector<SVGElement>(`mask[id="${matteId(id)}"] [data-kadrion-mask-content]`);
  if (content === null || content === undefined) throw new Error(`No matte of ${id}.`);
  return content;
}

describe('the flip in the rendered tree (D89.3)', () => {
  it('writes the flip of a node and of a matte, and nothing else changes', () => {
    const plain = rendered(compositingComposition, 1_000_000);
    const root = rendered(
      flipped({
        'mask-shape-photo': { x: true, y: false },
        'matte-gradient': { x: false, y: true },
      }),
      1_000_000,
    );
    const photo = elementOf(root, 'mask-shape-photo').style.getPropertyValue('transform');
    expect(photo).toBe(
      `${elementOf(plain, 'mask-shape-photo').style.getPropertyValue('transform')} translate(100%, 0px) scale(-1, 1)`,
    );
    const matte = matteContent(root, 'matte-luminance-photo').style.getPropertyValue('transform');
    expect(matte).toBe(
      `${matteContent(plain, 'matte-luminance-photo').style.getPropertyValue('transform')} translate(0px, 150px) scale(1, -1)`,
    );
    // Only those two strings differ, and the transform of the matte's own
    // element, which is hidden and holds the same flip in per cent.
    const strip = (html: string): string =>
      html
        .replace(' translate(100%, 0px) scale(-1, 1)', '')
        .replace(' translate(0px, 100%) scale(1, -1)', '')
        .replace(' translate(0px, 150px) scale(1, -1)', '');
    expect(elementOf(root, 'matte-gradient').style.getPropertyValue('transform')).toBe(
      `${elementOf(plain, 'matte-gradient').style.getPropertyValue('transform')} translate(0px, 100%) scale(1, -1)`,
    );
    expect(strip(root.innerHTML)).toBe(plain.innerHTML);
  });

  it('writes no flip for the reference composition, whose nodes the step to 0.27 gave none', () => {
    const composition = validated(referenceComposition);
    const root = createRoot();
    mountComposition(root, composition, referenceUrls, TRUSTED);
    renderState(root, evaluateComposition(composition, 5_000_000));
    const transforms = [...root.querySelectorAll<HTMLElement>('[data-kadrion-node]')].map(
      (element) => element.style.getPropertyValue('transform'),
    );
    expect(transforms.filter((transform) => transform !== '').length).toBeGreaterThan(3);
    expect(transforms.filter((transform) => /scale\((?:-1, |1, -1)/.test(transform))).toEqual([]);
  });
});
