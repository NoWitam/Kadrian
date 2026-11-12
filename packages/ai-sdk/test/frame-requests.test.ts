/**
 * A fixture of requests a model receives about the frame of a text, its
 * alignment, captions broken by width, and the outline of the spoken word
 * (D83.10, PR-67): each with the tool calls that carry it out and the document
 * they must give, written out by hand. Every call goes through `executeTool`
 * alone, on the host's bus, and each request is one undo.
 */
import { createCommandBus, type CommandBus } from '@kadrion/editor-sdk';
import { captionsComposition, referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { executeTool, type ToolBus } from '../src/index.js';

import { codeOf, json, stateOf } from './support.js';

type Node = Record<string, unknown>;
interface Draft {
  scenes: { nodes: Node[] }[];
}

/** The node of a draft by its ID, in its scenes and groups, to write an expected document by hand. */
function nodeOf(draft: Draft, id: string): Node {
  const search = (nodes: readonly Node[]): Node | undefined => {
    for (const node of nodes) {
      if (node['id'] === id) return node;
      const found = search((node['children'] as Node[] | undefined) ?? []);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const scene of draft.scenes) {
    const found = search(scene.nodes);
    if (found !== undefined) return found;
  }
  throw new Error(`No node ${id}.`);
}

/** The reference composition: its title, `node-title`, is a text without a frame. */
function texts(): Draft {
  return structuredClone(referenceComposition) as Draft;
}

/** The reference composition whose title has a frame of 800 by 300. */
function framedTitle(): Draft {
  const draft = texts();
  nodeOf(draft, 'node-title')['frame'] = { kind: 'fixed', width: 800, height: 300 };
  return draft;
}

/** The captions composition: `captions` broken by characters, the spoken word without an outline. */
function captions(): Draft {
  return structuredClone(captionsComposition) as Draft;
}

/** The expected document: the start with `edit` applied to a copy. */
function expected(start: () => Draft, edit: (draft: Draft) => void): string {
  const draft = start();
  edit(draft);
  return json(draft);
}

interface Request {
  readonly request: string;
  readonly start: () => Draft;
  readonly calls: readonly { readonly name: string; readonly arguments: unknown }[];
  readonly expected: string;
}

const TITLE_STYLE = nodeOf(texts(), 'node-title')['style'] as Node;
const CAPTIONS_STYLE = nodeOf(captions(), 'captions')['style'] as Node;
const HIGHLIGHT = CAPTIONS_STYLE['highlight'] as Node;
const BLACK_OUTLINE = { kind: 'outside', color: '#000000', width: 3 };

const REQUESTS: readonly Request[] = [
  {
    request: 'Make the title box 800 by 300.',
    start: texts,
    calls: [
      { name: 'set_node_size', arguments: { nodeId: 'node-title', width: 800, height: 300 } },
    ],
    // The frame, its lines wrapped to its width; the font size and position stay.
    expected: expected(texts, (draft) => {
      nodeOf(draft, 'node-title')['frame'] = { kind: 'fixed', width: 800, height: 300 };
    }),
  },
  {
    request: 'Centre the text in its box.',
    start: framedTitle,
    // A complete style: the model reads the current one first and changes only the alignment.
    calls: [
      { name: 'describe_document', arguments: {} },
      {
        name: 'set_text_style',
        arguments: {
          nodeId: 'node-title',
          style: { ...TITLE_STYLE, align: 'center', verticalAlign: 'middle' },
        },
      },
    ],
    expected: expected(framedTitle, (draft) => {
      nodeOf(draft, 'node-title')['style'] = {
        ...TITLE_STYLE,
        align: 'center',
        verticalAlign: 'middle',
      };
    }),
  },
  {
    request: 'Break the captions by width.',
    start: captions,
    calls: [
      {
        name: 'set_caption_style',
        arguments: { nodeId: 'captions', style: { ...CAPTIONS_STYLE, lineBreak: 'width' } },
      },
    ],
    // Both bounds stay: a line fits the box's width and maxLineLength (D83.5).
    expected: expected(captions, (draft) => {
      nodeOf(draft, 'captions')['style'] = { ...CAPTIONS_STYLE, lineBreak: 'width' };
    }),
  },
  {
    request: 'Give the spoken word a black outline.',
    start: captions,
    calls: [
      {
        name: 'set_caption_highlight',
        arguments: { nodeId: 'captions', highlight: { ...HIGHLIGHT, stroke: BLACK_OUTLINE } },
      },
    ],
    // The highlight alone: the other words keep the style's own outline (D83.8).
    expected: expected(captions, (draft) => {
      nodeOf(draft, 'captions')['style'] = {
        ...CAPTIONS_STYLE,
        highlight: { ...HIGHLIGHT, stroke: BLACK_OUTLINE },
      };
    }),
  },
  {
    request: 'Take the title out of its box.',
    start: framedTitle,
    calls: [
      { name: 'set_node_size', arguments: { nodeId: 'node-title', width: null, height: null } },
    ],
    expected: json(texts()),
  },
  {
    request: 'Make the title box 800 by 300 and centre the text in it, in one step.',
    start: texts,
    calls: [
      {
        name: 'run_transaction',
        arguments: {
          calls: [
            { name: 'set_node_size', arguments: { nodeId: 'node-title', width: 800, height: 300 } },
            {
              name: 'set_text_style',
              arguments: {
                nodeId: 'node-title',
                style: { ...TITLE_STYLE, align: 'center', verticalAlign: 'middle' },
              },
            },
          ],
        },
      },
    ],
    expected: expected(framedTitle, (draft) => {
      nodeOf(draft, 'node-title')['style'] = {
        ...TITLE_STYLE,
        align: 'center',
        verticalAlign: 'middle',
      };
    }),
  },
];

/** The capabilities `executeTool` is given and nothing else (D46.4). */
function toolBus(bus: CommandBus): ToolBus {
  return Object.freeze({
    getDocument: () => bus.getDocument(),
    dispatch: (command: unknown) => bus.dispatch(command),
    dispatchTransaction: (commands: unknown) => bus.dispatchTransaction(commands),
  });
}

describe('a model frames, aligns, and breaks text through executeTool alone (D83.10)', () => {
  it.each(REQUESTS.map((row) => [row.request, row]))(
    '%s',
    (_, { start, calls, expected: after }) => {
      const bus = createCommandBus(start());
      const before = json(bus.getDocument());
      // Every request changes the document, so a call that wrote nothing would fail.
      expect(after).not.toBe(before);
      for (const call of calls) executeTool(toolBus(bus), call.name, call.arguments);
      expect(json(bus.getDocument())).toBe(after);
      // Each request is one step: one undo restores every byte.
      bus.undo();
      expect(json(bus.getDocument())).toBe(before);
      expect(bus.canUndo()).toBe(false);
    },
  );

  it('reads the frame back from describe_document as a stored field', () => {
    const bus = createCommandBus(texts());
    executeTool(toolBus(bus), 'set_node_size', { nodeId: 'node-title', width: 800, height: 300 });
    const result = executeTool(toolBus(bus), 'describe_document', {});
    if (result.kind !== 'description') throw new Error('describe_document described nothing.');
    const title = result.description.scenes[0]?.nodes.find((node) => node.id === 'node-title');
    expect(title?.fields).toMatchObject({ frame: { kind: 'fixed', width: 800, height: 300 } });
  });

  it.each([
    ['one side null', { nodeId: 'node-title', width: null, height: 300 }],
    ['null for an image', { nodeId: 'node-image', width: null, height: null }],
  ])('refuses %s as invalid-argument, and leaves the document as it was', (_, args) => {
    const bus = createCommandBus(texts());
    const before = stateOf(bus);
    expect(codeOf(() => executeTool(toolBus(bus), 'set_node_size', args))).toBe('invalid-argument');
    expect(stateOf(bus)).toEqual(before);
  });
});
