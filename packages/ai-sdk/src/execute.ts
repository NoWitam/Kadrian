/**
 * Runs one tool call of the catalogue on the host's bus (D46.4). A command
 * tool is one `dispatch` of its command, built by adding the discriminator and
 * nothing else (D31.3); `run_transaction` is one `dispatchTransaction` of the
 * commands its calls name; `describe_document` reads the current document and
 * writes nothing; `add_clip_transition_at_cut` is one `dispatchTransaction` of
 * the commands `clipTransitionAtCut` builds (D66), and `freeze_frame` of those
 * `freezeFrame` builds (D82.9). Failures are the bus's own `EditorError` (D31.6), and a
 * refused call leaves the document and the history as they were.
 */
import {
  checkCustomHtmlSource,
  clipTransitionAtCut,
  describeDocument,
  EditorError,
  freezeFrame,
  type CommandBus,
  type CommandResult,
  type CustomHtmlFinding,
  type DocumentDescription,
  type TransactionResult,
} from '@kadrion/editor-sdk';

import {
  ADD_CLIP_TRANSITION_AT_CUT,
  CHECK_CUSTOM_HTML,
  commandTypeOf,
  DESCRIBE_DOCUMENT,
  FREEZE_FRAME,
  RUN_TRANSACTION,
} from './catalogue.js';

/** The document a bus holds: validated, and the only document a tool reads (D30.6). */
type BusDocument = ReturnType<CommandBus['getDocument']>;

/**
 * The capabilities a tool call may use: the three methods of the host's bus
 * that read the document or edit it through the command path, and the media
 * facts it reads to `describe_document` where the host lends them (D49.6). No
 * undo, no redo, no subscription (D31.5, D46.4).
 */
export type ToolBus = Pick<CommandBus, 'getDocument' | 'dispatch' | 'dispatchTransaction'> &
  Partial<Pick<CommandBus, 'mediaFactsOf'>> & {
    /**
     * Renders one Custom HTML element of the document alone at sampled times,
     * twice, and reports what failed or differed (D78); lent by a host that can
     * render, such as one that runs the Producer. Without it,
     * `check_custom_html` reads the html only.
     */
    readonly checkCustomHtml?: (
      document: BusDocument,
      nodeId: string,
    ) => Promise<CustomHtmlRenderCheck>;
  };

/** One problem a render of a Custom HTML element showed (D78). */
export interface CustomHtmlRenderProblem {
  readonly code: 'no-acknowledgement' | 'navigated' | 'frames-differ' | 'render-failed';
  /** The time of the element, from its start, it concerns; `null` when it concerns no one time. */
  readonly timeUs: number | null;
  readonly message: string;
}

/** What a host's render check of a Custom HTML element found (D78). */
export interface CustomHtmlRenderCheck {
  /** The times of the element, from its start, it rendered, in the order of the first render. */
  readonly timesUs: readonly number[];
  readonly problems: readonly CustomHtmlRenderProblem[];
}

/** What `check_custom_html` found (D78). */
export interface CustomHtmlCheckReport {
  readonly nodeId: string;
  /** What reading the html found (`checkCustomHtmlSource`). */
  readonly findings: readonly CustomHtmlFinding[];
  /** What the host's render found, or `null` when the host lends no render. */
  readonly render: CustomHtmlRenderCheck | null;
  /** Whether nothing was found at all. */
  readonly ok: boolean;
}

/** What a tool call did; frozen. */
export type ToolResult =
  | { readonly kind: 'command'; readonly result: CommandResult }
  | { readonly kind: 'transaction'; readonly result: TransactionResult }
  | { readonly kind: 'description'; readonly description: DocumentDescription }
  | { readonly kind: 'check'; readonly result: Promise<CustomHtmlCheckReport> };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when `value` has exactly `keys` as its own enumerable keys. */
function hasExactly(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * The command a command tool's arguments ask for (D31.3). Anything that is not
 * an object goes to the bus unchanged, whose parser refuses it; an own `type`
 * is refused here, because the schema forbids it and either spread order
 * would disagree with the schema. The spread reads each field once.
 */
export function commandOf(name: string, type: string, args: unknown): unknown {
  if (!isObject(args)) return args;
  if (Object.hasOwn(args, 'type')) {
    throw new EditorError(
      'invalid-argument',
      `The arguments of \`${name}\` have no \`type\`; the tool supplies it.`,
    );
  }
  return { type, ...args };
}

function refused(message: string): EditorError {
  return new EditorError('invalid-argument', message);
}

/** The commands of a `run_transaction` call, in order, built as each command tool builds its own. */
function transactionOf(args: unknown): readonly unknown[] {
  if (!isObject(args) || !hasExactly(args, ['calls'])) {
    throw refused(`The arguments of \`${RUN_TRANSACTION}\` are an object with \`calls\` alone.`);
  }
  const calls = args['calls'];
  if (!Array.isArray(calls) || calls.length === 0) {
    throw refused(`\`calls\` of \`${RUN_TRANSACTION}\` is a non-empty array.`);
  }
  const items: readonly unknown[] = calls;
  return items.map((call, at) => {
    const where = `Call ${String(at)} of \`${RUN_TRANSACTION}\``;
    if (!isObject(call) || !hasExactly(call, ['name', 'arguments'])) {
      throw refused(`${where} is not an object with \`name\` and \`arguments\` alone.`);
    }
    const name = call['name'];
    const type = typeof name === 'string' ? commandTypeOf(name) : null;
    if (typeof name !== 'string' || type === null) {
      throw refused(`${where} names no edit tool of the catalogue.`);
    }
    const callArgs = call['arguments'];
    if (!isObject(callArgs)) throw refused(`${where} has arguments that are not an object.`);
    return commandOf(name, type, callArgs);
  });
}

type BusNode =
  | BusDocument['scenes'][number]['nodes'][number]
  | Extract<BusDocument['scenes'][number]['nodes'][number], { type: 'group' }>['children'][number];

/** The node `nodeId` among `nodes` and the children of their groups, or `null`. */
function findNode(nodes: readonly BusNode[], nodeId: string): BusNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.type === 'group') {
      const found = findNode(node.children, nodeId);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * The html of the Custom HTML node `nodeId` of a scene, a group, or a
 * definition of the document, or the error the bus would give.
 */
function customHtmlOf(document: BusDocument, nodeId: string): string {
  for (const nodes of [
    ...document.scenes.map((scene) => scene.nodes),
    ...document.definitions.map((definition) => definition.nodes),
  ]) {
    const node = findNode(nodes, nodeId);
    if (node === null) continue;
    if (node.type !== 'custom-html') {
      throw new EditorError(
        'unsupported-node',
        `Node \`${nodeId}\` is a ${node.type} node, not Custom HTML.`,
      );
    }
    return node.html;
  }
  throw new EditorError('unknown-node', `No Custom HTML node has the ID \`${nodeId}\`.`);
}

/**
 * `check_custom_html` (D78): the findings of the html at once, then the
 * host's render, if it lends one, of the document as it is now. It writes
 * nothing.
 */
function checkCustomHtml(bus: ToolBus, args: unknown): Promise<CustomHtmlCheckReport> {
  if (
    !isObject(args) ||
    !hasExactly(args, ['nodeId']) ||
    typeof args['nodeId'] !== 'string' ||
    args['nodeId'] === ''
  ) {
    throw refused(
      `The arguments of \`${CHECK_CUSTOM_HTML}\` are an object with a non-empty \`nodeId\` alone.`,
    );
  }
  const nodeId = args['nodeId'];
  const document = bus.getDocument();
  const findings = checkCustomHtmlSource(customHtmlOf(document, nodeId));
  const render = bus.checkCustomHtml?.(document, nodeId) ?? Promise.resolve(null);
  return render.then((checked) =>
    Object.freeze({
      nodeId,
      findings,
      render: checked,
      ok: findings.length === 0 && (checked === null || checked.problems.length === 0),
    }),
  );
}

/**
 * Runs the tool `name` with `args` on the host's bus (D46.4): a command tool is
 * exactly one `dispatch`, `run_transaction`, `add_clip_transition_at_cut`, and
 * `freeze_frame` exactly one `dispatchTransaction`,
 * `describe_document` one `getDocument`, and `check_custom_html` one
 * `getDocument` and the host's render check, if it lends one (D78). An unknown name is refused with
 * `unknown-command`; arguments the tool's schema refuses with
 * `invalid-argument`, as the bus refuses them.
 */
export function executeTool(bus: ToolBus, name: unknown, args: unknown): ToolResult {
  if (typeof name !== 'string') {
    throw new EditorError('invalid-argument', 'A tool name is a string.');
  }
  if (name === DESCRIBE_DOCUMENT) {
    if (!isObject(args) || !hasExactly(args, [])) {
      throw refused(`\`${DESCRIBE_DOCUMENT}\` takes an empty object as its arguments.`);
    }
    return Object.freeze({
      kind: 'description',
      description: describeDocument(
        bus.getDocument(),
        bus.mediaFactsOf === undefined ? undefined : (hash) => bus.mediaFactsOf?.(hash) ?? null,
      ),
    });
  }
  if (name === ADD_CLIP_TRANSITION_AT_CUT) {
    return Object.freeze({
      kind: 'transaction',
      result: bus.dispatchTransaction(clipTransitionAtCut(bus.getDocument(), args)),
    });
  }
  if (name === FREEZE_FRAME) {
    return Object.freeze({
      kind: 'transaction',
      result: bus.dispatchTransaction(freezeFrame(bus.getDocument(), args)),
    });
  }
  if (name === CHECK_CUSTOM_HTML) {
    return Object.freeze({ kind: 'check', result: checkCustomHtml(bus, args) });
  }
  if (name === RUN_TRANSACTION) {
    return Object.freeze({
      kind: 'transaction',
      result: bus.dispatchTransaction(transactionOf(args)),
    });
  }
  const type = commandTypeOf(name);
  if (type === null) {
    throw new EditorError('unknown-command', `The catalogue has no tool \`${name}\`.`);
  }
  return Object.freeze({ kind: 'command', result: bus.dispatch(commandOf(name, type, args)) });
}
