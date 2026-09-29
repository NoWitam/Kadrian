/**
 * @kadrion/editor-sdk — typed commands, patches, transactions, undo/redo.
 *
 * The one command bus that UI and AI share (`AGENTS.md`, D09, D30). A command
 * is a plain JSON value; applying one yields a new validated document and the
 * inverse command that undo needs. The package depends on `@kadrion/schema`
 * only and works without a renderer (D12). The AI tool contract of `@kadrion/ai-sdk`
 * wraps the argument schemas exported here (D31). The bus is a frozen facade
 * (D30.13); its commands come from a closed registry, and it runs transactions,
 * keeps a bounded history, and tells its listeners about every change (D38).
 */
export { applyCommand } from './apply.js';
export type { CommandResult } from './apply.js';
export { createCommandBus } from './bus.js';
export type {
  BusChange,
  BusListener,
  CommandBus,
  CommandBusOptions,
  ListenerErrorHandler,
  TransactionResult,
} from './bus.js';
export {
  addNodeArgumentsSchema,
  duplicateNodeArgumentsSchema,
  removeNodeArgumentsSchema,
  reorderNodeArgumentsSchema,
  setNodeOpacityArgumentsSchema,
  setNodePositionArgumentsSchema,
  setTextContentArgumentsSchema,
} from './commands.js';
export type {
  AddNodeArguments,
  AddNodeArgumentsSchema,
  AddNodeCommand,
  ArgumentSchema,
  ClosedObjectSchema,
  Command,
  CommandPosition,
  DuplicateNodeArguments,
  DuplicateNodeArgumentsSchema,
  DuplicateNodeCommand,
  NodeData,
  OpenObjectSchema,
  RemoveNodeArguments,
  RemoveNodeArgumentsSchema,
  RemoveNodeCommand,
  ReorderNodeArguments,
  ReorderNodeArgumentsSchema,
  ReorderNodeCommand,
  SetNodeOpacityArguments,
  SetNodeOpacityArgumentsSchema,
  SetNodeOpacityCommand,
  SetNodePositionArguments,
  SetNodePositionArgumentsSchema,
  SetNodePositionCommand,
  SetTextContentArguments,
  SetTextContentArgumentsSchema,
  SetTextContentCommand,
} from './commands.js';
export { EditorError } from './errors.js';
export type { EditorErrorCode } from './errors.js';
export { COMMAND_TYPES, parseCommand } from './registry.js';
