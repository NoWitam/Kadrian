/**
 * The calls to the bus in the command-bus example of the README (section 5) —
 * `dispatch`, `dispatchTransaction`, `undo`, and `redo` — run in the order
 * written. The starting document is the JSON of section 1, which the section
 * names, and the calls are read from the README's own code block, so an edit of
 * the example whose commands no longer execute fails here. The rest of the
 * block is not run: the options of `createCommandBus` are this test's own, and
 * the listener, which needs a Player, is not subscribed. Only `captionNode`,
 * which the README describes in words, is written out in this test.
 */
import { createCommandBus, type Command } from '@kadrion/editor-sdk';
import { describe, expect, it } from 'vitest';

import { normalizeWhitespace, readText } from './repo.js';

const readme = readText('README.md');

/** The text of a `### <n>. …` section of "Using Kadrion". */
function section(number: number): string {
  const start = readme.indexOf(`\n### ${String(number)}. `);
  const end = readme.indexOf(`\n### ${String(number + 1)}. `);
  if (start < 0 || end < 0) throw new Error(`The README has no section ${String(number)}.`);
  return readme.slice(start, end);
}

/** The first fenced block of a language in a section. */
function block(text: string, language: string): string {
  const match = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``).exec(text);
  if (match?.[1] === undefined) throw new Error(`No ${language} block.`);
  return match[1];
}

/**
 * A JavaScript literal of the example as a value: its keys quoted, its strings
 * in double quotes, its numeric separators and trailing commas removed, and the
 * names it mentions replaced by their values. The example uses nothing else.
 */
function literal(source: string, names: Readonly<Record<string, unknown>>): unknown {
  let text = source
    .replace(/'([^']*)'/g, '"$1"')
    .replace(/([{,]\s*)([A-Za-z]+):/g, '$1"$2":')
    .replace(/(\d)_(?=\d)/g, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  for (const [name, value] of Object.entries(names)) {
    // A function, so that a `$` in the value is text and not a replacement pattern.
    text = text.replace(new RegExp(`\\b${name}\\b`, 'g'), () => JSON.stringify(value));
  }
  return JSON.parse(text);
}

/** The caption the README describes: a text node `caption` with one position animation. */
const captionNode = {
  id: 'caption',
  type: 'text',
  startUs: 0,
  durationUs: 3_000_000,
  position: { x: 90, y: 400 },
  scale: { x: 1, y: 1 },
  opacity: 1,
  animations: [
    {
      id: 'caption-position',
      property: 'position',
      interpolation: 'linear',
      keyframes: [
        { timeUs: 0, value: { x: 0, y: 40 } },
        { timeUs: 1_000_000, value: { x: 0, y: 0 } },
      ],
    },
  ],
  text: 'A caption',
  fontAssetId: 'asset-font',
  fontSize: 48,
  color: '#ffffff',
};

describe('the literals of the example, as this test reads them', () => {
  it('inserts the value of a name literally, replacement tokens included', () => {
    const value = { text: 'a $& b $$ c $1 d $` e' };
    expect(
      literal("{ type: 'AddNode', index: 1_000, node: captionNode, }", { captionNode: value }),
    ).toEqual({
      type: 'AddNode',
      index: 1000,
      node: value,
    });
  });
});

describe('the command-bus example of the README', () => {
  const code = block(section(5), 'ts');
  const documentJson: unknown = JSON.parse(block(section(1), 'json'));
  const fadeInSource = /const fadeIn = (\{[\s\S]*?\});/.exec(code)?.[1];

  it('names its starting document and describes the node it adds', () => {
    const prose = normalizeWhitespace(section(5));
    expect(prose).toContain('`documentJson` is the document of section 1');
    expect(prose).toContain(
      '`captionNode` is a complete text node with the ID `caption` and one position animation',
    );
    expect(fadeInSource).toBeDefined();
  });

  it('executes every call to the bus in order against that document', () => {
    const names = { captionNode, fadeIn: literal(fadeInSource ?? '', {}) };
    const bus = createCommandBus(documentJson, { historyLimit: 100 });
    const calls = [
      ...code.matchAll(/bus\.(dispatchTransaction|dispatch|undo|redo)\(([\s\S]*?)\);/g),
    ];
    const ran: string[] = [];
    let copied: readonly string[] = [];
    for (const [, method = '', argument = ''] of calls) {
      if (method === 'undo') bus.undo();
      else if (method === 'redo') bus.redo();
      else if (method === 'dispatchTransaction') {
        bus.dispatchTransaction(literal(argument, names));
      } else {
        const command = literal(argument, names) as Command;
        const result = bus.dispatch(command);
        if (command.type === 'DuplicateNode') copied = result.createdIds;
        ran.push(command.type);
        continue;
      }
      ran.push(method);
    }
    // Every call of the example ran, the animation commands included.
    expect(ran).toEqual([
      'SetNodePosition',
      'dispatchTransaction',
      'undo',
      'redo',
      'AddNode',
      'DuplicateNode',
      'ReorderNode',
      'RemoveNode',
      'AddAnimation',
      'SetOpacityKeyframe',
      'MoveKeyframe',
      'RemoveKeyframe',
      'RemoveAnimation',
      'SetNodeLifetime',
    ]);
    // What the comment after DuplicateNode says the copy created.
    expect(code).toContain("copy.createdIds; // ['caption-2', 'caption-2-a-position']");
    expect(copied).toEqual(['caption-2', 'caption-2-a-position']);
    expect(bus.canUndo()).toBe(true);
    // The last call of the example: the lifetime it set is in the document.
    const copy = bus.getDocument().scenes[0]?.nodes.find(({ id }) => id === 'caption-2');
    expect([copy?.startUs, copy?.durationUs]).toEqual([1_000_000, 1_500_000]);
  });

  it('really needs a node that does not animate opacity yet', () => {
    // The premise of the example's target: the same animation on `node-title`,
    // which fades in already, is refused.
    const bus = createCommandBus(documentJson);
    const fadeIn = literal(fadeInSource ?? '', {});
    let refusal = 'did not throw';
    try {
      bus.dispatch({ type: 'AddAnimation', nodeId: 'node-title', index: 1, animation: fadeIn });
    } catch (reason) {
      refusal = (reason as { code: string }).code;
    }
    expect(refusal).toBe('duplicate-animation-target');
  });
});
