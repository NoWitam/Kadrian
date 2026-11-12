/**
 * The playground (D25.9, D30.10, D32): showcases, documents of the user's own,
 * the drag of P3, and the AI tool of P4 on one command bus. This file is the
 * bootstrap and the page's wiring: it fetches the runtime build and its
 * manifest, and for every document makes a Player and the host facade of
 * `@kadrion/editor-session` over it (D44), whose bus every edit goes through
 * and which brings each edit to the preview with `Player.update`, at the time
 * it shows. `wireEditor` holds the editing behaviour the tests drive.
 *
 * Nothing here is a domain rule. A document goes through `JSON.parse`, the bus
 * (the full `validateComposition`), and the session's first `load`; whatever
 * they refuse is shown as they report it. Assets are looked up by ID with no
 * fallback (D32.2).
 *
 * Assets are the bytes `@kadrion/test-fixtures` generates and, for the video
 * showcase, the video its committed recipe makes with the pinned FFmpeg
 * (`node --run playground:media`), served under `/media/` from a directory Git
 * ignores (D32.10). The page gives the Player an audio context, so a document
 * with sound is heard; its clock drives the picture while playing (D53).
 *
 * Custom HTML is the page's decision, never the document's (D36): the page
 * starts with it disabled, and only the "Run Custom HTML" checkbox makes a
 * Player that trusts it. Changing the choice opens a new session with a new
 * Player over the current document; its undo history starts again, because a
 * session owns its bus (D44).
 */
import { executeTool, setNodePositionTool, TOOL_CATALOGUE, type ToolResult } from '@kadrion/ai-sdk';
import { createCommandBus, type CommandBus } from '@kadrion/editor-sdk';
import { createEditorSession, type EditorSession } from '@kadrion/editor-session';
import { createPlayer, type PlayerCustomHtmlPolicy } from '@kadrion/player';
import { frameCount, frameToTimeUs, timeUsToFrame } from '@kadrion/schema';
import { instantiateTemplate, isTemplate } from '@kadrion/schema/template';
import {
  FONT_GLYPHS,
  framedTextComposition,
  generateProportionalFontAsset,
  generateReferenceAssets,
  generateSvgAsset,
  PROPORTIONAL_FONT_GLYPHS,
  referenceComposition,
  svgComposition,
  VIDEO_FIXTURE,
} from '@kadrion/test-fixtures';

import { draggableNodes, positionOf, sizeCanvas, wireEditor, type Editor } from './app.js';
import { SHOWCASES, type Showcase } from './showcases.js';

const RUNTIME = '/pkg/renderer-dom/runtime-build/kadrion-runtime.js';
const MANIFEST = '/pkg/renderer-dom/runtime-build/kadrion-runtime.json';

/** The preview scale of the stylesheet (`#stage`, `#overlay`). */
const SCALE = 0.35;
/** The grip's box in composition pixels. It is an affordance of this page, not a node property. */
const GRIP = 140;
/**
 * The video the page serves, made by `node --run playground:media` from the
 * recipes of the fixtures (D32.10): asset ID → URL. Their hashes are the
 * fixtures' own, so the Player verifies them as it verifies every asset.
 */
const MEDIA: Readonly<Record<string, { url: string; type: 'video'; contentHash: string }>> = {
  [VIDEO_FIXTURE.id]: {
    url: '/media/video.mp4',
    type: 'video',
    contentHash: VIDEO_FIXTURE.contentHash,
  },
};
/** The sample rate of the Player's sound (D53). */
const SAMPLE_RATE = 48_000;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`The page has no #${id}.`);
  return found;
}

async function bytesOf(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function textOf(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
  return response.text();
}

/** A typed failure of the bus or the Player, or anything else, as lines of text. */
function describe(reason: unknown): string {
  if (typeof reason === 'object' && reason !== null && 'code' in reason) {
    const { code, message, details } = reason as {
      code: unknown;
      message?: unknown;
      details?: unknown;
    };
    const lines = Array.isArray(details) ? details.map(String) : [];
    return [`${String(code)}: ${typeof message === 'string' ? message : ''}`, ...lines].join('\n');
  }
  return reason instanceof Error ? reason.message : String(reason);
}

function report(reason: unknown): void {
  console.error(reason);
  element('errors').textContent = describe(reason);
}

function clearErrors(): void {
  element('errors').textContent = '';
}

function button(parent: HTMLElement, label: string, action: () => unknown): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.addEventListener('click', () => {
    void Promise.resolve()
      .then(action)
      .catch((reason: unknown) => {
        report(reason);
      });
  });
  parent.append(control);
  return control;
}

/** What a tool did, as the panel shows it (D46). */
function describeOutcome(outcome: ToolResult): string {
  switch (outcome.kind) {
    case 'description':
      return JSON.stringify(outcome.description, null, 2);
    case 'transaction':
      return `Applied as one transaction: ${String(outcome.result.commands.length)} commands, one undo step.`;
    case 'command':
      return outcome.result.inverse === null
        ? 'No change: the document already is so.'
        : `Applied. Undo would dispatch:\n${JSON.stringify(outcome.result.inverse, null, 2)}`;
    case 'check':
      return 'Checking the Custom HTML element…';
  }
}

/** One document on screen: its session, the drag editor over it, and the node the grip drags. */
interface Session {
  readonly facade: EditorSession;
  readonly bus: CommandBus;
  readonly label: string;
  editor: Editor | null;
  nodeId: string | null;
}

async function main(): Promise<void> {
  const [bytes, manifest] = await Promise.all([
    bytesOf(RUNTIME),
    fetch(MANIFEST).then((response) => response.json() as Promise<{ contentHash: string }>),
  ]);
  const elements = { stage: element('stage'), overlay: element('overlay'), grip: element('grip') };
  const viewport = element('viewport');
  const timeline = element('timeline') as HTMLInputElement;
  const dragSelect = element('drag-node') as HTMLSelectElement;
  const source = element('source') as HTMLTextAreaElement;
  const toolCall = element('tool-call') as HTMLTextAreaElement;
  const current = element('current');
  const trust = element('trust-custom-html') as HTMLInputElement;
  /** The page's own choice (D36): unchecked, the default, runs no Custom HTML. */
  const customHtml = (): PlayerCustomHtmlPolicy =>
    trust.checked ? { mode: 'trusted' } : { mode: 'disabled' };
  const runtime = { bytes, contentHash: manifest.contentHash };

  const sizeViewport = (size: { width: number; height: number }): void => {
    viewport.style.width = `${String(Math.round(size.width * SCALE))}px`;
    viewport.style.height = `${String(Math.round(size.height * SCALE))}px`;
  };

  // Before the Player: the render frame needs a stage that already has a height (D30.10).
  sizeViewport(referenceComposition as { width: number; height: number });
  sizeCanvas(elements, referenceComposition as { width: number; height: number });
  /** The policy of the Player on screen, which the status line reports. */
  let shown: PlayerCustomHtmlPolicy = customHtml();
  // The generated bytes: the reference assets, since PR-57 the SVG drawing of D74, and,
  // since PR-68, the proportional font of D83, whose lines a frame measures.
  const assets = new Map(
    [...generateReferenceAssets(), generateSvgAsset(), generateProportionalFontAsset()].map(
      (asset) => [asset.id, asset],
    ),
  );
  /**
   * A lookup by ID and nothing else: an unknown ID, or a video the page has not
   * been given, is the Player's asset-missing (D32.2). A video is handed over as
   * a Blob, which the Player hashes without reading it whole (D51.2).
   */
  const resolve = async ({ id }: { id: string }) => {
    const generated = assets.get(id);
    if (generated !== undefined) return generated;
    const media = MEDIA[id];
    if (media === undefined) return null;
    const response = await fetch(media.url);
    if (!response.ok) return null;
    return { blob: await response.blob(), mediaType: 'video/mp4' };
  };
  /**
   * The sound of every Player of the page (D53). A browser starts it suspended;
   * the Player resumes it on Play, which is a click.
   */
  const audio = { context: new AudioContext({ sampleRate: SAMPLE_RATE }) };

  let session: Session | null = null;

  /**
   * Opening a document, waiting for the preview, and replacing the Player run
   * one at a time, so that none of them sees a session another one is replacing.
   */
  let queue: Promise<void> = Promise.resolve();
  const serially = (task: () => Promise<void>): Promise<void> => {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  /**
   * A new Player and a session over `document` in place of the one on screen.
   * The session loads it and from then on brings every edit to it (D44).
   */
  const replaceSession = async (document: unknown, label: string): Promise<Session> => {
    session?.editor?.detach();
    session?.facade.destroy();
    session = null;
    const policy = customHtml();
    const player = await createPlayer(elements.stage, {
      runtime,
      customHtml: policy,
      audio,
      onListenerError: report,
    });
    const facade = await createEditorSession({
      document,
      player,
      resolveAsset: resolve,
      onListenerError: report,
    });
    shown = policy;
    // What the preview could not show; the bus holds the document all the same.
    facade.subscribe((event) => {
      if (event.type === 'error') report(event.error);
    });
    const opened: Session = { facade, bus: facade.bus, label, editor: null, nodeId: null };
    session = opened;
    return opened;
  };

  /** Waits until the preview shows the current document, and puts the grip on it. */
  const rerender = (): Promise<void> => serially(rerenderNow);
  const rerenderNow = async (): Promise<void> => {
    if (session === null) return;
    if (session.editor !== null) {
      await session.editor.show();
      return;
    }
    await session.facade.settled();
  };

  /** Puts the grip on a node of the current document, or hides it. */
  const attachGrip = (nodeId: string | null): void => {
    if (session === null) return;
    session.editor?.detach();
    session.editor = null;
    session.nodeId = nodeId;
    elements.grip.hidden = nodeId === null;
    if (nodeId === null) return;
    session.editor = wireEditor({
      session: session.facade,
      elements,
      nodeId,
      gripSize: GRIP,
      onError: report,
    });
  };

  /** The template on screen and the values the page offers for it, or null (D58.4). */
  const templateValues = element('template-values') as HTMLTextAreaElement;
  const showTemplate = (composition: unknown, values: unknown): void => {
    const template = isTemplate(composition as Parameters<typeof isTemplate>[0]);
    element('template').hidden = !template;
    templateValues.value = template ? JSON.stringify(values ?? {}, null, 2) : '';
    element('template-result').textContent = '';
  };

  const exampleCall = (bus: CommandBus, nodeId: string | null): unknown => {
    if (nodeId === null) {
      return {
        name: setNodePositionTool.name,
        arguments: { nodeId: '', position: { x: 0, y: 0 } },
      };
    }
    const { x, y } = positionOf(bus, nodeId);
    return { name: setNodePositionTool.name, arguments: { nodeId, position: { x: x + 100, y } } };
  };

  /**
   * Opens a document: parse, bus (full validation), then the Player. A document
   * that does not parse or validate leaves the one on screen as it was; one the
   * Player refuses (a missing asset, say) is shown with its error (D32.2, D32.3).
   */
  const open = (text: string, label: string, showcase: Showcase | null): Promise<void> =>
    serially(() => openNow(text, label, showcase));
  const openNow = async (text: string, label: string, showcase: Showcase | null): Promise<void> => {
    clearErrors();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (reason: unknown) {
      report(new Error(`The JSON does not parse: ${describe(reason)}`));
      return;
    }
    // The bus validates first: a document it refuses leaves the one on screen as it was.
    const composition = createCommandBus(parsed).getDocument();
    session?.editor?.detach();
    elements.grip.hidden = true;
    timeline.max = String(frameCount(composition.durationUs, composition.fps) - 1);
    timeline.value = '0';
    element('tool-result').textContent = '';
    current.hidden = true;
    // Before the Player: the stage must have the new size when the frame is laid out (D32.3).
    sizeViewport(composition);
    sizeCanvas(elements, composition);
    const { bus } = await replaceSession(parsed, label);

    const candidates = draggableNodes(composition);
    const wanted = showcase?.dragNodeId ?? null;
    const nodeId =
      wanted !== null && candidates.includes(wanted) ? wanted : (candidates[0] ?? null);
    dragSelect.replaceChildren(
      ...candidates.map((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        return option;
      }),
    );
    dragSelect.value = nodeId ?? '';
    attachGrip(nodeId);
    toolCall.value = JSON.stringify(showcase?.toolCall ?? exampleCall(bus, nodeId), null, 2);
    showTemplate(composition, showcase?.templateValues ?? null);
  };

  const selectShowcase = async (showcase: Showcase): Promise<void> => {
    for (const control of element('showcases').querySelectorAll('button')) {
      control.setAttribute('aria-pressed', String(control.dataset['id'] === showcase.id));
    }
    const about = element('about');
    about.replaceChildren();
    const description = document.createElement('p');
    description.textContent = showcase.description;
    const tags = document.createElement('div');
    tags.className = 'tags';
    tags.textContent = `Shows: ${showcase.features.join(', ')}`;
    about.append(description, tags);
    element('source-info').textContent =
      `Source: ${showcase.sourceFile} (served as ${showcase.url}). Edit it here and press "Load this JSON" to try a variant.`;
    const text = await textOf(showcase.url);
    source.value = text;
    await open(text, `showcase ${showcase.id}`, showcase);
  };

  // Showcases.
  for (const showcase of SHOWCASES) {
    const control = button(element('showcases'), showcase.title, () => {
      // A new hash opens the showcase through `hashchange`; the same one reloads it here.
      if (window.location.hash.slice(1) !== showcase.id) {
        window.location.hash = showcase.id;
        return undefined;
      }
      return selectShowcase(showcase);
    });
    control.dataset['id'] = showcase.id;
  }

  // The page's Custom HTML policy (D36): a new Player and a new session over the
  // same document. If the Player cannot be made, the old choice is shown again.
  trust.addEventListener('change', () => {
    trust.disabled = true;
    serially(async () => {
      if (session === null) {
        shown = customHtml();
        return;
      }
      const { nodeId, label } = session;
      const document = session.bus.getDocument();
      const at = session.facade.getPlaybackState().timeUs ?? 0;
      try {
        await replaceSession(document, label);
      } catch (reason: unknown) {
        // The old session is gone: the old choice gets a new one over the same document.
        trust.checked = !trust.checked;
        await replaceSession(document, label);
        attachGrip(nodeId);
        throw reason;
      }
      if (at !== 0) await session.facade.seek(at);
      attachGrip(nodeId);
    })
      .catch(report)
      .finally(() => {
        trust.disabled = false;
      });
  });

  // Playback and history.
  const controls = element('controls');
  button(controls, 'Play', () => {
    session?.facade.play();
  });
  button(controls, 'Pause', () => {
    session?.facade.pause();
  });
  button(controls, 'Undo', async () => {
    if (session === null) return;
    if (session.editor !== null) return session.editor.undo();
    session.bus.undo();
    await rerender();
  });
  button(controls, 'Redo', async () => {
    if (session === null) return;
    if (session.editor !== null) return session.editor.redo();
    session.bus.redo();
    await rerender();
  });
  timeline.addEventListener('input', () => {
    if (session === null) return;
    const { fps } = session.bus.getDocument();
    session.facade.seek(frameToTimeUs(Number(timeline.value), fps)).catch((reason: unknown) => {
      // A newer seek replacing this one is the normal case while the slider moves,
      // and so is a seek of a session that the policy checkbox is replacing.
      const code = (reason as { code?: unknown }).code;
      if (code !== 'superseded' && code !== 'destroyed' && code !== 'not-loaded') report(reason);
    });
  });
  dragSelect.addEventListener('change', () => {
    attachGrip(dragSelect.value === '' ? null : dragSelect.value);
  });

  // Documents of the user's own (D32.2).
  element('load-json').addEventListener('click', () => {
    for (const control of element('showcases').querySelectorAll('button')) {
      control.setAttribute('aria-pressed', 'false');
    }
    element('source-info').textContent = 'Source: the JSON in this editor.';
    open(source.value, 'custom JSON', null).catch(report);
  });
  element('load-file').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file === undefined) return;
    file
      .text()
      .then((text) => {
        source.value = text;
        element('source-info').textContent = `Source: the file ${file.name}.`;
        return open(text, `file ${file.name}`, null);
      })
      .catch(report);
  });
  element('show-current').addEventListener('click', () => {
    if (session === null) return;
    current.hidden = false;
    current.textContent = JSON.stringify(session.bus.getDocument(), null, 2);
  });

  // The AI tools of D46 on the page's bus (D32.5): any tool of the catalogue.
  element('run-tool').addEventListener('click', () => {
    const result = element('tool-result');
    result.textContent = '';
    if (session === null) return;
    const { bus } = session;
    try {
      const call = JSON.parse(toolCall.value) as unknown;
      if (
        typeof call !== 'object' ||
        call === null ||
        !('name' in call) ||
        !('arguments' in call)
      ) {
        throw new Error('A tool call is an object with "name" and "arguments".');
      }
      const { name, arguments: args } = call;
      // The capabilities the tools need, and nothing else (D31.5, D46).
      const outcome = executeTool(
        Object.freeze({
          getDocument: () => bus.getDocument(),
          dispatch: (command: unknown) => bus.dispatch(command),
          dispatchTransaction: (commands: unknown) => bus.dispatchTransaction(commands),
          mediaFactsOf: (contentHash: string) => bus.mediaFactsOf(contentHash),
        }),
        name,
        args,
      );
      result.textContent = describeOutcome(outcome);
      if (outcome.kind === 'check') {
        // The playground lends no render check: the report holds what reading found (D78).
        outcome.result
          .then((found) => {
            result.textContent = JSON.stringify(found, null, 2);
          })
          .catch((reason: unknown) => {
            result.textContent = `Refused: ${describe(reason)}`;
          });
      }
      rerender().catch(report);
    } catch (reason: unknown) {
      result.textContent = `Refused: ${describe(reason)}`;
    }
  });
  element('tools').textContent = TOOL_CATALOGUE.map((tool) => tool.name).join(', ');

  // A template's values (D58.4): the preview shows its defaults; this opens the
  // document the values make, as a new document with a new history.
  element('instantiate').addEventListener('click', () => {
    const out = element('template-result');
    out.textContent = '';
    if (session === null) return;
    const template = session.bus.getDocument();
    let values: unknown;
    try {
      values = JSON.parse(templateValues.value);
    } catch (reason: unknown) {
      out.textContent = `The values do not parse: ${describe(reason)}`;
      return;
    }
    const made = instantiateTemplate(template, values);
    if (!made.ok) {
      out.textContent = `Refused:\n${made.errors.map((error) => `${error.code}: ${error.message}`).join('\n')}`;
      return;
    }
    const text = JSON.stringify(made.composition, null, 2);
    source.value = text;
    element('source-info').textContent =
      `Source: the document instantiated from ${session.label} with the values below it.`;
    open(text, `instantiated from ${session.label}`, null).catch(report);
  });

  // What a document can use (D32.2): the IDs, types, and hashes of the generated bytes.
  type Declared = { assets: { id: string; type: string; contentHash: string }[] };
  const declared = [
    ...(referenceComposition as Declared).assets,
    ...(svgComposition as Declared).assets,
    ...(framedTextComposition as Declared).assets,
  ];
  element('assets').textContent = [
    ...declared.map(
      (asset) =>
        `${asset.id.padEnd(23)} ${asset.type.padEnd(6)} ${asset.contentHash}  (${assets.get(asset.id)?.mediaType ?? '?'})`,
    ),
    ...Object.entries(MEDIA).map(
      ([id, media]) =>
        `${id.padEnd(23)} ${media.type.padEnd(6)} ${media.contentHash}  (video/mp4 from ${media.url})`,
    ),
    '',
    `Glyphs of the generated font: "${Object.keys(FONT_GLYPHS).join('')}"`,
    `Glyphs of the proportional font: "${Object.keys(PROPORTIONAL_FONT_GLYPHS).join('')}"`,
    'Any other asset ID is refused by the Player as asset-missing; a changed hash as asset-hash-mismatch.',
  ].join('\n');

  // The status line, from the Player and the bus only.
  const showState = (): void => {
    const state = session?.facade.getPlaybackState() ?? {
      status: 'empty',
      timeUs: null,
      runtimeHash: '',
      error: null,
    };
    const lines = [
      `document ${session?.label ?? '-'}`,
      `status   ${state.status}`,
      `timeUs   ${String(state.timeUs)}`,
      // Integrity, not identity: the manifest also supplied the expected hash (D25.5).
      `runtime  ${state.runtimeHash === manifest.contentHash ? 'verified against its manifest' : 'MISMATCH'}`,
      `custom   ${shown.mode === 'disabled' ? 'disabled: no Custom HTML runs' : 'trusted: the document runs code'}`,
    ];
    if (session !== null) {
      const { bus, nodeId } = session;
      if (nodeId !== null) {
        const { x, y } = positionOf(bus, nodeId);
        lines.push(`${nodeId}  x ${String(x)}, y ${String(y)}`);
      }
      const history = session.facade.getHistory();
      lines.push(
        `history  ${history.canUndo ? `undo ${String(history.undoDepth)}` : '-'} / ${history.canRedo ? `redo ${String(history.redoDepth)}` : '-'}`,
      );
      if (state.timeUs !== null && document.activeElement !== timeline) {
        timeline.value = String(timeUsToFrame(state.timeUs, bus.getDocument().fps));
      }
    }
    lines.push(
      `error    ${state.error === null ? '-' : `${state.error.code}: ${state.error.message}`}`,
    );
    element('status').textContent = lines.join('\n');
    requestAnimationFrame(showState);
  };
  showState();

  // A link to `#<id>` opens that showcase, also when only the hash changes.
  window.addEventListener('hashchange', () => {
    const chosen = SHOWCASES.find((showcase) => showcase.id === window.location.hash.slice(1));
    if (chosen !== undefined) selectShowcase(chosen).catch(report);
  });

  const initial =
    SHOWCASES.find((showcase) => showcase.id === window.location.hash.slice(1)) ?? SHOWCASES[0];
  if (initial !== undefined) await selectShowcase(initial);
}

main().catch((reason: unknown) => {
  element('status').textContent = `failed: ${describe(reason)}`;
});
