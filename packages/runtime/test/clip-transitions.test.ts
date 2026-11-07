/**
 * Clip transitions of every kind and the new scene effects in the evaluated
 * state (D56, D66). The expectations are derived by hand from the clip
 * transitions fixture: a 640×360 frame; in `scene-up` (composition time 0) and
 * `scene-down` (4 600 000) clip `k` starts at 600 000·k and the transition
 * from clip `k` to clip `k + 1` takes 200 000 µs, with the kinds crossfade,
 * fade through `#fec84b`, slide left, wipe down, push up, zoom from 0.25, and
 * iris about (250 ‰, 700 ‰), in this order. In `scene-up` each incoming clip
 * lies above the outgoing one, in `scene-down` below it. The scene
 * transitions are a push left at 4 600 000, a zoom from 2 at 9 200 000, and an
 * iris about the centre at 10 200 000, of 400 000 µs each.
 */
import { clipTransitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition } from '../src/index.js';
import { stateNode, validated } from './support.js';

const document = validated(clipTransitionsComposition);
const DOWN = 4_600_000;
const NO_INSET = { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 };

/** `[opacity, transition]` of each node at `timeUs`, the transition `null` where there is none. */
function sides(timeUs: number, ...ids: string[]): [number, unknown][] {
  const state = evaluateComposition(document, timeUs);
  return ids.map((id) => {
    const node = stateNode(state, id);
    return [node.opacity, node.transition ?? null];
  });
}

describe('a clip transition whose incoming side lies above (D66)', () => {
  it('moves the incoming side of a slide in and cuts it to the frame', () => {
    expect(sides(1_900_000, 'up-clip-2', 'up-clip-3')).toEqual([
      [1, null],
      [1, { id: 'up-slide', offset: { x: 320, y: 0 }, clip: NO_INSET }],
    ]);
  });

  it('cuts the incoming side of a wipe and leaves the outgoing one as it is', () => {
    expect(sides(2_500_000, 'up-clip-3', 'up-clip-4')).toEqual([
      [1, null],
      [1, { id: 'up-wipe', clip: { ...NO_INSET, fromBottom: 180 } }],
    ]);
  });

  it('moves both sides of a push by the same distance', () => {
    expect(sides(3_100_000, 'up-clip-4', 'up-clip-5')).toEqual([
      [1, { id: 'up-push', offset: { x: 0, y: -180 }, clip: NO_INSET }],
      [1, { id: 'up-push', offset: { x: 0, y: 180 }, clip: NO_INSET }],
    ]);
  });

  it('scales the incoming side of a zoom about the frame centre while it fades in', () => {
    expect(sides(3_700_000, 'up-clip-5', 'up-clip-6')).toEqual([
      [1, null],
      [
        0.5,
        {
          id: 'up-zoom',
          zoom: { factor: 0.625, center: { x: 320, y: 180 } },
          clip: NO_INSET,
        },
      ],
    ]);
  });

  it('cuts the incoming side of an iris to a circle that holds the frame at the end', () => {
    // Centre (160, 252); reach max(160, 480) + max(252, 108) = 732, half of it now.
    expect(sides(4_300_000, 'up-clip-6', 'up-clip-7')).toEqual([
      [1, null],
      [1, { id: 'up-iris', circle: { x: 160, y: 252, radius: 366 } }],
    ]);
  });

  it('lays the colour of a fade under the lower side, the outgoing one', () => {
    expect(sides(1_300_000, 'up-clip-1', 'up-clip-2')).toEqual([
      [0, { id: 'up-fade', backdrop: '#fec84b' }],
      [0, null],
    ]);
  });
});

describe('a clip transition whose outgoing side lies above (D66)', () => {
  it('moves the outgoing side of a slide out and cuts the incoming one to the part it left', () => {
    expect(sides(DOWN + 1_900_000, 'down-clip-2', 'down-clip-3')).toEqual([
      [1, { id: 'down-slide', offset: { x: -320, y: 0 }, clip: NO_INSET }],
      [1, { id: 'down-slide', clip: { ...NO_INSET, fromLeft: 320 } }],
    ]);
  });

  it('cuts the outgoing side of a wipe to the part the edge has not passed', () => {
    expect(sides(DOWN + 2_500_000, 'down-clip-3', 'down-clip-4')).toEqual([
      [1, { id: 'down-wipe', clip: { ...NO_INSET, fromTop: 180 } }],
      [1, { id: 'down-wipe', clip: { ...NO_INSET, fromBottom: 180 } }],
    ]);
  });

  it('fades the outgoing side of a crossfade and of a zoom out', () => {
    expect(sides(DOWN + 700_000, 'down-clip-0', 'down-clip-1')).toEqual([
      [0.5, null],
      [0.5, null],
    ]);
    expect(sides(DOWN + 3_700_000, 'down-clip-5', 'down-clip-6')).toEqual([
      [0.5, null],
      [
        0.5,
        {
          id: 'down-zoom',
          zoom: { factor: 0.625, center: { x: 320, y: 180 } },
          clip: NO_INSET,
        },
      ],
    ]);
  });

  it('cuts the outgoing side of an iris to the frame outside the circle', () => {
    expect(sides(DOWN + 4_300_000, 'down-clip-6', 'down-clip-7')).toEqual([
      [1, { id: 'down-iris', hole: { x: 160, y: 252, radius: 366, width: 640, height: 360 } }],
      [1, { id: 'down-iris', circle: { x: 160, y: 252, radius: 366 } }],
    ]);
  });

  it('lays the colour of a fade under the lower side, the incoming one', () => {
    expect(sides(DOWN + 1_300_000, 'down-clip-1', 'down-clip-2')).toEqual([
      [0, null],
      [0, { id: 'down-fade', backdrop: '#fec84b' }],
    ]);
  });
});

describe('the first and the last instant of a clip transition (D49.4)', () => {
  const kinds = ['crossfade', 'fade', 'slide', 'wipe', 'push', 'zoom', 'iris'];

  it.each(kinds.map((kind, k) => [kind, k] as const))(
    'leaves the outgoing side of a %s as it is alone at its start, in both layer orders',
    (_, k) => {
      for (const [prefix, start] of [
        ['up', 0],
        ['down', DOWN],
      ] as const) {
        const timeUs = start + 600_000 * (k + 1);
        const [outgoing] = sides(timeUs, `${prefix}-clip-${String(k)}`);
        expect(outgoing).toEqual([1, null]);
      }
    },
  );

  it.each(kinds.map((kind, k) => [kind, k] as const))(
    'leaves the incoming side of a %s as it is alone at its end',
    (_, k) => {
      for (const [prefix, start] of [
        ['up', 0],
        ['down', DOWN],
      ] as const) {
        const timeUs = start + 600_000 * (k + 1) + 200_000;
        expect(sides(timeUs, `${prefix}-clip-${String(k + 1)}`)).toEqual([[1, null]]);
      }
    },
  );
});

describe('a clip transition inside a group (D66)', () => {
  it('moves the child in the frame of the canvas in the space of the group', () => {
    expect(sides(9_200_000 + 700_000, 'group-first', 'group-second')).toEqual([
      [1, null],
      [1, { id: 'group-slide', offset: { x: -320, y: 0 }, clip: NO_INSET }],
    ]);
  });
});

describe('the scene effects push, zoom, and iris (D66)', () => {
  const scenes = (timeUs: number) =>
    evaluateComposition(document, timeUs).scenes.map((scene) => [
      scene.id,
      scene.transition ?? null,
    ]);

  it('moves both scenes of a push', () => {
    expect(scenes(4_800_000)).toEqual([
      ['scene-up', { id: 'scene-push', offset: { x: -320, y: 0 } }],
      ['scene-down', { id: 'scene-push', offset: { x: 320, y: 0 } }],
    ]);
    // At its first instant the outgoing scene carries nothing.
    expect(scenes(4_600_000)).toEqual([
      ['scene-up', null],
      ['scene-down', { id: 'scene-push', offset: { x: 640, y: 0 } }],
    ]);
  });

  it('scales and fades the incoming scene of a zoom', () => {
    expect(scenes(9_400_000)).toEqual([
      ['scene-down', null],
      [
        'scene-group',
        { id: 'scene-zoom', opacity: 0.5, zoom: { factor: 1.5, center: { x: 320, y: 180 } } },
      ],
    ]);
  });

  it('cuts the incoming scene of an iris to a growing circle', () => {
    expect(scenes(10_400_000)).toEqual([
      ['scene-group', null],
      ['scene-end', { id: 'scene-iris', circle: { x: 320, y: 180, radius: 250 } }],
    ]);
    expect(scenes(10_200_000)).toEqual([
      ['scene-group', null],
      ['scene-end', { id: 'scene-iris', circle: { x: 320, y: 180, radius: 0 } }],
    ]);
  });
});
