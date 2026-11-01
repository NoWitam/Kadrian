/**
 * Every tool of the catalogue on the host's bus (D46.4, D31.9). For every
 * command, the tool and the command give the same document byte for byte, the
 * same inverse, and the same created IDs; a refused call leaves the document
 * and the history untouched; and each tool accepts exactly the arguments its
 * own `inputSchema` accepts. `run_transaction` is one `dispatchTransaction`,
 * one history entry; `describe_document` reads and never writes.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  COMMAND_TOOL_METADATA,
  COMMAND_TYPES,
  createCommandBus,
  describeDocument,
  type Command,
  type CommandBus,
  type MediaFacts,
} from '@kadrion/editor-sdk';
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { executeTool, TOOL_CATALOGUE, toolNameOf, type ToolBus } from '../src/index.js';

import { codeOf, isDeepFrozen, json, stateOf } from './support.js';

const HASH = 'sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae';
const VIDEO_HASH = `sha256:${'b'.repeat(64)}`;
const CLIP_HASH = `sha256:${'c'.repeat(64)}`;
const AUDIO_HASH = 'sha256:a383506e57b39f51b8952cff8a82f2a058e4d07b8c970068b8af84f72d058f97';

/** The media facts the host of these tests knows: both videos and their sound last 10 s, the reference sound 20 s (D49.6, D53). */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === VIDEO_HASH || contentHash === CLIP_HASH) {
    return { type: 'video', durationUs: 10_000_000, audioDurationUs: 10_000_000 };
  }
  return contentHash === AUDIO_HASH ? { type: 'audio', durationUs: 20_000_000 } : null;
}

/** A video node of the examples, and its asset (D50). */
const VIDEO_SETUP: readonly Command[] = [
  {
    type: 'AddAsset',
    asset: { id: 'asset-video', type: 'video', contentHash: VIDEO_HASH },
    index: 0,
  },
  {
    type: 'AddNode',
    parentId: 'scene-main',
    index: 4,
    node: {
      id: 'node-video',
      type: 'video',
      startUs: 0,
      durationUs: 1_000_000,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      opacity: 1,
      animations: [],
      assetId: 'asset-video',
      sourceStartUs: 0,
      width: 320,
      height: 180,
      fit: 'contain',
      volume: 0,
    },
  },
];

/**
 * What a document needs before the example of a command changes it: the
 * reference composition has no second font or image, no unused asset, and no
 * animation with a keyframe to spare. Typed by the registry, so a new command
 * without a row fails compilation.
 */
/** A second scene, as the example of `AddScene` adds it. */
const OUTRO_SETUP: readonly Command[] = [
  {
    type: 'AddScene',
    index: 1,
    scene: {
      id: 'scene-outro',
      durationUs: 3_000_000,
      nodes: [
        {
          id: 'node-outro-background',
          type: 'background',
          startUs: 0,
          durationUs: 3_000_000,
          color: '#000000',
        },
      ],
      clips: [],
    },
  },
];

const SETUP: { readonly [T in Command['type']]: readonly Command[] } = {
  SetNodePosition: [],
  SetNodeOpacity: [],
  SetTextContent: [],
  AddNode: [],
  RemoveNode: [],
  DuplicateNode: [],
  ReorderNode: [],
  SetNodeScale: [],
  SetNodeSize: [],
  SetNodeColor: [],
  SetTextFontSize: [],
  SetTextFont: [
    {
      type: 'AddAsset',
      asset: { id: 'asset-font-bold', type: 'font', contentHash: HASH },
      index: 0,
    },
  ],
  SetImageAsset: [
    { type: 'AddAsset', asset: { id: 'asset-photo', type: 'image', contentHash: HASH }, index: 0 },
  ],
  AddAsset: [],
  RemoveAsset: [
    { type: 'AddAsset', asset: { id: 'asset-photo', type: 'image', contentHash: HASH }, index: 0 },
  ],
  AddAnimation: [],
  RemoveAnimation: [],
  SetOpacityKeyframe: [],
  SetPositionKeyframe: [],
  SetScaleKeyframe: [],
  AddKeyframe: [],
  RemoveKeyframe: [
    {
      type: 'SetOpacityKeyframe',
      animationId: 'anim-title-opacity',
      timeUs: 5_000_000,
      opacity: 0.5,
    },
  ],
  MoveKeyframe: [],
  SetNodeLifetime: [],
  SetNodeFit: [],
  SetVideoAsset: [
    ...VIDEO_SETUP,
    {
      type: 'AddAsset',
      asset: { id: 'asset-clip', type: 'video', contentHash: CLIP_HASH },
      index: 0,
    },
  ],
  SetVideoSource: VIDEO_SETUP,
  SetVideoVolume: VIDEO_SETUP,
  AddAudioClip: [],
  RemoveAudioClip: [],
  SetClipVolume: [],
  SetClipFades: [],
  SetClipSource: [],
  AddScene: [],
  RemoveScene: OUTRO_SETUP,
  DuplicateScene: [],
  ReorderScene: OUTRO_SETUP,
  SetSceneDuration: [],
  MoveNodeToScene: OUTRO_SETUP,
  AddSceneAudioClip: [],
  MoveClip: [],
  TrimClipStart: [],
  TrimClipEnd: [],
  SplitClip: [],
  JoinClips: [
    { type: 'SplitClip', clipId: 'node-title', atUs: 5_000_000, newClipId: 'node-title-tail' },
  ],
};

function prepared(type: Command['type']): CommandBus {
  const bus = createCommandBus(referenceComposition, { mediaFacts });
  for (const command of SETUP[type]) bus.dispatch(command);
  return bus;
}

/** The capabilities `executeTool` is given and nothing else, on a frozen object (D31.5). */
function toolBus(bus: CommandBus): ToolBus {
  return Object.freeze({
    getDocument: () => bus.getDocument(),
    dispatch: (command: unknown) => bus.dispatch(command),
    dispatchTransaction: (commands: unknown) => bus.dispatchTransaction(commands),
  });
}

/** A bus that records which of its methods a call used. */
function recording(bus: CommandBus): { bus: ToolBus; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    bus: Object.freeze({
      getDocument: () => {
        calls.push('getDocument');
        return bus.getDocument();
      },
      dispatch: (command: unknown) => {
        calls.push('dispatch');
        return bus.dispatch(command);
      },
      dispatchTransaction: (commands: unknown) => {
        calls.push('dispatchTransaction');
        return bus.dispatchTransaction(commands);
      },
    }),
  };
}

describe('every command tool equals its command (D46.4, D31.9)', () => {
  it.each(COMMAND_TOOL_METADATA.map((metadata) => [toolNameOf(metadata.commandType), metadata]))(
    '%s gives the document, inverse, and IDs of the command, byte for byte',
    (name, { commandType, example }) => {
      const viaTool = prepared(commandType);
      const viaCommand = prepared(commandType);
      const before = viaTool.getDocument();
      const tool = executeTool(toolBus(viaTool), name, structuredClone(example));
      const command = viaCommand.dispatch({ type: commandType, ...structuredClone(example) });
      if (tool.kind !== 'command') throw new Error(`${name} is not a command tool.`);
      // The example is an edit, not a no-op: the comparison below means something.
      expect(json(tool.result.document)).not.toBe(json(before));
      expect(json(tool.result.document)).toBe(json(command.document));
      expect(json(tool.result.inverse)).toBe(json(command.inverse));
      expect(tool.result.createdIds).toEqual(command.createdIds);
      expect(json(viaTool.getDocument())).toBe(json(viaCommand.getDocument()));
      // One shared history: undo after the tool restores the document before it.
      viaTool.undo();
      expect(json(viaTool.getDocument())).toBe(json(before));
    },
  );

  it('dispatches each command tool exactly once and reaches nothing else of the bus', () => {
    for (const { commandType, example } of COMMAND_TOOL_METADATA) {
      const { bus, calls } = recording(prepared(commandType));
      executeTool(bus, toolNameOf(commandType), example);
      expect(calls, commandType).toEqual(['dispatch']);
    }
  });

  it.each(COMMAND_TOOL_METADATA.map((metadata) => [toolNameOf(metadata.commandType), metadata]))(
    '%s refused leaves the document and both stacks untouched',
    (name, { commandType, example }) => {
      const bus = prepared(commandType);
      bus.dispatch({ type: 'SetNodeOpacity', nodeId: 'node-image', opacity: 0.25 });
      bus.undo();
      const before = stateOf(bus);
      const document = bus.getDocument();
      expect(before.redo).toBe(true);
      for (const args of [
        { ...example, extra: 1 },
        { type: commandType, ...example },
        null,
        [example],
      ]) {
        expect(codeOf(() => executeTool(toolBus(bus), name, args))).toBe('invalid-argument');
        expect(stateOf(bus)).toEqual(before);
        expect(bus.getDocument()).toBe(document);
      }
    },
  );

  it('refuses a name outside the catalogue as unknown-command, and a name that is no string', () => {
    const bus = createCommandBus(referenceComposition);
    expect(codeOf(() => executeTool(toolBus(bus), 'SetNodePosition', {}))).toBe('unknown-command');
    expect(codeOf(() => executeTool(toolBus(bus), 'undo', {}))).toBe('unknown-command');
    expect(codeOf(() => executeTool(toolBus(bus), 7, {}))).toBe('invalid-argument');
    expect(bus.canUndo()).toBe(false);
  });

  it('returns a frozen result and leaves the arguments as they were', () => {
    const bus = createCommandBus(referenceComposition);
    const args = { nodeId: 'node-title', position: { x: 12.5, y: -0 } };
    const copy = structuredClone(args);
    const result = executeTool(toolBus(bus), 'set_node_position', args);
    expect(Object.isFrozen(result)).toBe(true);
    expect(args).toEqual(copy);
  });
});

describe('run_transaction is one dispatchTransaction, one history entry (D46.4, D38.4)', () => {
  const calls = [
    {
      name: 'add_node',
      arguments: COMMAND_TOOL_METADATA.find(({ commandType }) => commandType === 'AddNode')
        ?.example,
    },
    {
      name: 'set_node_position',
      arguments: { nodeId: 'node-subtitle', position: { x: 10, y: 20 } },
    },
    { name: 'set_text_content', arguments: { nodeId: 'node-subtitle', text: 'Second line' } },
  ];
  const commands: readonly unknown[] = [
    { type: 'AddNode', ...calls[0]?.arguments },
    { type: 'SetNodePosition', ...calls[1]?.arguments },
    { type: 'SetTextContent', ...calls[2]?.arguments },
  ];

  it('gives the document of the same transaction on the bus, byte for byte', () => {
    const viaTool = createCommandBus(referenceComposition);
    const viaBus = createCommandBus(referenceComposition);
    const tool = executeTool(toolBus(viaTool), 'run_transaction', { calls });
    const direct = viaBus.dispatchTransaction(commands);
    if (tool.kind !== 'transaction') throw new Error('run_transaction is not a transaction.');
    expect(json(tool.result)).toBe(json(direct));
    expect(tool.result.createdIds).toEqual(['node-subtitle']);
  });

  it('is undone by one undo', () => {
    const bus = createCommandBus(referenceComposition);
    const before = bus.getDocument();
    executeTool(toolBus(bus), 'run_transaction', { calls });
    bus.undo();
    expect(bus.getDocument()).toStrictEqual(before);
    expect(bus.canUndo()).toBe(false);
  });

  it('uses dispatchTransaction once and nothing else', () => {
    const { bus, calls: used } = recording(createCommandBus(referenceComposition));
    executeTool(bus, 'run_transaction', { calls });
    expect(used).toEqual(['dispatchTransaction']);
  });

  it('changes nothing when one call is refused, and names that call', () => {
    const bus = createCommandBus(referenceComposition);
    const before = stateOf(bus);
    const failing = [
      ...calls,
      { name: 'set_node_opacity', arguments: { nodeId: 'gone', opacity: 1 } },
    ];
    expect(codeOf(() => executeTool(toolBus(bus), 'run_transaction', { calls: failing }))).toBe(
      'unknown-node',
    );
    expect(() => executeTool(toolBus(bus), 'run_transaction', { calls: failing })).toThrow(
      /Command 3 of the transaction/,
    );
    expect(stateOf(bus)).toEqual(before);
  });

  it('refuses describe_document, run_transaction, and unknown names inside, before the bus', () => {
    for (const name of ['describe_document', 'run_transaction', 'undo', 'SetNodePosition', 7]) {
      const { bus, calls: used } = recording(createCommandBus(referenceComposition));
      const nested = { calls: [{ name, arguments: {} }] };
      expect(codeOf(() => executeTool(bus, 'run_transaction', nested))).toBe('invalid-argument');
      expect(used).toEqual([]);
    }
  });
});

describe('describe_document reads and never writes (D46.3)', () => {
  it('returns the description of the current document and uses getDocument alone', () => {
    const { bus, calls } = recording(createCommandBus(referenceComposition));
    const result = executeTool(bus, 'describe_document', {});
    if (result.kind !== 'description') throw new Error('describe_document described nothing.');
    expect(calls).toEqual(['getDocument']);
    expect(result.description).toEqual(describeDocument(bus.getDocument()));
    expect(isDeepFrozen(result)).toBe(true);
  });

  it('follows the edits of the bus', () => {
    const bus = createCommandBus(referenceComposition);
    executeTool(toolBus(bus), 'set_node_position', {
      nodeId: 'node-title',
      position: { x: 1, y: 2 },
    });
    const result = executeTool(toolBus(bus), 'describe_document', {});
    if (result.kind !== 'description') throw new Error('describe_document described nothing.');
    const title = result.description.scenes[0]?.nodes.find(({ id }) => id === 'node-title');
    expect(title?.fields['position']).toEqual({ x: 1, y: 2 });
  });
});

/** Whether the tool accepted the arguments, whatever the bus then made of the edit. */
function toolAccepts(name: string, args: unknown): boolean {
  const code = codeOf(() =>
    executeTool(toolBus(createCommandBus(referenceComposition)), name, args),
  );
  if (code.startsWith('threw')) throw new Error(`${name} threw a non-EditorError: ${code}`);
  return code !== 'invalid-argument' && code !== 'unknown-command';
}

const POOL: readonly unknown[] = ['', 'node-title', 0, -1, 7.5, true, null, [], {}, { x: 1, y: 2 }];

/** The example, each top-level property missing or replaced, an extra field, and non-objects. */
function corpus(example: unknown): unknown[] {
  if (typeof example !== 'object' || example === null) return [example];
  const keys = Object.keys(example);
  return [
    example,
    ...keys.map((key) => Object.fromEntries(Object.entries(example).filter(([k]) => k !== key))),
    ...keys.flatMap((key) => POOL.map((value) => ({ ...example, [key]: value }))),
    { ...example, extra: 1 },
    null,
    'text',
    7,
    [],
    [example],
  ];
}

function exampleOf(description: string): unknown {
  const marker = '\n\nExample arguments: ';
  return JSON.parse(description.slice(description.lastIndexOf(marker) + marker.length)) as unknown;
}

describe('each tool accepts exactly what its inputSchema accepts (D31.9, D46.4)', () => {
  it.each(TOOL_CATALOGUE.map((tool) => [tool.name, tool]))(
    '%s',
    (name, { description, inputSchema }) => {
      const accepts = new Ajv2020({ strict: true, strictNumbers: true }).compile(inputSchema);
      const rows = corpus(exampleOf(description));
      if (name === 'run_transaction') {
        rows.push(
          { calls: [] },
          { calls: [{ name: 'set_node_opacity' }] },
          { calls: [{ name: 'set_node_opacity', arguments: {}, extra: 1 }] },
          { calls: [{ name: 'set_node_opacity', arguments: 'x' }] },
          { calls: [{ name: 'describe_document', arguments: {} }] },
          { calls: [null] },
        );
      }
      expect(rows.filter((args) => accepts(args)).length).toBeGreaterThan(0);
      const disagreements = rows
        .filter((args) => accepts(args) !== toolAccepts(name, args))
        .map((args) => `${json(args)}: schema ${String(accepts(args))}`);
      expect(disagreements).toEqual([]);
    },
  );

  it('covers every command type', () => {
    expect(TOOL_CATALOGUE.slice(1, -1).map(({ name }) => name)).toEqual(
      COMMAND_TYPES.map(toolNameOf),
    );
  });
});
