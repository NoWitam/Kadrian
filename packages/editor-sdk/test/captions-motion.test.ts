/**
 * The commands of animated captions and of the safe area (D70): the highlight
 * replaced, a page's entrance or exit replaced, and the safe area replaced,
 * each in its place in the document, undone by its inverse to the exact text
 * before it, no edit when nothing changes, and refused when the document could
 * not hold the result.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { captionsMotionComposition, referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, parseCommand, type Command } from '../src/index.js';

import { codeOf, json, validated } from './support.js';

const document = validated(captionsMotionComposition);

interface StyleView {
  readonly highlight: Record<string, unknown>;
  readonly pageIn: Record<string, unknown>;
  readonly pageOut: Record<string, unknown>;
}

function styleOf(composition: unknown, id: string): StyleView {
  const scenes = (composition as { scenes: { nodes: { id: string; style: StyleView }[] }[] })
    .scenes;
  const node = scenes.flatMap((scene) => scene.nodes).find((item) => item.id === id);
  if (node === undefined) throw new Error(`No node "${id}".`);
  return node.style;
}

function roundTrip(from: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(from, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(from));
  return result.document;
}

const BOUNCE = [
  {
    property: 'offset',
    keyframes: [
      { timeUs: 0, value: { x: 0, y: 0 }, easing: { kind: 'linear' } },
      { timeUs: 100_000, value: { x: 0, y: -8 }, easing: { kind: 'linear' } },
    ],
  },
];

describe('SetCaptionHighlight (D70)', () => {
  it('replaces the highlight in its place in the style and is undone exactly', () => {
    const highlight = {
      color: '#00ff00',
      scale: 1.5,
      tracks: BOUNCE,
      underline: { kind: 'none' },
      box: { kind: 'solid', color: '#000000', opacity: 1, padding: 2, cornerRadius: 4 },
    };
    const edited = roundTrip(document, {
      type: 'SetCaptionHighlight',
      nodeId: 'captions-pop',
      highlight,
    });
    expect(styleOf(edited, 'captions-pop').highlight).toEqual(highlight);
    expect(Object.keys(styleOf(edited, 'captions-pop'))).toEqual(
      Object.keys(styleOf(document, 'captions-pop')),
    );
  });

  it('is no edit when the highlight is the same', () => {
    const { highlight } = styleOf(document, 'captions-bounce');
    const result = applyCommand(document, {
      type: 'SetCaptionHighlight',
      nodeId: 'captions-bounce',
      highlight,
    });
    expect(result.inverse).toBeNull();
    expect(json(result.document)).toBe(json(document));
  });

  it('refuses a highlight the document cannot hold, and a node that is not captions', () => {
    const { highlight } = styleOf(document, 'captions-pop');
    for (const broken of [
      { ...highlight, scale: -1 },
      { ...highlight, tracks: [...BOUNCE, ...BOUNCE] },
      { ...highlight, underline: { kind: 'solid', color: '#ffffff', thickness: 0, offset: 0 } },
      { color: '#ffffff' },
    ]) {
      expect(
        codeOf(() =>
          applyCommand(document, {
            type: 'SetCaptionHighlight',
            nodeId: 'captions-pop',
            highlight: broken,
          }),
        ),
      ).toBe('invalid-result');
    }
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionHighlight',
          nodeId: 'motion-background',
          highlight,
        }),
      ),
    ).toBe('unsupported-node');
  });
});

describe('SetCaptionPageAnimation (D70)', () => {
  const entrance = {
    kind: 'animate',
    unit: 'line',
    staggerUs: 100_000,
    order: { kind: 'random', seed: 7 },
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'linear' } },
          { timeUs: 300_000, value: 1, easing: { kind: 'linear' } },
        ],
      },
    ],
  };

  it('replaces the entrance, leaves the exit, and is undone exactly', () => {
    const edited = roundTrip(document, {
      type: 'SetCaptionPageAnimation',
      nodeId: 'captions-pop',
      phase: 'in',
      animation: entrance,
    });
    expect(styleOf(edited, 'captions-pop').pageIn).toEqual(entrance);
    expect(styleOf(edited, 'captions-pop').pageOut).toEqual(
      styleOf(document, 'captions-pop').pageOut,
    );
  });

  it('replaces the exit with none, and an inverse that brings it back', () => {
    const result = applyCommand(document, {
      type: 'SetCaptionPageAnimation',
      nodeId: 'captions-pop',
      phase: 'out',
      animation: { kind: 'none' },
    });
    expect(styleOf(result.document, 'captions-pop').pageOut).toEqual({ kind: 'none' });
    expect(result.inverse).toEqual({
      type: 'SetCaptionPageAnimation',
      nodeId: 'captions-pop',
      phase: 'out',
      animation: styleOf(document, 'captions-pop').pageOut,
    });
  });

  it('is no edit when the animation is the same', () => {
    const result = applyCommand(document, {
      type: 'SetCaptionPageAnimation',
      nodeId: 'captions-bounce',
      phase: 'out',
      animation: { kind: 'none' },
    });
    expect(result.inverse).toBeNull();
  });

  it('refuses letters, no tracks, a phase it does not know, and a node that is not captions', () => {
    for (const animation of [
      { ...entrance, unit: 'letter' },
      { ...entrance, tracks: [] },
      { ...entrance, staggerUs: -1 },
    ]) {
      expect(
        codeOf(() =>
          applyCommand(document, {
            type: 'SetCaptionPageAnimation',
            nodeId: 'captions-pop',
            phase: 'in',
            animation,
          }),
        ),
      ).toBe('invalid-result');
    }
    expect(
      codeOf(() =>
        parseCommand({
          type: 'SetCaptionPageAnimation',
          nodeId: 'captions-pop',
          phase: 'during',
          animation: entrance,
        }),
      ),
    ).toBe('invalid-argument');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionPageAnimation',
          nodeId: 'motion-background',
          phase: 'in',
          animation: entrance,
        }),
      ),
    ).toBe('unsupported-node');
  });
});

describe('SetSafeArea (D70)', () => {
  const reference = validated(referenceComposition);
  const safeArea = { fromTop: 120, fromRight: 60, fromBottom: 240, fromLeft: 60 };

  it('replaces the safe area in its place in the document and is undone exactly', () => {
    const edited = roundTrip(reference, { type: 'SetSafeArea', safeArea });
    expect((edited as unknown as { safeArea: unknown }).safeArea).toEqual(safeArea);
    expect(Object.keys(edited)).toEqual(Object.keys(reference));
  });

  it('is no edit when the safe area is the same', () => {
    const result = applyCommand(reference, {
      type: 'SetSafeArea',
      safeArea: { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 },
    });
    expect(result.inverse).toBeNull();
  });

  it('refuses a safe area that leaves no pixel, a negative inset, and a missing one', () => {
    for (const broken of [
      { ...safeArea, fromLeft: 540, fromRight: 540 },
      { ...safeArea, fromTop: 1000, fromBottom: 920 },
      { ...safeArea, fromTop: -1 },
      { fromTop: 0, fromRight: 0, fromBottom: 0 },
    ]) {
      expect(codeOf(() => applyCommand(reference, { type: 'SetSafeArea', safeArea: broken }))).toBe(
        'invalid-result',
      );
    }
  });
});
