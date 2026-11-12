/**
 * Texts in frames, alignment, captions broken by width, and the outline and
 * the shadow of the spoken word in the rendered tree (D83, PR-66): the mount
 * needs the metrics of the fonts of measured nodes and keeps them on the
 * stage; a framed text is an element as large as its frame holding one
 * element per line where `frameLayout` puts it, drawn as measured; captions
 * broken by width place each line where `frameLayout` puts it; a text without
 * a frame writes `text-align` only for an alignment other than the left, so
 * that a document migrated from 0.24 mounts as it did; and `renderState`
 * writes the outline and the shadow of the highlight on the spoken word alone.
 * What a browser paints and how wide is measured in the pinned environment.
 */
import {
  EvaluationError,
  evaluateComposition,
  fontMetrics,
  frameLayout,
  type FontMetrics,
} from '@kadrion/runtime';
import type { CaptionsNode, TextNode, ValidatedComposition } from '@kadrion/schema';
import {
  framedTextComposition,
  generateProportionalFont,
  textComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { RenderError } from '../src/errors.js';
import {
  FONT_METRICS_ATTRIBUTE,
  keptFontMetrics,
  measureFonts,
  readFontMetrics,
} from '../src/fonts.js';
import { mountComposition, renderState } from '../src/index.js';
import { mountMeasured } from '../src/mount.js';
import { createRoot, draftNode, elementOf, TRUSTED, validated, type Draft } from './support.js';

const FONT_ID = 'asset-font-proportional';
const composition = validated(framedTextComposition);
const urls = { [FONT_ID]: 'data:font/ttf,' };
const METRICS = fontMetrics(generateProportionalFont());
const FONTS: ReadonlyMap<string, FontMetrics> = new Map([[FONT_ID, METRICS]]);

const nodes = composition.scenes.flatMap((scene) => scene.nodes);

/** A variant of `source`: clone, edit, validate. */
function variant(source: unknown, edit: (draft: Draft) => void): ValidatedComposition {
  const draft = structuredClone(source) as Draft;
  edit(draft);
  return validated(draft);
}

function nodeOf<Type extends 'text' | 'captions'>(
  id: string,
  type: Type,
): Extract<TextNode | CaptionsNode, { type: Type }> {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node?.type !== type) throw new Error(`No ${type} "${id}".`);
  return node as Extract<TextNode | CaptionsNode, { type: Type }>;
}

function mounted(): HTMLElement {
  const root = createRoot();
  mountMeasured(root, composition, urls, TRUSTED, FONTS);
  return root;
}

function rendered(timeUs: number): HTMLElement {
  const root = mounted();
  renderState(root, evaluateComposition(composition, timeUs, readFontMetrics(root)));
  return root;
}

const lines = (element: Element): HTMLElement[] => [
  ...element.querySelectorAll<HTMLElement>('[data-kadrion-text-line]'),
];

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action();
  } catch (error) {
    if (error instanceof EvaluationError || error instanceof RenderError) return error.code;
    throw error;
  }
  return undefined;
};

describe('the metrics of the fonts of measured nodes (D83.7)', () => {
  it('refuses to mount a measured node without them: font-metrics-missing', () => {
    expect(
      codeOf(() => {
        mountComposition(createRoot(), composition, urls, TRUSTED);
      }),
    ).toBe('font-metrics-missing');
    expect(codeOf(() => evaluateComposition(composition, 0))).toBe('font-metrics-missing');
  });

  it('keeps them on the stage and reads them back as they were, so every evaluation is the same', () => {
    const root = mounted();
    expect(root.firstElementChild?.hasAttribute(FONT_METRICS_ATTRIBUTE)).toBe(true);
    const read = readFontMetrics(root);
    const kept = read.get(FONT_ID);
    expect(kept?.unitsPerEm).toBe(METRICS.unitsPerEm);
    expect(kept?.notdefAdvance).toBe(METRICS.notdefAdvance);
    expect([...(kept?.advances ?? [])]).toEqual([...METRICS.advances]);
    for (const timeUs of [0, 500_000, 1_500_000, 1_966_666]) {
      expect(JSON.stringify(evaluateComposition(composition, timeUs, read))).toBe(
        JSON.stringify(evaluateComposition(composition, timeUs, FONTS)),
      );
    }
  });

  it('keeps nothing for a document without a measured node, which mounts as before', () => {
    const plain = validated(textComposition);
    expect(measureFonts(plain, new Map()).size).toBe(0);
    expect(keptFontMetrics(new Map())).toBeNull();
    const root = createRoot();
    mountComposition(root, plain, { 'asset-font': 'data:font/ttf,' }, TRUSTED);
    expect(root.firstElementChild?.hasAttribute(FONT_METRICS_ATTRIBUTE)).toBe(false);
    expect(readFontMetrics(root).size).toBe(0);
  });

  it('measures the bytes of every font a measured node uses, and refuses bytes it cannot read', () => {
    const font = generateProportionalFont();
    const bytes = new Map([[FONT_ID, font.slice().buffer]]);
    expect([...measureFonts(composition, bytes).keys()]).toEqual([FONT_ID]);
    const woff = font.slice();
    woff.set([0x77, 0x4f, 0x46, 0x46], 0);
    expect(codeOf(() => measureFonts(composition, new Map([[FONT_ID, woff.buffer]])))).toBe(
      'font-unmeasurable',
    );
  });
});

describe('a text with a frame (D83.3 to D83.6)', () => {
  it('is an element as large as its frame, one element per line where frameLayout puts it', () => {
    const root = rendered(1_700_000);
    for (const id of ['text-long-word', 'text-too-many-lines', 'text-outlined-lines']) {
      const node = nodeOf(id, 'text');
      if (node.frame.kind !== 'fixed') throw new Error('No frame.');
      const element = elementOf(root, id);
      expect(element.style.getPropertyValue('width')).toBe(`${String(node.frame.width)}px`);
      expect(element.style.getPropertyValue('height')).toBe(`${String(node.frame.height)}px`);
      const layout = frameLayout(node, METRICS);
      const drawn = lines(element);
      expect(drawn.map((line) => line.textContent)).toEqual(layout.lines.map(({ text }) => text));
      drawn.forEach((line, index) => {
        const placed = layout.lines[index];
        expect(line.getAttribute('data-kadrion-text-line')).toBe(String(index));
        expect(line.style.getPropertyValue('position')).toBe('absolute');
        expect(line.style.getPropertyValue('left')).toBe(`${String(placed?.x)}px`);
        expect(line.style.getPropertyValue('top')).toBe(`${String(placed?.y)}px`);
        expect(line.style.getPropertyValue('white-space')).toBe('pre');
        expect(line.style.getPropertyValue('font-kerning')).toBe('none');
        expect(line.style.getPropertyValue('font-variant-ligatures')).toBe('none');
      });
    }
  });

  it('lets a word wider than the frame and a block taller than it overflow, on the side the alignment leaves free', () => {
    const root = rendered(1_700_000);
    const wide = lines(elementOf(root, 'text-long-word'))[0];
    expect(parseFloat(wide?.style.getPropertyValue('left') ?? '')).toBeLessThan(0);
    const tall = lines(elementOf(root, 'text-too-many-lines'))[0];
    expect(parseFloat(tall?.style.getPropertyValue('top') ?? '')).toBeLessThan(0);
  });

  it('puts the box behind the block of lines, as wide as its widest line, in every alignment', () => {
    const root = rendered(500_000);
    for (const id of nodes.filter((node) => node.id.startsWith('text-')).map(({ id }) => id)) {
      const node = nodes.find((candidate) => candidate.id === id);
      if (node?.type !== 'text' || node.frame.kind !== 'fixed') continue;
      if (node.style.box.kind !== 'solid') continue;
      const { padding } = node.style.box;
      const layout = frameLayout(node, METRICS);
      const box = elementOf(root, id).querySelector<HTMLElement>('[data-kadrion-text-box]');
      const widest = Math.max(...layout.lines.map(({ width }) => width));
      const left = Math.min(...layout.lines.map(({ x }) => x));
      expect(box?.style.getPropertyValue('left'), id).toBe(`${String(left - padding)}px`);
      expect(box?.style.getPropertyValue('top'), id).toBe(
        `${String((layout.lines[0]?.y ?? 0) - padding)}px`,
      );
      expect(box?.style.getPropertyValue('width'), id).toBe(`${String(widest + 2 * padding)}px`);
      expect(box?.style.getPropertyValue('height'), id).toBe(
        `${String(layout.height + 2 * padding)}px`,
      );
    }
  });

  it('draws the fragments of an entrance by line inside the line they belong to', () => {
    const root = rendered(1_100_000);
    const drawn = lines(elementOf(root, 'text-outlined-lines'));
    expect(drawn).toHaveLength(3);
    for (const line of drawn) {
      const fragments = line.querySelectorAll('[data-kadrion-fragment="line"]');
      expect(fragments).toHaveLength(1);
      expect(fragments[0]?.textContent).toBe(line.textContent);
    }
  });
});

describe('the alignment of a text without a frame (D83.4)', () => {
  it('writes text-align for the centre and the right, and nothing for the left, as 0.24 drew it', () => {
    const root = rendered(1_700_000);
    const centred = elementOf(root, 'text-no-frame');
    expect(centred.style.getPropertyValue('text-align')).toBe('center');
    expect(lines(centred)).toEqual([]);
    const plain = validated(textComposition);
    const other = createRoot();
    mountComposition(other, plain, { 'asset-font': 'data:font/ttf,' }, TRUSTED);
    for (const node of plain.scenes.flatMap((scene) => scene.nodes)) {
      if (node.type !== 'text') continue;
      expect(elementOf(other, node.id).style.getPropertyValue('text-align')).toBe('');
    }
    const right = variant(textComposition, (draft) => {
      const node = draftNode(draft, 'node-lines');
      if (node.type === 'text') node.style.align = 'right';
    });
    const third = createRoot();
    mountComposition(third, right, { 'asset-font': 'data:font/ttf,' }, TRUSTED);
    expect(elementOf(third, 'node-lines').style.getPropertyValue('text-align')).toBe('right');
  });
});

describe('captions broken by width (D83.5)', () => {
  it('places every line of every page where frameLayout puts it, each measured from the font', () => {
    const node = nodeOf('captions-width', 'captions');
    const layout = frameLayout(node, METRICS);
    const drawn = lines(elementOf(mounted(), 'captions-width'));
    expect(drawn.map((line) => line.textContent)).toEqual(layout.lines.map(({ text }) => text));
    drawn.forEach((line, index) => {
      expect(line.getAttribute('data-kadrion-text-line')).toBe(String(index));
      expect(line.style.getPropertyValue('margin-left')).toBe(
        `${String(layout.lines[index]?.x)}px`,
      );
      expect(line.style.getPropertyValue('text-align')).toBe('left');
      expect(line.style.getPropertyValue('font-kerning')).toBe('none');
    });
    // Two pages: the width breaks the words elsewhere than their characters would.
    expect(
      elementOf(mounted(), 'captions-width').querySelectorAll('[data-kadrion-caption-page]'),
    ).toHaveLength(2);
  });

  it('measures nothing for captions broken by characters', () => {
    const characters = variant(framedTextComposition, (draft) => {
      const node = draftNode(draft, 'captions-width');
      if (node.type === 'captions') node.style.lineBreak = 'characters';
    });
    const root = createRoot();
    mountMeasured(root, characters, urls, TRUSTED, FONTS);
    const element = elementOf(root, 'captions-width');
    expect(lines(element)).toEqual([]);
    expect(element.querySelectorAll('[data-kadrion-caption-page]')).toHaveLength(1);
  });
});

describe('the outline and the shadow of the spoken word (D83.8)', () => {
  const words = (root: Element): HTMLElement[] => [
    ...elementOf(root, 'captions-width').querySelectorAll<HTMLElement>(
      '[data-kadrion-caption-word]',
    ),
  ];

  it('writes them on the spoken word alone, in place of the style’s, and takes them off again', () => {
    const root = mounted();
    for (const timeUs of [1_500_000, 1_966_666, 1_200_000]) {
      const state = evaluateComposition(composition, timeUs, FONTS);
      renderState(root, state);
      const captions = state.scenes[0]?.nodes.find(({ id }) => id === 'captions-width');
      const spoken = captions?.type === 'captions' ? captions.word : null;
      for (const word of words(root)) {
        const index = Number(word.getAttribute('data-kadrion-caption-word'));
        const lit = index === spoken;
        expect(word.style.getPropertyValue('-webkit-text-stroke-width') !== '', String(index)).toBe(
          lit,
        );
        expect(word.style.getPropertyValue('text-shadow') !== '', String(index)).toBe(lit);
        if (lit) expect(word.style.getPropertyValue('paint-order')).toBe('stroke');
      }
    }
  });

  it('writes nothing on any word for a highlight without them', () => {
    const plain = variant(framedTextComposition, (draft) => {
      const node = draftNode(draft, 'captions-width');
      if (node.type !== 'captions') return;
      node.style.highlight.stroke = { kind: 'none' };
      node.style.highlight.shadow = { kind: 'none' };
    });
    const root = createRoot();
    mountMeasured(root, plain, urls, TRUSTED, FONTS);
    renderState(root, evaluateComposition(plain, 1_500_000, FONTS));
    for (const word of words(root)) {
      expect(word.getAttribute('style') ?? '').not.toMatch(/stroke|shadow|paint-order/);
    }
  });
});
