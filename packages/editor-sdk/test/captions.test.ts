/**
 * The commands of captions (D57.5): the words replaced as a whole, one word
 * replaced, and the style replaced, each undone by its inverse to the exact
 * text of the document before it; and the timeline commands, which treat the
 * words as they treat keyframes: a move carries them, a trim leaves them, and
 * a split copies them to both halves, which a join takes back.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { captionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, type Command } from '../src/index.js';

import { codeOf, json, validated } from './support.js';

const document = validated(captionsComposition);

// A type alias, not an interface, so that a word is a record of data the commands take.
type Word = {
  readonly text: string;
  readonly startUs: number;
  readonly durationUs: number;
};

interface CaptionsView {
  readonly id: string;
  readonly startUs: number;
  readonly durationUs: number;
  readonly style: Record<string, unknown>;
  readonly words: readonly Word[];
}

function captionsOf(composition: unknown, id = 'captions'): CaptionsView {
  const scenes = (composition as { scenes: { nodes: CaptionsView[] }[] }).scenes;
  const node = scenes.flatMap((scene) => scene.nodes).find((item) => item.id === id);
  if (node === undefined) throw new Error(`No node "${id}".`);
  return node;
}

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(from: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(from, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(from));
  return result.document;
}

const WORDS: readonly Word[] = [
  { text: 'Made', startUs: 100_000, durationUs: 300_000 },
  { text: 'with', startUs: 400_000, durationUs: 200_000 },
  { text: 'Kadrion', startUs: 600_000, durationUs: 500_000 },
];

describe('SetCaptionWords (D57.5)', () => {
  it('replaces every word and is undone exactly', () => {
    const edited = roundTrip(document, {
      type: 'SetCaptionWords',
      nodeId: 'captions',
      words: WORDS,
    });
    expect(captionsOf(edited).words).toEqual(WORDS);
  });

  it('takes an empty list, which shows nothing', () => {
    const edited = roundTrip(document, { type: 'SetCaptionWords', nodeId: 'captions', words: [] });
    expect(captionsOf(edited).words).toEqual([]);
  });

  it('is no edit when the words are the same', () => {
    const words = captionsOf(document).words;
    const result = applyCommand(document, { type: 'SetCaptionWords', nodeId: 'captions', words });
    expect(result.inverse).toBeNull();
    expect(json(result.document)).toBe(json(document));
  });

  it('refuses overlapping words, a word with a space, a node that is not captions, and no array', () => {
    const overlapping = [
      { text: 'Made', startUs: 0, durationUs: 500_000 },
      { text: 'with', startUs: 400_000, durationUs: 200_000 },
    ];
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'SetCaptionWords', nodeId: 'captions', words: overlapping }),
      ),
    ).toBe('invalid-result');
    const spaced = [{ text: 'Made with', startUs: 0, durationUs: 500_000 }];
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'SetCaptionWords', nodeId: 'captions', words: spaced }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionWords',
          nodeId: 'captions-background',
          words: WORDS,
        }),
      ),
    ).toBe('unsupported-node');
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'SetCaptionWords', nodeId: 'nobody', words: WORDS }),
      ),
    ).toBe('unknown-node');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionWords',
          nodeId: 'captions',
          words: 'Made with Kadrion',
        } as unknown as Command),
      ),
    ).toBe('invalid-argument');
  });
});

describe('SetCaptionWord (D57.5)', () => {
  it('corrects the text of one word and is undone exactly', () => {
    const before = captionsOf(document).words[3];
    const word = { ...before, text: 'in' };
    const edited = roundTrip(document, {
      type: 'SetCaptionWord',
      nodeId: 'captions',
      index: 3,
      word,
    });
    expect(captionsOf(edited).words[3]).toEqual(word);
    expect(captionsOf(edited).words.filter((_, at) => at !== 3)).toEqual(
      captionsOf(document).words.filter((_, at) => at !== 3),
    );
  });

  it('changes the timing of one word within its neighbours', () => {
    const word = { text: 'on', startUs: 1_150_000, durationUs: 100_000 };
    const edited = roundTrip(document, {
      type: 'SetCaptionWord',
      nodeId: 'captions',
      index: 3,
      word,
    });
    expect(captionsOf(edited).words[3]).toEqual(word);
  });

  it('refuses a word that overlaps its neighbour, an index outside the words, and a non-captions node', () => {
    const late = { text: 'on', startUs: 1_200_000, durationUs: 200_000 };
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionWord',
          nodeId: 'captions',
          index: 3,
          word: late,
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionWord',
          nodeId: 'captions',
          index: 10,
          word: late,
        }),
      ),
    ).toBe('index-out-of-range');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetCaptionWord',
          nodeId: 'captions-background',
          index: 0,
          word: late,
        }),
      ),
    ).toBe('unsupported-node');
  });

  it('is no edit when the word is the same', () => {
    const word = captionsOf(document).words[0] as Word;
    const result = applyCommand(document, {
      type: 'SetCaptionWord',
      nodeId: 'captions',
      index: 0,
      word,
    });
    expect(result.inverse).toBeNull();
  });
});

describe('SetCaptionStyle (D57.5)', () => {
  it('replaces the style, keeps every word, and is undone exactly', () => {
    const style = {
      ...captionsOf(document).style,
      maxLineLength: 30,
      highlight: { ...(captionsOf(document).style['highlight'] as object), color: '#00ff00' },
    };
    const edited = roundTrip(document, { type: 'SetCaptionStyle', nodeId: 'captions', style });
    expect(captionsOf(edited).style).toEqual(style);
    expect(captionsOf(edited).words).toEqual(captionsOf(document).words);
  });

  it('refuses a style the document cannot hold', () => {
    const style = { ...captionsOf(document).style, align: 'justify' };
    expect(
      codeOf(() => applyCommand(document, { type: 'SetCaptionStyle', nodeId: 'captions', style })),
    ).toBe('invalid-result');
  });

  it('is no edit when the style is the same', () => {
    const { style } = captionsOf(document);
    const result = applyCommand(document, { type: 'SetCaptionStyle', nodeId: 'captions', style });
    expect(result.inverse).toBeNull();
  });
});

/** A document whose captions node starts at 0 and lasts 2 s, so that a move has room. */
function shortened(): ValidatedComposition {
  return applyCommand(document, { type: 'TrimClipEnd', clipId: 'captions', endUs: 2_000_000 })
    .document;
}

describe('the timeline commands on captions (D55, D57.5)', () => {
  it('moves the words with the node, as keyframes', () => {
    const from = shortened();
    const edited = roundTrip(from, { type: 'MoveClip', clipId: 'captions', startUs: 500_000 });
    expect(captionsOf(edited).startUs).toBe(500_000);
    expect(captionsOf(edited).words.map(({ startUs }) => startUs)).toEqual(
      captionsOf(from).words.map(({ startUs }) => startUs + 500_000),
    );
  });

  it('moves no word when the start is trimmed', () => {
    const edited = roundTrip(document, {
      type: 'TrimClipStart',
      clipId: 'captions',
      startUs: 1_000_000,
    });
    expect(captionsOf(edited).words).toEqual(captionsOf(document).words);
  });

  it('copies every word to both halves of a split, which a join takes back', () => {
    const edited = roundTrip(document, {
      type: 'SplitClip',
      clipId: 'captions',
      atUs: 1_800_000,
      newClipId: 'captions-tail',
    });
    expect(captionsOf(edited).durationUs).toBe(1_800_000);
    expect(captionsOf(edited, 'captions-tail')).toMatchObject({
      startUs: 1_800_000,
      durationUs: 1_200_000,
      words: captionsOf(document).words,
    });
  });
});
