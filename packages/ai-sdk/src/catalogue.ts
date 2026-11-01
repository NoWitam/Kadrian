/**
 * The tool catalogue (D46): one tool per command of the closed registry of
 * `@kadrion/editor-sdk`, derived from the command's AI metadata, plus two tools
 * for a model that cannot see the canvas — `describe_document`, which reads,
 * and `run_transaction`, which applies several command tools as one history
 * entry. The catalogue is data: deep-frozen, built once by a call, in a fixed
 * order with a fixed text, so the same build always offers the same tools.
 */
import {
  COMMAND_TOOL_METADATA,
  type AnyCommandToolMetadata,
  type ClosedObjectSchema,
  type Command,
  type CommandArgumentsSchema,
} from '@kadrion/editor-sdk';

/** The input schema of `run_transaction` (D46.4). */
export interface RunTransactionInputSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly calls: {
      readonly type: 'array';
      readonly description: string;
      readonly minItems: 1;
      readonly items: {
        readonly type: 'object';
        readonly description: string;
        readonly properties: {
          readonly name: {
            readonly type: 'string';
            readonly description: string;
            readonly enum: readonly string[];
          };
          readonly arguments: { readonly type: 'object'; readonly description: string };
        };
        readonly required: readonly ['name', 'arguments'];
        readonly additionalProperties: false;
      };
    };
  };
  readonly required: readonly ['calls'];
  readonly additionalProperties: false;
}

/** The JSON Schema (draft 2020-12) of a tool's arguments. */
export type ToolInputSchema =
  CommandArgumentsSchema | ClosedObjectSchema<never> | RunTransactionInputSchema;

/** What a host hands to a model API; `inputSchema` is the name MCP uses (D31.1). */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
}

export const DESCRIBE_DOCUMENT = 'describe_document';
export const RUN_TRANSACTION = 'run_transaction';

/**
 * The tool name of a command: its type in `snake_case`, so `SetNodePosition`
 * is `set_node_position` (D46.2).
 */
export function toolNameOf(commandType: Command['type']): string {
  return commandType.replace(
    /[A-Z]/g,
    (letter, at: number) => (at === 0 ? '' : '_') + letter.toLowerCase(),
  );
}

/** Freezes a JSON value and everything in it; a frozen part stays as it is. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

const BUS_NOTE =
  "The edit goes through the host's command bus, as the same edit in the editor does: the result is validated in full, a refused call changes nothing, and the host can undo it. Returns the edited document and the IDs the call created.";

/** The tool of one command (D46.2): its metadata, the bus note, and its example. */
function commandTool(metadata: AnyCommandToolMetadata): ToolDefinition {
  return Object.freeze({
    name: toolNameOf(metadata.commandType),
    description: `${metadata.description} ${BUS_NOTE}\n\nExample arguments: ${JSON.stringify(metadata.example)}`,
    // The very object editor-sdk exports, frozen there (D31.2).
    inputSchema: metadata.argumentsSchema,
  });
}

function describeDocumentTool(): ToolDefinition {
  return deepFreeze({
    name: DESCRIBE_DOCUMENT,
    description:
      "Describes the current document and changes nothing. Returns the canvas size in composition pixels, fps, and durationUs; every scene in the order they play, with its ID, its startUs in the composition (derived: the sum of the durations before it), its durationUs, its audio clips in scene time, and its nodes from the bottom layer to the top, each with its ID, type, parentId, layer (0 is the bottom), startUs and durationUs in integer microseconds of the time of its scene, its stored fields (position, scale, opacity, animations with their keyframes, text, colour, and so on; the html of a Custom HTML element is left out), and a group's children; and the declared assets and the composition's clips, in composition time, where a video or audio asset also states its sourceDurationUs, the length of its source in integer microseconds, when the host knows it, and a video its soundDurationUs, the length of its sound, or null when it has none. Call it before editing to learn the IDs that other tools take.\n\nExample arguments: {}",
    inputSchema: {
      type: 'object',
      description: 'No arguments.',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  });
}

function runTransactionTool(commandNames: readonly string[]): ToolDefinition {
  return deepFreeze({
    name: RUN_TRANSACTION,
    description: `Applies several edit tools in order as one step: all of them or none, and one undo reverts them all. Each call names an edit tool of this catalogue (not ${DESCRIBE_DOCUMENT} or ${RUN_TRANSACTION}) and passes that tool's arguments; a later call sees the document the earlier ones produced. When one call is refused, nothing changes, and the error names the index of that call. Returns the edited document and the IDs the calls created.\n\nExample arguments: {"calls":[{"name":"set_node_position","arguments":{"nodeId":"node-title","position":{"x":120,"y":240}}},{"name":"set_node_opacity","arguments":{"nodeId":"node-title","opacity":0.5}}]}`,
    inputSchema: {
      type: 'object',
      description: 'The edit tool calls to apply as one step.',
      properties: {
        calls: {
          type: 'array',
          description: 'The calls, in the order they are applied; at least one.',
          minItems: 1,
          items: {
            type: 'object',
            description: 'One call of an edit tool.',
            properties: {
              name: {
                type: 'string',
                description: 'The name of an edit tool of this catalogue.',
                enum: [...commandNames],
              },
              arguments: {
                type: 'object',
                description: 'The arguments of that tool, exactly as its own input schema states.',
              },
            },
            required: ['name', 'arguments'],
            additionalProperties: false,
          },
        },
      },
      required: ['calls'],
      additionalProperties: false,
    },
  });
}

/**
 * Builds the catalogue: `describe_document`, then one tool per command in the
 * order of `COMMAND_TYPES`, then `run_transaction` (D46.2).
 */
function catalogue(): readonly ToolDefinition[] {
  const commandTools = COMMAND_TOOL_METADATA.map(commandTool);
  return Object.freeze([
    describeDocumentTool(),
    ...commandTools,
    runTransactionTool(commandTools.map(({ name }) => name)),
  ]);
}

/** Every tool a model is offered, deep-frozen, in a fixed order (D46.2). */
export const TOOL_CATALOGUE: readonly ToolDefinition[] = catalogue();

/** The command type behind a command tool's name, or `null` for any other name. */
export function commandTypeOf(name: string): Command['type'] | null {
  return (
    COMMAND_TOOL_METADATA.find(({ commandType }) => toolNameOf(commandType) === name)
      ?.commandType ?? null
  );
}
