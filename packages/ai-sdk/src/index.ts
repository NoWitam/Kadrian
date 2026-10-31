/**
 * @kadrion/ai-sdk — AI tool contracts built on editor-sdk commands.
 *
 * The tool catalogue of D46: one tool per command of the closed registry of
 * `@kadrion/editor-sdk`, derived from each command's AI metadata, plus
 * `describe_document`, which reads, and `run_transaction`, which applies
 * several edits as one history entry. The package is a pure adapter: it keeps
 * no document and no history, and every edit is a `dispatch` on the bus the
 * host passes in, the same path an edit in the UI takes (D09, D31). No model
 * is called here. `set_node_position` of D31 stays as its narrow entry.
 */
export { TOOL_CATALOGUE, toolNameOf } from './catalogue.js';
export type { RunTransactionInputSchema, ToolDefinition, ToolInputSchema } from './catalogue.js';
export { executeTool } from './execute.js';
export type { ToolBus, ToolResult } from './execute.js';
export { executeSetNodePosition, setNodePositionTool } from './set-node-position.js';
