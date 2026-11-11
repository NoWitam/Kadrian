/**
 * Elements whose opacity a render can set below 1 (D22.9): the mount gives
 * each of them `will-change: opacity`, decided from the document alone, and no
 * render writes or removes it. Every node but a background carries it; so do
 * the scenes that a fading scene transition joins, and the fragments and
 * caption pieces whose tracks can take the opacity below 1. Every element that
 * renders write two different opacities on, over the frames of a fixture,
 * carries it from the mount on, in any order of renders. That it makes the
 * pixels independent of the renders before is measured in pinned Chromium
 * (`tests/pinned/opacity-history.pinned.test.ts`).
 */
import { evaluateComposition } from '@kadrion/runtime';
import { frameCount, frameToTimeUs, type ValidatedComposition } from '@kadrion/schema';
import {
  captionsComposition,
  captionsMotionComposition,
  clipTransitionsComposition,
  compositingComposition,
  customHtmlComposition,
  easingComposition,
  effectsComposition,
  effectsSvgComposition,
  elementsComposition,
  focusComposition,
  motionComposition,
  nestedComposition,
  referenceComposition,
  shapesComposition,
  svgComposition,
  textComposition,
  transitionsComposition,
  videoComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { mountComposition, renderState } from '../src/index.js';
import { transitionFades } from '../src/mount.js';
import { createRoot, shuffled, TRUSTED, validated } from './support.js';

const FIXTURES: readonly (readonly [string, unknown])[] = [
  ['reference', referenceComposition],
  ['transitions', transitionsComposition],
  ['clip-transitions', clipTransitionsComposition],
  ['captions', captionsComposition],
  ['captions-motion', captionsMotionComposition],
  ['text', textComposition],
  ['easing', easingComposition],
  ['motion', motionComposition],
  ['effects', effectsComposition],
  ['effects-svg', effectsSvgComposition],
  ['shapes', shapesComposition],
  ['svg', svgComposition],
  ['compositing', compositingComposition],
  ['nested', nestedComposition],
  ['elements', elementsComposition],
  ['custom-html', customHtmlComposition],
  ['focus', focusComposition],
  ['video', videoComposition],
];

/**
 * Every asset of the document has a URL; the renderer reads none of them in
 * jsdom. A font is a `data:` URL, which Custom HTML for AI authors needs (D78).
 */
function urlsOf(document: ValidatedComposition): Record<string, string> {
  return Object.fromEntries(
    document.assets.map(({ id, type }) => [
      id,
      type === 'font' ? 'data:font/ttf;base64,AAAA' : `blob:kadrion/${id}`,
    ]),
  );
}

function mounted(document: ValidatedComposition): HTMLElement {
  const root = createRoot();
  mountComposition(root, document, urlsOf(document), TRUSTED);
  return root;
}

/** The elements whose opacity a render writes: scenes, nodes, fragments, and caption pieces. */
const WRITTEN_ON =
  '[data-kadrion-scene], [data-kadrion-node], [data-kadrion-fragment], [data-kadrion-caption-line], [data-kadrion-caption-word]';

function written(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(WRITTEN_ON)];
}

function varies(element: HTMLElement): boolean {
  return element.style.getPropertyValue('will-change') === 'opacity';
}

/** A readable name of an element of a mounted tree. */
function nameOf(element: HTMLElement): string {
  const attribute = [...element.attributes].find(({ name }) => name.startsWith('data-kadrion-'));
  return attribute === undefined ? element.tagName : `${attribute.name}=${attribute.value}`;
}

function grid(document: ValidatedComposition): number[] {
  return Array.from({ length: frameCount(document.durationUs, document.fps) }, (_, frame) =>
    frameToTimeUs(frame, document.fps),
  );
}

/**
 * Mounts a document and renders every frame of its grid in a shuffled order:
 * the elements marked at mount, and those that renders wrote two different
 * opacities on. Asserts on the way that no render writes or removes the mark.
 */
function opacities(input: unknown): { marked: HTMLElement[]; changing: HTMLElement[] } {
  const document = validated(input);
  const root = mounted(document);
  const elements = written(root);
  const marked = elements.filter(varies);
  const seen = new Map<HTMLElement, Set<string>>(elements.map((element) => [element, new Set()]));
  // Renders in an order that passes through every frame from both sides.
  for (const timeUs of shuffled(grid(document), 66)) {
    renderState(root, evaluateComposition(document, timeUs));
    // An opacity removed is that of a hidden scene or page, or of a scene
    // outside its transitions; only the values written count.
    for (const element of elements) {
      const opacity = element.style.getPropertyValue('opacity');
      if (opacity !== '') seen.get(element)?.add(opacity);
    }
    // Constant for the element's life: no render writes or removes it.
    expect(written(root).filter(varies)).toEqual(marked);
  }
  const changing = elements.filter((element) => (seen.get(element)?.size ?? 0) > 1);
  return { marked, changing };
}

describe('the elements whose opacity can change (D22.9)', () => {
  it.each(FIXTURES)(
    'marks every element of %s whose opacity changes on the grid, at mount and for good',
    (_, input) => {
      const { marked, changing } = opacities(input);
      expect(changing.filter((element) => !varies(element)).map(nameOf)).toEqual([]);
      for (const element of marked) {
        expect(element.style.getPropertyValue('will-change')).toBe('opacity');
      }
    },
  );

  // The premise of the check above: these fixtures change opacities of every kind of element.
  it('finds nodes, scenes, fragments, and caption pieces whose opacity changes', () => {
    const kinds = new Set(
      [
        transitionsComposition,
        clipTransitionsComposition,
        textComposition,
        captionsMotionComposition,
      ]
        .flatMap((input) => opacities(input).changing)
        .map((element) => nameOf(element).split('=')[0]),
    );
    expect([...kinds].sort()).toEqual([
      'data-kadrion-caption-word',
      'data-kadrion-fragment',
      'data-kadrion-node',
      'data-kadrion-scene',
    ]);
  });

  it('is the declaration of the mount, before any render', () => {
    const root = mounted(validated(referenceComposition));
    const title = root.querySelector<HTMLElement>('[data-kadrion-node="node-title"]');
    expect(title?.style.getPropertyValue('will-change')).toBe('opacity');
    expect(title?.style.getPropertyValue('opacity')).toBe('');
  });

  it('marks every node but a background, animated or not', () => {
    const marked = written(mounted(validated(referenceComposition)))
      .filter(varies)
      .map(nameOf);
    expect(marked).toEqual([
      'data-kadrion-node=node-group',
      'data-kadrion-node=node-image',
      'data-kadrion-node=node-caption',
      'data-kadrion-node=node-title',
      'data-kadrion-node=node-custom-html',
    ]);
    const root = mounted(validated(clipTransitionsComposition));
    for (const node of root.querySelectorAll<HTMLElement>('[data-kadrion-node]')) {
      const background = node.style.getPropertyValue('transform-origin') === '';
      expect(varies(node), nameOf(node)).toBe(!background);
    }
    // The frame of a clip transition carries no opacity, and no declaration of it.
    for (const frame of root.querySelectorAll<HTMLElement>('[data-kadrion-clip-frame]')) {
      expect(varies(frame)).toBe(false);
    }
  });

  it('marks the sides of scene transitions that fade, and not those that only move or cut', () => {
    const scene = (root: Element, id: string): HTMLElement =>
      root.querySelector<HTMLElement>(`[data-kadrion-scene="${id}"]`) as HTMLElement;
    const transitions = mounted(validated(transitionsComposition));
    // a → b crossfade, b → c fade through a colour, c → d slide, d → e wipe.
    for (const [id, expected] of [
      ['scene-a', true],
      ['scene-b', true],
      ['scene-c', true],
      ['scene-d', false],
      ['scene-e', false],
    ] as const) {
      expect(varies(scene(transitions, id)), id).toBe(expected);
    }
    const clips = mounted(validated(clipTransitionsComposition));
    // up → down push, down → group zoom, group → end iris.
    for (const [id, expected] of [
      ['scene-up', false],
      ['scene-down', true],
      ['scene-group', true],
      ['scene-end', false],
    ] as const) {
      expect(varies(scene(clips, id)), id).toBe(expected);
    }
  });

  it('marks the fragments of a unit whose tracks reach the opacity, and no other (D69)', () => {
    const root = mounted(validated(textComposition));
    const fragments = (node: string, unit: string): HTMLElement[] => [
      ...root.querySelectorAll<HTMLElement>(
        `[data-kadrion-node="${node}"] [data-kadrion-fragment="${unit}"]`,
      ),
    ];
    const all = (node: string, unit: string): boolean[] => fragments(node, unit).map(varies);
    // node-letters: letters by opacity and offset; node-words: words by scale and
    // rotation; node-lines: lines by opacity and offset; node-accent: letters by
    // colour and offset, words by rotation and opacity.
    expect(new Set(all('node-letters', 'letter'))).toEqual(new Set([true]));
    expect(new Set(all('node-words', 'word'))).toEqual(new Set([false]));
    expect(new Set(all('node-lines', 'line'))).toEqual(new Set([true]));
    expect(new Set(all('node-accent', 'letter'))).toEqual(new Set([false]));
    expect(new Set(all('node-accent', 'word'))).toEqual(new Set([true]));
    // The element of the text is a node, which every render writes an opacity on.
    for (const node of ['node-letters', 'node-words', 'node-lines', 'node-accent']) {
      const element = root.querySelector<HTMLElement>(`[data-kadrion-node="${node}"]`);
      expect(varies(element as HTMLElement), node).toBe(true);
    }
  });

  it('marks the lines and words of captions whose entrance, exit, or highlight reach the opacity (D70)', () => {
    const root = mounted(validated(captionsMotionComposition));
    const pieces = (node: string, attribute: string): Set<boolean> =>
      new Set(
        [...root.querySelectorAll<HTMLElement>(`[data-kadrion-node="${node}"] [${attribute}]`)].map(
          varies,
        ),
      );
    // captions-pop: words enter and leave by opacity and offset; captions-bounce:
    // lines enter by scale and colour, and the highlight moves by offset and rotation.
    expect(pieces('captions-pop', 'data-kadrion-caption-word')).toEqual(new Set([true]));
    expect(pieces('captions-pop', 'data-kadrion-caption-line')).toEqual(new Set([false]));
    expect(pieces('captions-bounce', 'data-kadrion-caption-word')).toEqual(new Set([false]));
    expect(pieces('captions-bounce', 'data-kadrion-caption-line')).toEqual(new Set([false]));
  });

  it('marks the words of captions whose highlight alone reaches the opacity (D70)', () => {
    const draft = structuredClone(captionsMotionComposition) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const node = draft.scenes[0]?.nodes.find((item) => item['id'] === 'captions-bounce') as {
      style: { highlight: { tracks: unknown[] } };
    };
    const linear = { kind: 'linear' };
    node.style.highlight.tracks = [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 0.5, easing: linear },
          { timeUs: 100_000, value: 1, easing: linear },
        ],
      },
    ];
    const root = mounted(validated(draft));
    const words = [
      ...root.querySelectorAll<HTMLElement>(
        '[data-kadrion-node="captions-bounce"] [data-kadrion-caption-word]',
      ),
    ];
    expect(words.length).toBeGreaterThan(0);
    expect(new Set(words.map(varies))).toEqual(new Set([true]));
  });

  it('marks no fragment and no caption piece whose opacity tracks keep every keyframe at 1', () => {
    const linear = { kind: 'linear' };
    const stillOpacity = {
      property: 'opacity',
      keyframes: [
        { timeUs: 0, value: 1, easing: { kind: 'ease-in-out' } },
        { timeUs: 300_000, value: 1, easing: linear },
      ],
    };
    const text = structuredClone(textComposition) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    for (const node of text.scenes[0]?.nodes ?? []) {
      const animations = node['textAnimations'] as { tracks: { property: string }[] }[] | undefined;
      for (const animation of animations ?? []) {
        animation.tracks = animation.tracks.map((track) =>
          track.property === 'opacity' ? stillOpacity : track,
        );
      }
    }
    const captions = structuredClone(captionsMotionComposition) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    for (const node of captions.scenes[0]?.nodes ?? []) {
      const style = node['style'] as
        Record<string, { kind?: string; tracks?: { property: string }[] }> | undefined;
      for (const key of ['pageIn', 'pageOut', 'highlight']) {
        const animation = style?.[key];
        if (animation?.tracks !== undefined) {
          animation.tracks = animation.tracks.map((track) =>
            track.property === 'opacity' ? stillOpacity : track,
          );
        }
      }
    }
    for (const input of [text, captions]) {
      const root = mounted(validated(input));
      const marked = [
        ...root.querySelectorAll<HTMLElement>(
          '[data-kadrion-fragment], [data-kadrion-caption-line], [data-kadrion-caption-word]',
        ),
      ].filter(varies);
      expect(marked.map(nameOf)).toEqual([]);
    }
  });

  it('classifies every effect of a transition as the runtime applies it (D56, D66)', () => {
    const fading = ['crossfade', 'fade-through-color', 'zoom', 'blur-dissolve'];
    const moving = ['slide', 'wipe', 'push', 'iris'];
    for (const kind of fading) {
      expect(transitionFades({ kind } as Parameters<typeof transitionFades>[0]), kind).toBe(true);
    }
    for (const kind of moving) {
      expect(transitionFades({ kind } as Parameters<typeof transitionFades>[0]), kind).toBe(false);
    }
  });
});
