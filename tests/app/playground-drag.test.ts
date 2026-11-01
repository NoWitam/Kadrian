/**
 * @vitest-environment jsdom
 *
 * The drag gesture of P3 in a DOM (D30.10). The code under test is the
 * playground's own `wireEditor` on the real host facade of
 * `@kadrion/editor-session` (D44), the code the page runs, so a bypass of the
 * bus in the application would fail here; only the Player is a stub, because
 * the real one needs a frame, the runtime build, and WebCrypto.
 *
 * What this proves is the protocol and the arithmetic: one command per gesture,
 * its exact payload, the conversion of client pixels into composition pixels,
 * and the fact that the document the bus returns is what reaches the Player,
 * through `Player.update` at the time it shows. It
 * cannot prove the conversion factor, because jsdom performs no layout and the
 * surface's box is stubbed here; `tests/pinned/editor.pinned.test.ts` measures
 * that in Chromium, where it once caught a real defect.
 */
import { positionOf, wireEditor, type Editor } from '../../apps/playground/src/app.js';
import { EditorError, type CommandBus } from '@kadrion/editor-sdk';
import { createEditorSession, type EditorSession } from '@kadrion/editor-session';
import type { Player, PlayerState } from '@kadrion/player';
import { referenceComposition } from '@kadrion/test-fixtures';
import { beforeEach, describe, expect, it } from 'vitest';

const NODE_ID = 'node-title';
const START = { x: 90, y: 160 };
/** 378 client pixels show 1080 composition pixels: the 0.35 of the stylesheet. */
const VIEW = { width: 378, height: 672 };
const SCALE = VIEW.width / 1080;
const GRIP = 140;

/** A pointer event jsdom can build: a mouse event with a pointer ID on it. */
function pointer(type: string, clientX: number, clientY: number, pointerId = 7): MouseEvent {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

interface StubPlayer extends Player {
  /** Every document the Player was asked to show by an update, in order. */
  readonly loaded: unknown[];
  readonly sought: number[];
  /** The time the Player reports; `load` shows frame 0, as the real one does (D25). */
  timeUs: number | null;
}

function stubPlayer(): StubPlayer {
  const state = (): PlayerState => ({
    status: 'ready',
    timeUs: player.timeUs,
    runtimeHash: 'sha256:stub',
    error: null,
  });
  const player: StubPlayer = {
    loaded: [],
    sought: [],
    timeUs: null,
    load() {
      player.timeUs = 0;
      return Promise.resolve();
    },
    prepareVideo: () => Promise.reject(new Error('The playground document has no video.')),
    prepareAudio: () =>
      Promise.reject(Object.assign(new Error('No Web Audio here.'), { code: 'audio-unsupported' })),
    update(document) {
      // An update keeps the time it shows (D44).
      player.loaded.push(document);
      return Promise.resolve();
    },
    seek(timeUs) {
      player.sought.push(timeUs);
      player.timeUs = timeUs;
      return Promise.resolve();
    },
    play: () => undefined,
    pause: () => undefined,
    getState: state,
    subscribe: () => () => undefined,
    destroy: () => undefined,
  };
  return player;
}

interface Harness {
  readonly grip: HTMLElement;
  readonly overlay: HTMLElement;
  readonly session: EditorSession;
  readonly bus: CommandBus;
  readonly player: StubPlayer;
  readonly editor: Editor;
  readonly errors: unknown[];
}

async function harness(measurable = true): Promise<Harness> {
  document.body.innerHTML =
    '<div id="viewport"><div id="stage"></div><div id="overlay"><div id="grip"></div></div></div>';
  const stage = document.getElementById('stage') as HTMLElement;
  const overlay = document.getElementById('overlay') as HTMLElement;
  const grip = document.getElementById('grip') as HTMLElement;
  overlay.style.pointerEvents = 'none';
  // jsdom lays nothing out, so the surface's box is stated here (D30.10).
  overlay.getBoundingClientRect = () =>
    ({
      width: measurable ? VIEW.width : 0,
      height: measurable ? VIEW.height : 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
    }) as DOMRect;

  const player = stubPlayer();
  const errors: unknown[] = [];
  const session = await createEditorSession({
    document: referenceComposition,
    player,
    resolveAsset: () => null,
  });
  const editor = wireEditor({
    session,
    elements: { stage, overlay, grip },
    nodeId: NODE_ID,
    gripSize: GRIP,
    onError: (reason) => errors.push(reason),
  });
  return { grip, overlay, session, bus: session.bus, player, editor, errors };
}

/** A gesture: press, move through every waypoint, release at the last one. */
function drag(grip: HTMLElement, from: [number, number], ...waypoints: [number, number][]): void {
  grip.dispatchEvent(pointer('pointerdown', from[0], from[1]));
  for (const [x, y] of waypoints) grip.dispatchEvent(pointer('pointermove', x, y));
  const last = waypoints[waypoints.length - 1] ?? from;
  grip.dispatchEvent(pointer('pointerup', last[0], last[1]));
}

/** Lets the session's update and the editor's `show()` settle. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

let page: Harness;

beforeEach(async () => {
  page = await harness();
});

describe('the playground editor in a DOM (P3, D30.10)', () => {
  it('sizes the canvas boxes and the grip from the document', () => {
    expect(document.getElementById('stage')?.style.width).toBe('1080px');
    expect(page.overlay.style.height).toBe('1920px');
    expect(page.grip.style.width).toBe(`${String(GRIP)}px`);
    expect(page.grip.style.left).toBe('90px');
    expect(page.grip.style.top).toBe('160px');
  });

  it('sends exactly one command for a gesture, however many moves it has', async () => {
    drag(page.grip, [100, 100], [110, 120], [120, 140], [135, 170]);
    await settle();
    expect(page.player.loaded).toHaveLength(1);
    expect(page.bus.canUndo()).toBe(true);
    expect(page.bus.canRedo()).toBe(false);
  });

  it('converts the client delta into composition pixels', async () => {
    // 35 client pixels at 0.35 are 100 composition pixels; 70 are 200.
    drag(page.grip, [100, 100], [135, 170]);
    await settle();
    expect(page.editor.position()).toEqual({ x: START.x + 100, y: START.y + 200 });
  });

  it('leaves the rounding to the bus, which is what keeps P4 possible', async () => {
    // 36 / 0.35 is 102.857…, which the bus rounds to 103.
    drag(page.grip, [100, 100], [136, 100]);
    await settle();
    expect(page.editor.position()).toEqual({ x: START.x + 103, y: START.y });
  });

  it('renders the very document the bus returned', async () => {
    drag(page.grip, [100, 100], [135, 170]);
    await settle();
    expect(page.player.loaded[0]).toBe(page.bus.getDocument());
  });

  it('keeps the time the preview was showing: an update, never a new load (D44)', async () => {
    await page.session.seek(7_500_000);
    drag(page.grip, [100, 100], [135, 170]);
    await settle();
    expect(page.player.sought).toEqual([7_500_000]);
    expect(page.player.timeUs).toBe(7_500_000);
  });

  it('shows a preview while the pointer moves and clears it on release', async () => {
    page.grip.dispatchEvent(pointer('pointerdown', 100, 100));
    page.grip.dispatchEvent(pointer('pointermove', 135, 170));
    expect(page.grip.style.transform).toBe('translate(100px, 200px)');
    page.grip.dispatchEvent(pointer('pointerup', 135, 170));
    await settle();
    expect(page.grip.style.transform).toBe('');
  });

  it('shields the render frame for the length of the gesture, and only that long', async () => {
    // The frame is cross-origin and out of process (D26), so a pointer over it
    // would never come back to this document without the shield.
    expect(page.overlay.style.pointerEvents).toBe('none');
    page.grip.dispatchEvent(pointer('pointerdown', 100, 100));
    expect(page.overlay.style.pointerEvents).toBe('auto');
    page.grip.dispatchEvent(pointer('pointerup', 135, 170));
    await settle();
    expect(page.overlay.style.pointerEvents).toBe('none');
  });

  it('follows the pointer after it has left the grip', async () => {
    page.grip.dispatchEvent(pointer('pointerdown', 100, 100));
    // On the overlay, not the grip: this is where the shield delivers them.
    page.overlay.dispatchEvent(pointer('pointermove', 135, 170));
    page.overlay.dispatchEvent(pointer('pointerup', 135, 170));
    await settle();
    expect(page.editor.position()).toEqual({ x: START.x + 100, y: START.y + 200 });
  });

  it('moves the grip to the position the document now holds', async () => {
    drag(page.grip, [100, 100], [135, 170]);
    await settle();
    expect(page.grip.style.left).toBe('190px');
    expect(page.grip.style.top).toBe('360px');
  });

  it('undoes to the start and redoes to the end of the gesture', async () => {
    drag(page.grip, [100, 100], [135, 170]);
    await settle();
    const end = page.editor.position();
    await page.editor.undo();
    expect(page.editor.position()).toEqual(START);
    expect(page.grip.style.left).toBe('90px');
    await page.editor.redo();
    expect(page.editor.position()).toEqual(end);
    expect(page.player.loaded).toHaveLength(3);
  });

  it('reports an empty history instead of throwing', async () => {
    await page.editor.undo();
    expect(page.errors.map((reason) => (reason as EditorError).code)).toEqual(['nothing-to-undo']);
    expect(page.player.loaded).toEqual([]);
  });

  it('changes neither the view nor the history when the bus refuses the command', async () => {
    // 1 000 000 composition pixels to the right is outside what the schema allows.
    drag(page.grip, [100, 100], [100 + 1_000_000 * SCALE, 100]);
    await settle();
    expect(page.errors.map((reason) => (reason as EditorError).code)).toEqual(['invalid-result']);
    expect(page.player.loaded).toEqual([]);
    expect(positionOf(page.bus, NODE_ID)).toEqual(START);
    expect(page.grip.style.left).toBe('90px');
    expect(page.bus.canUndo()).toBe(false);
    expect(page.bus.canRedo()).toBe(false);
  });

  it('refuses the gesture instead of guessing when the canvas cannot be measured', async () => {
    const hidden = await harness(false);
    drag(hidden.grip, [100, 100], [135, 170]);
    await settle();
    expect(hidden.player.loaded).toEqual([]);
    expect(hidden.editor.position()).toEqual(START);
    expect((hidden.errors[0] as EditorError).message).toContain('no measurable size');
  });

  it('sends nothing for a cancelled gesture', async () => {
    page.grip.dispatchEvent(pointer('pointerdown', 100, 100));
    page.grip.dispatchEvent(pointer('pointermove', 135, 170));
    page.grip.dispatchEvent(pointer('pointercancel', 135, 170));
    page.grip.dispatchEvent(pointer('pointerup', 135, 170));
    await settle();
    expect(page.player.loaded).toEqual([]);
    expect(page.editor.position()).toEqual(START);
    expect(page.grip.style.transform).toBe('');
    expect(page.overlay.style.pointerEvents).toBe('none');
  });

  it('ignores a pointer that never pressed, and a second pointer during a gesture', async () => {
    page.grip.dispatchEvent(pointer('pointermove', 200, 200));
    page.grip.dispatchEvent(pointer('pointerup', 200, 200));
    expect(page.player.loaded).toEqual([]);
    page.grip.dispatchEvent(pointer('pointerdown', 100, 100, 7));
    page.grip.dispatchEvent(pointer('pointerup', 300, 300, 8));
    expect(page.player.loaded).toEqual([]);
    page.grip.dispatchEvent(pointer('pointerup', 135, 170, 7));
    await settle();
    expect(page.player.loaded).toHaveLength(1);
  });

  it('stops sending once the editor is detached', async () => {
    page.editor.detach();
    drag(page.grip, [100, 100], [135, 170]);
    await settle();
    expect(page.player.loaded).toEqual([]);
  });
});
