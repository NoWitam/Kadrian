/**
 * The AI tool contract of `SetNodePosition` (D31), kept as the narrow entry of
 * the spike next to the catalogue of D46. Its definition is the catalogue's
 * own entry, and `executeSetNodePosition` builds the command exactly as
 * `executeTool` does, but needs nothing of the bus but `dispatch` (D31.5).
 */
import { type CommandBus, type CommandResult } from '@kadrion/editor-sdk';

import { TOOL_CATALOGUE, type ToolDefinition } from './catalogue.js';
import { commandOf } from './execute.js';

const NAME = 'set_node_position';

function entryOf(name: string): ToolDefinition {
  const entry = TOOL_CATALOGUE.find((tool) => tool.name === name);
  if (entry === undefined) throw new Error(`The catalogue has no tool \`${name}\`.`);
  return entry;
}

/**
 * The definition of `set_node_position`: the catalogue's entry, whose
 * `inputSchema` is the very object `editor-sdk` exports (D31.2, D46.2).
 */
export const setNodePositionTool: ToolDefinition = entryOf(NAME);

/**
 * Runs one `set_node_position` call on the host's bus: exactly one `dispatch`,
 * whose result is returned as it is — the validated document after the edit
 * and its inverse, or `null` when nothing changed (D31.4). The tool receives
 * the one capability it needs; it cannot undo, redo, or replace the document
 * (D31.5). Failures are the bus's own `EditorError`, not rewrapped (D31.6).
 */
export function executeSetNodePosition(
  bus: Pick<CommandBus, 'dispatch'>,
  args: unknown,
): CommandResult {
  return bus.dispatch(commandOf(NAME, 'SetNodePosition', args));
}
