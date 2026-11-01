/**
 * Rendering a split clip gives what the unsplit clip gives (D49.1, D55.4).
 *
 * Pictures: the state of `@kadrion/runtime` — the only input of the renderer
 * (D19, D22) — is compared at every boundary time around the split and on a
 * dense grid of scene times, nodes that are not active left out, with the
 * second half read under the first half's ID. Two halves are never active at
 * once, and the second sits directly above the first, so the visible layers
 * are the same. A video half chooses its frame from its source time, which is
 * part of the state (D49.5).
 *
 * Sound: the audio plan placed on the 48 kHz grid by `audioLayout` (D52.5,
 * D53), which the Producer's mix and the Player's graph both read, is
 * expanded to what each output sample hears — which source sample, at which
 * volume, at which place of which fade — and compared sample for sample.
 */
import { applyCommand, type Command, type MediaFacts } from '@kadrion/editor-sdk';
import {
  audioLayout,
  audioPlan,
  evaluateComposition,
  type CompositionState,
} from '@kadrion/runtime';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

const VIDEO_HASH = `sha256:${'c'.repeat(64)}`;
const AUDIO_HASH = (
  scenesComposition as { assets: { type: string; contentHash: string }[] }
).assets.find(({ type }) => type === 'audio')?.contentHash;

function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === AUDIO_HASH) return { type: 'audio', durationUs: 5_000_000 };
  if (contentHash === VIDEO_HASH) {
    return { type: 'video', durationUs: 4_000_000, audioDurationUs: 4_000_000 };
  }
  return null;
}

/** The scenes fixture with a heard video in the middle scene, from source time 0.25 s. */
function document(): ValidatedComposition {
  const draft = structuredClone(scenesComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
  };
  draft.assets.push({ id: 'asset-video', type: 'video', contentHash: VIDEO_HASH });
  draft.scenes[1]?.nodes.push({
    id: 'node-video',
    type: 'video',
    startUs: 100_000,
    durationUs: 1_300_000,
    position: { x: 10, y: 20 },
    scale: { x: 1, y: 1 },
    opacity: 1,
    animations: [
      {
        id: 'node-video-a-scale',
        property: 'scale',
        interpolation: 'linear',
        keyframes: [
          { timeUs: 0, value: { x: 1, y: 1 } },
          { timeUs: 1_000_000, value: { x: 2, y: 2 } },
        ],
      },
    ],
    assetId: 'asset-video',
    sourceStartUs: 250_000,
    width: 320,
    height: 180,
    fit: 'contain',
    volume: 0.5,
  });
  const result = validateComposition(draft);
  if (!result.ok) throw new Error(result.errors[0]?.message);
  return result.composition;
}

/** What is visible at a time: the active nodes of each evaluated scene, renamed by `alias`. */
function visible(state: CompositionState, alias: ReadonlyMap<string, string>): unknown {
  const rename = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value), (key, item: unknown) =>
      key === 'id' && typeof item === 'string' ? (alias.get(item) ?? item) : item,
    );
  return state.scenes.map((scene) => ({
    id: scene.id,
    timeUs: scene.timeUs,
    nodes: scene.nodes
      .filter((node) => node.active)
      .map((node) =>
        node.type === 'group'
          ? { ...node, children: node.children.filter((child) => child.active) }
          : node,
      )
      .map(rename),
  }));
}

/** The start of the middle scene in composition time. */
const MIDDLE_US = 1_000_000;

function times(atSceneUs: number): number[] {
  const at = MIDDLE_US + atSceneUs;
  const grid = Array.from({ length: 151 }, (_, index) => MIDDLE_US + index * 10_000 - 1);
  return [...grid, at - 2, at - 1, at, at + 1, at + 2, MIDDLE_US, MIDDLE_US + 1_499_999];
}

function splitOf(base: ValidatedComposition, command: Command): ValidatedComposition {
  return applyCommand(base, command, { mediaFacts }).document;
}

/** Each output sample a sound is heard on, with what it hears there. */
function heard(composition: ValidatedComposition, alias: ReadonlyMap<string, string>): string[] {
  const samples: string[] = [];
  for (const sound of audioLayout(audioPlan(composition)).sounds) {
    const id = alias.get(sound.entry.id) ?? sound.entry.id;
    for (let offset = 0; offset < sound.sampleCount; offset += 1) {
      const fadeIn =
        sound.fadeIn !== null &&
        offset >= sound.fadeIn.startSample &&
        offset < sound.fadeIn.startSample + sound.fadeIn.sampleCount
          ? `${String(offset - sound.fadeIn.startSample)}/${String(sound.fadeIn.sampleCount)}`
          : '-';
      const fadeOut =
        sound.fadeOut !== null &&
        offset >= sound.fadeOut.startSample &&
        offset < sound.fadeOut.startSample + sound.fadeOut.sampleCount
          ? `${String(offset - sound.fadeOut.startSample)}/${String(sound.fadeOut.sampleCount)}`
          : '-';
      samples.push(
        [
          String(sound.startSample + offset),
          id,
          sound.entry.assetId,
          String(sound.sourceStartSample + offset),
          String(sound.entry.volume),
          fadeIn,
          fadeOut,
        ].join(' '),
      );
    }
  }
  return samples.sort();
}

/** The first place where two lists differ, or `null`: a short message instead of a long diff. */
function firstDifference(a: readonly string[], b: readonly string[]): string | null {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) {
      return `${String(index)}: ${String(a[index])} against ${String(b[index])}`;
    }
  }
  return null;
}

describe('a split clip renders as the unsplit one (D49.1, D55.4)', () => {
  const base = document();
  const cases: readonly { name: string; command: Command; atSceneUs: number }[] = [
    {
      name: 'an image with an opacity animation',
      command: { type: 'SplitClip', clipId: 'middle-image', atUs: 640_000, newClipId: 'tail' },
      atSceneUs: 640_000,
    },
    {
      name: 'a heard video with a scale animation',
      command: { type: 'SplitClip', clipId: 'node-video', atUs: 600_125, newClipId: 'tail' },
      atSceneUs: 600_125,
    },
    {
      name: 'a Custom HTML element',
      command: { type: 'SplitClip', clipId: 'middle-html', atUs: 333_333, newClipId: 'tail' },
      atSceneUs: 333_333,
    },
    {
      name: 'a scene audio clip with both fades',
      command: { type: 'SplitClip', clipId: 'middle-voice', atUs: 625_000, newClipId: 'tail' },
      atSceneUs: 625_000,
    },
  ];

  it.each(cases)('$name: the same visible state at every time', ({ command, atSceneUs }) => {
    const split = splitOf(base, command);
    const alias = new Map([['tail', command.type === 'SplitClip' ? command.clipId : '']]);
    const none = new Map<string, string>();
    for (const timeUs of times(atSceneUs)) {
      expect(
        JSON.stringify(visible(evaluateComposition(split, timeUs), alias)),
        String(timeUs),
      ).toBe(JSON.stringify(visible(evaluateComposition(base, timeUs), none)));
    }
  });

  it.each(cases)('$name: the same sound on every sample', ({ command }) => {
    const split = splitOf(base, command);
    const alias = new Map([['tail', command.type === 'SplitClip' ? command.clipId : '']]);
    const before = heard(base, new Map());
    expect(before.length).toBeGreaterThan(48_000);
    expect(firstDifference(heard(split, alias), before)).toBeNull();
  });

  it('would differ off the 125 µs grid, which is why such a split is refused', () => {
    // A source start 10 µs off the phase of the clip's start, and the same edit
    // written by hand 1 µs off the grid: the second half then reads its source one
    // sample away from where the whole read it.
    const whole = applyCommand(
      base,
      {
        type: 'SetClipSource',
        clipId: 'middle-voice',
        assetId: 'asset-audio',
        sourceStartUs: 1_000_010,
      },
      { mediaFacts },
    ).document;
    const shifted = structuredClone(whole) as unknown as {
      scenes: { clips: Record<string, unknown>[] }[];
    };
    const clips = shifted.scenes[1]?.clips ?? [];
    const voice = clips[0] ?? {};
    const offsetUs = 375_001;
    clips.splice(
      0,
      1,
      { ...voice, durationUs: offsetUs, fadeOutUs: 0 },
      {
        ...voice,
        id: 'tail',
        startUs: Number(voice['startUs']) + offsetUs,
        durationUs: Number(voice['durationUs']) - offsetUs,
        sourceStartUs: Number(voice['sourceStartUs']) + offsetUs,
        fadeInUs: 0,
      },
    );
    const result = validateComposition(shifted);
    if (!result.ok) throw new Error(result.errors[0]?.message);
    expect(
      firstDifference(
        heard(result.composition, new Map([['tail', 'middle-voice']])),
        heard(whole, new Map()),
      ),
    ).not.toBeNull();
    // On the grid, the bus's own split of that clip is exact all the same.
    const onGrid = splitOf(whole, {
      type: 'SplitClip',
      clipId: 'middle-voice',
      atUs: 625_000,
      newClipId: 'tail',
    });
    expect(
      firstDifference(heard(onGrid, new Map([['tail', 'middle-voice']])), heard(whole, new Map())),
    ).toBeNull();
  });
});
