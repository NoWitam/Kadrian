/**
 * The commands of D68 — `SetNodeRotation`, `SetNodeOrigin`, `SetNodeCrop`,
 * `SetNodeCornerRadius`, and `SetKeyframeValue` — through `applyCommand`. Each
 * sets a base value or a keyframe, normalises it as its field requires,
 * compares for a no-op after the normalisation, refuses a node without the
 * field, and returns an inverse that restores the bytes. The expected values
 * are written out by hand from the reference composition.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, type Command } from '../src/index.js';

import { codeOf, json, nodeOf, reference } from './support.js';

const BACKGROUND = 'node-background';
const TITLE = 'node-title';
const IMAGE = 'node-image';
const GROUP = 'node-group';

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

/** Applies a command and its inverse; returns the edited document after checking the bytes come back. */
function roundTrip(command: Command, document: unknown = reference()): unknown {
  const before = json(document);
  const result = applyCommand(document as ReturnType<typeof reference>, command);
  const inverse = result.inverse;
  if (inverse === null) throw new Error('The command changed nothing.');
  expect(json(applyCommand(result.document, inverse).document)).toBe(before);
  return result.document;
}

function apply(command: unknown, document: unknown = reference()): unknown {
  return applyCommand(document as ReturnType<typeof reference>, command as Command).document;
}

/** The reference with an animation of `property` on the image, from 0 to 1 000 000. */
function withAnimation(property: string, first: unknown, last: unknown, nodeId = IMAGE): unknown {
  return apply({
    type: 'AddAnimation',
    nodeId,
    index: 0,
    animation: {
      id: `anim-${property}`,
      property,
      keyframes: [
        { timeUs: 0, value: first, easing: { kind: 'ease-in' } },
        { timeUs: 1_000_000, value: last, easing: { kind: 'linear' } },
      ],
    },
  });
}

function keyframesOf(document: unknown, nodeId: string, animationId: string): unknown {
  const animations = fieldOf(document, nodeId, 'animations') as {
    id: string;
    keyframes: unknown;
  }[];
  return animations.find(({ id }) => id === animationId)?.keyframes;
}

describe('SetNodeRotation (D68)', () => {
  it('sets the base rotation of any transformed node, and its inverse restores it', () => {
    for (const nodeId of [TITLE, IMAGE, GROUP]) {
      const document = roundTrip({ type: 'SetNodeRotation', nodeId, rotation: -12.5 });
      expect(fieldOf(document, nodeId, 'rotation')).toBe(-12.5);
    }
  });

  it('keeps several turns, and stores -0 as 0', () => {
    const turns = apply({ type: 'SetNodeRotation', nodeId: TITLE, rotation: 720 });
    expect(fieldOf(turns, TITLE, 'rotation')).toBe(720);
    const result = applyCommand(reference(), {
      type: 'SetNodeRotation',
      nodeId: TITLE,
      rotation: -0,
    });
    expect(result.inverse).toBeNull();
  });

  it.each([360_001, -360_001, Number.NaN, Number.POSITIVE_INFINITY, '15'])(
    'refuses %s with invalid-argument',
    (rotation) => {
      expect(codeOf(() => apply({ type: 'SetNodeRotation', nodeId: TITLE, rotation }))).toBe(
        'invalid-argument',
      );
    },
  );

  it('refuses the background, which has no rotation', () => {
    expect(codeOf(() => apply({ type: 'SetNodeRotation', nodeId: BACKGROUND, rotation: 10 }))).toBe(
      'unsupported-node',
    );
  });
});

describe('SetNodeOrigin (D68)', () => {
  it('moves the origin and nothing else: the position stays', () => {
    const document = roundTrip({
      type: 'SetNodeOrigin',
      nodeId: IMAGE,
      origin: { x: 500, y: 1000 },
    });
    expect(fieldOf(document, IMAGE, 'origin')).toEqual({ x: 500, y: 1000 });
    expect(fieldOf(document, IMAGE, 'position')).toEqual(fieldOf(reference(), IMAGE, 'position'));
  });

  it.each([{ x: 500.5, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1001 }, { x: 0 }, { x: 0, y: 0, z: 0 }])(
    'refuses %j with invalid-argument',
    (origin) => {
      expect(codeOf(() => apply({ type: 'SetNodeOrigin', nodeId: IMAGE, origin }))).toBe(
        'invalid-argument',
      );
    },
  );

  it('refuses the background', () => {
    expect(
      codeOf(() =>
        apply({ type: 'SetNodeOrigin', nodeId: BACKGROUND, origin: { x: 500, y: 500 } }),
      ),
    ).toBe('unsupported-node');
  });
});

describe('SetNodeCrop (D68)', () => {
  it('sets the crop of an image in its order of keys, and its inverse restores it', () => {
    const document = roundTrip({
      type: 'SetNodeCrop',
      nodeId: IMAGE,
      crop: { top: 100, right: 0, bottom: 250, left: 999 },
    });
    expect(JSON.stringify(fieldOf(document, IMAGE, 'crop'))).toBe(
      '{"top":100,"right":0,"bottom":250,"left":999}',
    );
  });

  it('refuses a crop that leaves nothing of the picture with invalid-result', () => {
    expect(
      codeOf(() =>
        apply({
          type: 'SetNodeCrop',
          nodeId: IMAGE,
          crop: { top: 500, right: 0, bottom: 500, left: 0 },
        }),
      ),
    ).toBe('invalid-result');
  });

  it.each([
    { top: 0.5, right: 0, bottom: 0, left: 0 },
    { top: 1001, right: 0, bottom: 0, left: 0 },
    { top: 0, right: 0, bottom: 0 },
  ])('refuses %j with invalid-argument', (crop) => {
    expect(codeOf(() => apply({ type: 'SetNodeCrop', nodeId: IMAGE, crop }))).toBe(
      'invalid-argument',
    );
  });

  it('refuses a node that is neither an image nor a video', () => {
    expect(
      codeOf(() =>
        apply({
          type: 'SetNodeCrop',
          nodeId: TITLE,
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
      ),
    ).toBe('unsupported-node');
  });
});

describe('SetNodeCornerRadius (D68)', () => {
  it('rounds the radius to whole pixels, half away from zero, like every pixel value', () => {
    const document = roundTrip({ type: 'SetNodeCornerRadius', nodeId: IMAGE, cornerRadius: 12.5 });
    expect(fieldOf(document, IMAGE, 'cornerRadius')).toBe(13);
    const same = applyCommand(reference(), {
      type: 'SetNodeCornerRadius',
      nodeId: IMAGE,
      cornerRadius: 0.4,
    });
    expect(same.inverse).toBeNull();
  });

  it('leaves the range to the document, and refuses a text', () => {
    expect(
      codeOf(() => apply({ type: 'SetNodeCornerRadius', nodeId: IMAGE, cornerRadius: -1 })),
    ).toBe('invalid-result');
    expect(
      codeOf(() => apply({ type: 'SetNodeCornerRadius', nodeId: IMAGE, cornerRadius: '4' })),
    ).toBe('invalid-argument');
    expect(
      codeOf(() => apply({ type: 'SetNodeCornerRadius', nodeId: TITLE, cornerRadius: 4 })),
    ).toBe('unsupported-node');
  });
});

describe('SetKeyframeValue (D65.2, D68)', () => {
  it('inserts a keyframe, with the easing before it, and its inverse removes it', () => {
    const document = withAnimation('rotation', 0, 90);
    const edited = roundTrip(
      { type: 'SetKeyframeValue', animationId: 'anim-rotation', timeUs: 500_000, value: 30 },
      document,
    );
    expect(keyframesOf(edited, IMAGE, 'anim-rotation')).toEqual([
      { timeUs: 0, value: 0, easing: { kind: 'ease-in' } },
      { timeUs: 500_000, value: 30, easing: { kind: 'ease-in' } },
      { timeUs: 1_000_000, value: 90, easing: { kind: 'linear' } },
    ]);
  });

  it('replaces the value of a keyframe and keeps its easing; the inverse puts the old value back', () => {
    const document = withAnimation(
      'size',
      { width: 400, height: 400 },
      { width: 200, height: 100 },
    );
    const edited = roundTrip(
      {
        type: 'SetKeyframeValue',
        animationId: 'anim-size',
        timeUs: 0,
        value: { width: 300.5, height: 250 },
      },
      document,
    );
    expect(keyframesOf(edited, IMAGE, 'anim-size')).toEqual([
      { timeUs: 0, value: { width: 301, height: 250 }, easing: { kind: 'ease-in' } },
      { timeUs: 1_000_000, value: { width: 200, height: 100 }, easing: { kind: 'linear' } },
    ]);
  });

  it('stores a colour in lower case, and treats the same colour in upper case as no change', () => {
    const document = withAnimation('color', '#ffffff', '#000000', TITLE);
    const result = applyCommand(document as ReturnType<typeof reference>, {
      type: 'SetKeyframeValue',
      animationId: 'anim-color',
      timeUs: 0,
      value: '#FFFFFF',
    });
    expect(result.inverse).toBeNull();
    const edited = apply(
      { type: 'SetKeyframeValue', animationId: 'anim-color', timeUs: 0, value: '#12B76A' },
      document,
    );
    expect(keyframesOf(edited, TITLE, 'anim-color')).toEqual([
      { timeUs: 0, value: '#12b76a', easing: { kind: 'ease-in' } },
      { timeUs: 1_000_000, value: '#000000', easing: { kind: 'linear' } },
    ]);
  });

  it.each([
    ['origin', { x: 0, y: 0 }, { x: 500.5, y: 0 }],
    ['crop', { top: 0, right: 0, bottom: 0, left: 0 }, { top: 0, right: 0, bottom: 0 }],
    ['rotation', 0, '90'],
    ['cornerRadius', 0, { value: 4 }],
  ] as const)(
    'refuses a %s value of the wrong shape with invalid-argument',
    (property, first, value) => {
      const document = withAnimation(property, first, first);
      expect(
        codeOf(() =>
          apply(
            { type: 'SetKeyframeValue', animationId: `anim-${property}`, timeUs: 0, value },
            document,
          ),
        ),
      ).toBe('invalid-argument');
    },
  );

  it('leaves the bounds to the document: a crop that leaves nothing is invalid-result', () => {
    const document = withAnimation(
      'crop',
      { top: 0, right: 0, bottom: 0, left: 0 },
      { top: 100, right: 0, bottom: 0, left: 0 },
    );
    expect(
      codeOf(() =>
        apply(
          {
            type: 'SetKeyframeValue',
            animationId: 'anim-crop',
            timeUs: 0,
            value: { top: 0, right: 600, bottom: 0, left: 400 },
          },
          document,
        ),
      ),
    ).toBe('invalid-result');
  });

  it.each(['anim-title-opacity', 'anim-group-position', 'anim-image-scale'])(
    'refuses %s, whose property has its own command, with use-typed-command',
    (animationId) => {
      expect(
        codeOf(() => apply({ type: 'SetKeyframeValue', animationId, timeUs: 0, value: 1 })),
      ).toBe('use-typed-command');
    },
  );

  it('refuses an unknown animation', () => {
    expect(
      codeOf(() =>
        apply({ type: 'SetKeyframeValue', animationId: 'anim-missing', timeUs: 0, value: 1 }),
      ),
    ).toBe('unknown-animation');
  });
});

describe('the animations a type of node takes (D68)', () => {
  it.each([
    ['a colour of the background', BACKGROUND, 'color', '#000000', '#ffffff', true],
    ['a colour of a text', TITLE, 'color', '#000000', '#ffffff', true],
    ['a size of a text', TITLE, 'size', { width: 1, height: 1 }, { width: 2, height: 2 }, false],
    ['a colour of the group', GROUP, 'color', '#000000', '#ffffff', false],
    ['a rotation of the group', GROUP, 'rotation', 0, 360, true],
    ['an opacity of the background', BACKGROUND, 'opacity', 0, 1, false],
  ] as const)('%s is %s', (_, nodeId, property, first, last, accepted) => {
    const run = (): unknown => withAnimation(property, first, last, nodeId);
    if (accepted) expect(() => run()).not.toThrow();
    else expect(codeOf(run)).toBe('invalid-result');
  });
});
