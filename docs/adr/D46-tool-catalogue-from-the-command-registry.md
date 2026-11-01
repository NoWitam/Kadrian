# D46 — The tool catalogue derived from the command registry

- Status: Accepted — by the project owner on 2026-10-31, after PR-24 was merged
- Date: 2026-10-31
- Supersedes: —
- Extends: D31 (the tool contract of `set_node_position`), with an
  `Amended by: PR-24 (D46)` line
- Amended by: PR-28a (D50) on 2026-10-31: three tools, and the source durations of video assets in `describe_document` (D50.7)
- Amended by: PR-29a (D52) on 2026-10-31: six tools of audio (D52.6)
- Amended by: PR-29b (D53) on 2026-11-01: `describe_document` states the length of audio assets and of the sound of videos (D53.4)
- Amended by: PR-30 (D54) on 2026-11-01: seven tools of scenes, and the derived start of each scene in `describe_document` (D54.6)
- Amended by: PR-31 (D55) on 2026-11-01: five tools of the timeline (D55.7)
- Related: D09, D12, D30, D31, D38, D39, D40, D41, D42,
  [roadmap of phase three](../roadmap/phase-3.md) PR-24

## Context

Item 10 of the host editor's needs asks for "AI tools derived from the command
registry, on the same bus". The registry of `@kadrion/editor-sdk` holds 24
commands (D38.1), each with a closed argument schema of its own (D31.2,
D38.11, D39.1, D40, D41.3, D42.10), but `@kadrion/ai-sdk` exposes one tool,
`set_node_position` (D31). The notes under D31 defer every other tool to
PR-24, and the phase-three plan adds the rule that from PR-24 on "a command
without AI metadata does not compile", so that the commands of PR-28 to PR-34
bring their tools with them.

A model cannot see the canvas: to name a node it must first learn the node's
ID, and to make one change out of several edits — a new text, placed and
coloured — it needs them in one history entry, as a user's gesture would be
(D38.4).

## Decision

### D46.1 Every command carries AI metadata in `editor-sdk`

`@kadrion/editor-sdk` keeps a table of AI metadata keyed by the members of
`Command['type']`, typed so that a command without an entry, or an entry
without a command, fails compilation. Each entry holds:

- `description` — written for a model: what the command changes, its units
  (composition pixels, integer microseconds, factors), and the error codes it
  is refused with;
- `example` — arguments typed as `CommandArguments<T>`, the command without
  its discriminator, so an example with a missing or extra field fails
  compilation;
- `argumentsSchema` — the very schema object the package already exports for
  the command (D31.2).

The table sits beside the registry (`tools.ts`), not inside its entries: the
mapped type gives the same compile-time guarantee, and the registry stays the
place of parsing and editing. It is exported as `COMMAND_TOOL_METADATA`,
deep-frozen, in the order of `COMMAND_TYPES`.

### D46.2 `ai-sdk` derives the catalogue and adds nothing to the arguments

`TOOL_CATALOGUE` is built once, by a call, and deep-frozen (D31.8). Its order
is fixed: `describe_document`, then one tool per command in the order of
`COMMAND_TYPES`, then `run_transaction`. A command tool's

- `name` is the command type in `snake_case` (`toolNameOf`), so
  `SetNodePosition` stays `set_node_position`;
- `description` is the metadata's description, one fixed sentence on the bus,
  and the line `Example arguments: <the example as JSON>`;
- `inputSchema` is `argumentsSchema` itself, not a copy.

`setNodePositionTool` of D31.1 is now the catalogue's own entry; its
description changes, its name and schema do not. `ToolDefinition.inputSchema`
widens from `ClosedObjectSchema<string>` to `ToolInputSchema`, the union of the
command schemas (some of which hold an open object, D39.1, D41.3) and the two
schemas below.

A committed snapshot of the catalogue (`packages/ai-sdk/test/catalogue.snap`)
makes every change of a name, a text, or a schema a reviewed change of the
contract a model reads.

### D46.3 `describe_document` reads and never writes

`editor-sdk` exports `describeDocument(document)`, a pure function of a
validated document: the canvas, `fps`, and `durationUs`; every scene with its
nodes from the bottom layer to the top, each with `id`, `type`, `parentId`,
`layer`, `startUs`, `durationUs`, its other stored `fields` (animations with
their keyframes included), and a group's `children`; and the assets and clips
as stored. The `html` of a Custom HTML element is left out: no command edits
it, and it can be long. The result is a fresh JSON value, deep-frozen.

It lives in `editor-sdk` because reading the document's shape needs the
document's types, which `ai-sdk` may not import (D31.7). The tool
`describe_document` takes exactly `{}` and calls `getDocument` once.

### D46.4 One executor, three capabilities of the bus

`executeTool(bus, name, args)` runs one call of the catalogue:

- a command tool builds `{ type, ...args }` exactly as D31.3 does (an own
  `type` is refused; a value that is not an object goes to the bus unchanged)
  and calls `dispatch` once;
- `run_transaction` takes `{ calls: [{ name, arguments }, …] }`, at least one
  call, each naming a command tool; it builds every command the same way and
  calls `dispatchTransaction` once, so the calls are all applied or none, form
  one history entry, and a failure names the index of its command (D38.4).
  `describe_document` and `run_transaction` cannot be nested;
- `describe_document` calls `getDocument` once.

The bus parameter is `ToolBus = Pick<CommandBus, 'getDocument' | 'dispatch' |
'dispatchTransaction'>`: no undo, no redo, no subscription, so the AI's edits
share the host's history but the AI cannot walk it. A name outside the
catalogue is `unknown-command`; arguments the tool's schema refuses are
`invalid-argument`; every other failure is the bus's own `EditorError`
(D31.6). The result is frozen: `{ kind: 'command', result }`,
`{ kind: 'transaction', result }`, or `{ kind: 'description', description }`.
`executeSetNodePosition` stays, with `dispatch` alone.

### D46.5 The rule for later commands

A pull request that adds a command adds its metadata entry — or does not
compile — and with it its tool, its row in the differential test, and the
changed snapshot.

## Alternatives considered

- **Metadata inside each registry entry** — the same guarantee, but 24
  descriptions inside `registry.ts`, whose entries are about parsing and
  editing.
- **A generic `execute_command` tool taking `type`** — one tool with every
  argument shape behind one open schema; a model would read no per-command
  description, and D31.3 rules out a `type` the model chooses.
- **`describe_document` returning the raw document** — the model would have
  to infer layers, parents, and group membership from array positions, and
  would receive the Custom HTML source.
- **Undo and redo tools** — the history is the host's (D31.4); the host
  decides whether a model may undo, through its own UI.

## Consequences

- `@kadrion/editor-sdk` gains `COMMAND_TOOL_METADATA`, `describeDocument`, and
  their types. Its dependencies are unchanged.
- `@kadrion/ai-sdk` gains `TOOL_CATALOGUE`, `toolNameOf`, `executeTool`, and
  their types; `ToolDefinition.inputSchema` widens. Its dependencies are
  unchanged (D12).
- No schema, runtime, renderer, Player, or Producer change: the runtime build,
  the parity record, the golden frames, and Q14 are untouched.
- The commands of PR-28 to PR-34 carry their tools by D46.5.

## Verification

- `packages/editor-sdk/test/tool-metadata.test.ts`: one entry per command in
  registry order, the exported schema object itself, an example both Ajv and
  `parseCommand` accept, refusals described, deep-frozen.
- `packages/editor-sdk/test/describe.test.ts`: layers, parents, children,
  lifetimes, fields without `html`, assets and clips, deep-frozen, no shared
  objects, the same text for the same document.
- `packages/ai-sdk/test/catalogue.test.ts`: the catalogue covers
  `COMMAND_TYPES` exactly and in order, names are unique `snake_case`, every
  schema compiles under Ajv's strict mode and accepts its example, the text is
  the same on every load and equals the committed snapshot, and the export
  surface.
- `packages/ai-sdk/test/tools.test.ts`: for all 24 commands, the tool and the
  command give the same document byte for byte, the same inverse, and the same
  created IDs, with one `dispatch`; refused calls leave the document and both
  stacks untouched; `run_transaction` equals `dispatchTransaction` and is one
  undo; `describe_document` uses `getDocument` alone; and every tool accepts
  exactly the arguments its `inputSchema` accepts.
