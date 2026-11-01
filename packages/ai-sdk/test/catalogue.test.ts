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

const COMMAND_TOOLS = TOOL_CATALOGUE.slice(1, -1);

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
  it('offers describe_document, one tool per command in registry order, and run_transaction', () => {
    expect(TOOL_CATALOGUE.map(({ name }) => name)).toEqual([
      'describe_document',
      ...COMMAND_TYPES.map(toolNameOf),
      'run_transaction',
    ]);
    expect(COMMAND_TOOLS).toHaveLength(40);
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
    for (const tool of COMMAND_TOOLS) expect(tool.description, tool.name).toMatch(/Refused with /);
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
