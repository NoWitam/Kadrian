/**
 * The tool catalogue of D46: it covers the closed registry of `editor-sdk`
 * exactly, each command tool carries the command's own argument schema, and
 * the catalogue is deterministic data that validates as JSON Schema. The
 * committed snapshot makes every change of a tool's name, text, or schema a
 * reviewed change of the contract a model reads.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import * as editorSdk from '@kadrion/editor-sdk';
import { COMMAND_TOOL_METADATA, COMMAND_TYPES, parseCommand } from '@kadrion/editor-sdk';
import { describe, expect, it, vi } from 'vitest';

import * as aiSdk from '../src/index.js';
import { TOOL_CATALOGUE, toolNameOf, type ToolDefinition } from '../src/index.js';

import { isDeepFrozen } from './support.js';

const COMMAND_TOOLS = TOOL_CATALOGUE.slice(1, -4);

function ajv(): Ajv2020 {
  return new Ajv2020({ strict: true, strictNumbers: true });
}

/** The example a description ends with, read back from its text. */
function exampleOf(tool: ToolDefinition): unknown {
  const marker = '\n\nExample arguments: ';
  const at = tool.description.lastIndexOf(marker);
  if (at < 0) throw new Error(`${tool.name} has no example.`);
  return JSON.parse(tool.description.slice(at + marker.length)) as unknown;
}

describe('the catalogue covers the command registry exactly (D46.2)', () => {
  it('offers describe_document, one tool per command in registry order, the transition at a cut, the freeze frame, the Custom HTML check, and run_transaction', () => {
    expect(TOOL_CATALOGUE.map(({ name }) => name)).toEqual([
      'describe_document',
      ...COMMAND_TYPES.map(toolNameOf),
      'add_clip_transition_at_cut',
      'freeze_frame',
      'check_custom_html',
      'run_transaction',
    ]);
    expect(COMMAND_TOOLS).toHaveLength(102);
    expect(TOOL_CATALOGUE).toHaveLength(107);
  });

  it('offers speed, reverse, and the freeze frame, so a model can do each edit of D82 (D82.9)', () => {
    const names = TOOL_CATALOGUE.map(({ name }) => name);
    for (const name of ['set_clip_speed', 'set_clip_reverse', 'freeze_frame']) {
      expect(names).toContain(name);
    }
  });

  it('names every tool in snake_case, each name once', () => {
    const names = TOOL_CATALOGUE.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
    expect(toolNameOf('SetNodePosition')).toBe('set_node_position');
    expect(toolNameOf('SetTextFontSize')).toBe('set_text_font_size');
    expect(toolNameOf('AddAsset')).toBe('add_asset');
  });

  it('gives every command tool the very argument schema editor-sdk exports for its command', () => {
    const exported: Readonly<Record<string, unknown>> = editorSdk;
    COMMAND_TYPES.forEach((type, at) => {
      const schemaName = `${type.charAt(0).toLowerCase()}${type.slice(1)}ArgumentsSchema`;
      expect(exported[schemaName], schemaName).toBeDefined();
      expect(COMMAND_TOOLS[at]?.inputSchema, type).toBe(exported[schemaName]);
      expect(COMMAND_TOOL_METADATA[at]?.argumentsSchema, type).toBe(exported[schemaName]);
    });
  });

  it('gives the transition at a cut the very argument schema editor-sdk exports for it (D66)', () => {
    expect(TOOL_CATALOGUE.at(-4)?.inputSchema).toBe(editorSdk.clipTransitionAtCutArgumentsSchema);
  });

  it('gives the freeze frame the very argument schema editor-sdk exports for it (D82.9)', () => {
    expect(TOOL_CATALOGUE.at(-3)?.inputSchema).toBe(editorSdk.freezeFrameArgumentsSchema);
  });

  it('offers the edit tools, and no other, inside run_transaction', () => {
    const transaction = TOOL_CATALOGUE.at(-1)?.inputSchema;
    expect(transaction).toMatchObject({
      properties: {
        calls: { items: { properties: { name: { enum: COMMAND_TYPES.map(toolNameOf) } } } },
      },
    });
  });
});

describe('the catalogue is data a model API can take (D46.2)', () => {
  it('is deep-frozen, so a host cannot change what every other host sends', () => {
    expect(isDeepFrozen(TOOL_CATALOGUE)).toBe(true);
    expect(() => {
      (TOOL_CATALOGUE as ToolDefinition[]).pop();
    }).toThrow(TypeError);
  });

  it('validates as JSON Schema draft 2020-12, under strict mode', () => {
    for (const { name, inputSchema } of TOOL_CATALOGUE) {
      expect(() => ajv().compile(inputSchema), name).not.toThrow();
    }
  });

  it('describes every tool for a model, with refusals and an example its own schema accepts', () => {
    for (const tool of TOOL_CATALOGUE) {
      expect(tool.description.length, tool.name).toBeGreaterThan(80);
      expect(ajv().compile(tool.inputSchema)(exampleOf(tool)), tool.name).toBe(true);
    }
    for (const tool of [
      ...COMMAND_TOOLS,
      TOOL_CATALOGUE.at(-4),
      TOOL_CATALOGUE.at(-3),
      TOOL_CATALOGUE.at(-2),
    ]) {
      expect(tool?.description, tool?.name).toMatch(/Refused with /);
    }
  });

  it('states each command example as the command metadata of editor-sdk, which parses', () => {
    COMMAND_TOOL_METADATA.forEach((metadata, at) => {
      const tool = COMMAND_TOOLS[at];
      if (tool === undefined) throw new Error(`No tool for ${metadata.commandType}.`);
      expect(exampleOf(tool)).toEqual(metadata.example);
      expect(() => parseCommand({ type: metadata.commandType, ...metadata.example })).not.toThrow();
    });
  });

  it('is the same text in the same order on every load', async () => {
    vi.resetModules();
    const fresh = (await import('../src/index.js')).TOOL_CATALOGUE;
    expect(fresh).not.toBe(TOOL_CATALOGUE);
    expect(JSON.stringify(fresh)).toBe(JSON.stringify(TOOL_CATALOGUE));
  });

  it('matches the committed catalogue, so every change of the contract is reviewed', async () => {
    await expect(`${JSON.stringify(TOOL_CATALOGUE, null, 2)}\n`).toMatchFileSnapshot(
      './catalogue.snap',
    );
  });
});

/**
 * The catalogue of schema `0.24` (the committed snapshot of PR-62), measured as
 * D83.10 says: the sum, over every tool, of the length of the JSON of its entry.
 */
const CATALOGUE_LENGTH_OF_0_24 = 232_035;

/** What the frame, alignment, the width mode, and W5 may add to it (D83.10, question 14). */
const BUDGET_OF_W6 = 800;

/**
 * The catalogue of schema `0.25` (the committed snapshot of `main` before
 * PR-76), measured the same way: where the budget of W6 closed, and from where
 * D85.8 measures the growth of a video's fades and of volume curves.
 */
const CATALOGUE_LENGTH_OF_0_25 = 232_830;

/** What a video's fades and volume curves may add to it (D85.8, question 11). */
const BUDGET_OF_D85 = 700;

/**
 * The catalogue of schema `0.26` (the committed snapshot of `main` before
 * PR-89), measured the same way: where the budget of D85.8 closed, and from
 * where the flip of D89.3 is measured.
 */
const CATALOGUE_LENGTH_OF_0_26 = 233_348;

/**
 * The catalogue of schema `0.27` (the committed snapshot of `main` before
 * PR-90), measured the same way: from where the clear of D89.2 is measured.
 */
const CATALOGUE_LENGTH_OF_0_27 = 235_086;

/**
 * The catalogue of schema `0.29` (the committed snapshot of `main` before
 * PR-95), measured the same way: from where the corners of D91.1 are measured.
 */
const CATALOGUE_LENGTH_OF_0_29 = 236_443;

/**
 * The catalogue of schema `0.30` (the committed snapshot of `main` before
 * PR-96), measured the same way: from where the number of D91.2 is measured.
 */
const CATALOGUE_LENGTH_OF_0_30 = 242_215;

/** The length of the JSON of every tool's entry, all tools together (D83.10). */
function catalogueLength(catalogue: readonly ToolDefinition[]): number {
  return catalogue.reduce((sum, tool) => sum + JSON.stringify(tool).length, 0);
}

describe('the budget of W6 (D83.10)', () => {
  it('grew the catalogue by at most 800 characters from the snapshot of 0.24 to that of 0.25', () => {
    const growth = CATALOGUE_LENGTH_OF_0_25 - CATALOGUE_LENGTH_OF_0_24;
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(BUDGET_OF_W6);
  });
});

describe('the budget of D85.8', () => {
  it('grew the catalogue by at most 700 characters from the snapshot of 0.25 to that of 0.26', () => {
    const growth = CATALOGUE_LENGTH_OF_0_26 - CATALOGUE_LENGTH_OF_0_25;
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(BUDGET_OF_D85);
  });
});

describe('the flip of D89.3 in the catalogue (D46.5)', () => {
  it('grew the catalogue from the snapshot of 0.26 to that of 0.27 by set_node_flip, its name in run_transaction, and the flip of add_node alone', () => {
    const flip = TOOL_CATALOGUE.find(({ name }) => name === 'set_node_flip');
    if (flip === undefined) throw new Error('No set_node_flip.');
    // `"set_node_flip",` in the names run_transaction takes (16), and in
    // add_node `, flip` in its text and `"flip":{"x":false,"y":false},` in its
    // example, escaped as JSON (41).
    expect(CATALOGUE_LENGTH_OF_0_27 - JSON.stringify(flip).length - CATALOGUE_LENGTH_OF_0_26).toBe(
      16 + 41,
    );
  });
});

describe('the clear of D89.2 in the catalogue (D46.5)', () => {
  it('grew the catalogue from the snapshot of 0.27 to that of 0.29 by set_composition_clear, its name in run_transaction, and the clear in describe_document alone', () => {
    const clear = TOOL_CATALOGUE.find(({ name }) => name === 'set_composition_clear');
    if (clear === undefined) throw new Error('No set_composition_clear.');
    // `"set_composition_clear",` in the names run_transaction takes (24), and
    // ` and the clear (white or transparent)` in the text of describe_document (37).
    expect(CATALOGUE_LENGTH_OF_0_29 - JSON.stringify(clear).length - CATALOGUE_LENGTH_OF_0_27).toBe(
      24 + 37,
    );
  });
});

describe('the corners of D91.1 in the catalogue (D46.5)', () => {
  it('grew the catalogue from the snapshot of 0.29 to that of 0.30 by set_node_corners, its name in run_transaction, and the corners of add_node, add_animation, and set_keyframe_value alone', () => {
    const corners = TOOL_CATALOGUE.find(({ name }) => name === 'set_node_corners');
    if (corners === undefined) throw new Error('No set_node_corners.');
    const others = CATALOGUE_LENGTH_OF_0_30 - JSON.stringify(corners).length;
    // `"set_node_corners",` in the names run_transaction takes (19); in
    // add_node the corners in its text and four zero offsets in its example
    // (231); in add_animation the row in its text and the value of a corners
    // keyframe (234); in set_keyframe_value the row in its text and that value
    // in its text and in the schema of its value (459), escaped as JSON.
    expect(others - CATALOGUE_LENGTH_OF_0_29).toBe(19 + 231 + 234 + 459);
  });
});

describe('the number of D91.2 in the catalogue (D46.5)', () => {
  it('grows the catalogue over the snapshot of 0.30 by set_text_number, its name in run_transaction, and the number of add_node, add_animation, and set_keyframe_value alone', () => {
    const number = TOOL_CATALOGUE.find(({ name }) => name === 'set_text_number');
    if (number === undefined) throw new Error('No set_text_number.');
    const others = catalogueLength(TOOL_CATALOGUE) - JSON.stringify(number).length;
    // `"set_text_number",` in the names run_transaction takes (18); in
    // add_node a text's number in its text and the number none in its
    // example (115); in add_animation the row in its text (154); in
    // set_keyframe_value the row in its text and the value of a number
    // keyframe in its text and in the schema of its value (240), escaped as JSON.
    expect(others - CATALOGUE_LENGTH_OF_0_30).toBe(18 + 115 + 154 + 240);
  });
});

describe('the export surface (D46.4)', () => {
  it('exports the catalogue, its executor, and the D31 entry of set_node_position', () => {
    expect(Object.keys(aiSdk).sort()).toEqual([
      'TOOL_CATALOGUE',
      'executeSetNodePosition',
      'executeTool',
      'setNodePositionTool',
      'toolNameOf',
    ]);
  });

  it('keeps set_node_position as the catalogue entry itself', () => {
    expect(aiSdk.setNodePositionTool).toBe(COMMAND_TOOLS[0]);
  });
});
