/**
 * The host flow of PR-43, on the tarballs of a release: what a host editor and
 * its worker do with Kadrion, end to end, in a clean project that installed the
 * release by integrity (`smoke.ts`), outside the workspace (D45).
 *
 * 1. **Load:** a document saved by schema `0.1` is migrated by `kadrion migrate`
 *    and by `parseComposition`, which must agree (D43).
 * 2. **Edit (browser):** in the pinned Chromium, a page bundled from the
 *    browser packages creates a Player and an `editor-session` on the migrated
 *    document (D44). The UI dispatches on `session.bus`; a model's tool call
 *    runs through `executeTool` on the same bus (D46); a transaction turns the
 *    document into a template (D58); undo and redo return the same documents;
 *    the session reports every change and no error; the Player shows the
 *    runtime build of the release. The page saves the document with
 *    `serializeComposition`.
 * 3. **Render (worker):** the saved text is parsed again and instantiated with
 *    values (D58). `kadrion fetch-ffmpeg` installs the pinned FFmpeg,
 *    `kadrion doctor` reports, `kadrion estimate` measures the job (D48.5),
 *    two `render-range` jobs, one `render-audio` job, and one `join` make the
 *    MP4, which must be byte for byte the MP4 of one `export` (D47), and
 *    `render-still` renders one frame. Every job's standard output is JSON
 *    lines ending in `done` (D48.1).
 *
 * The assets are the generated assets of the reference composition, written
 * into the clean project as the host's own files. Only the bytes of the
 * release run in the clean project; nothing of the workspace is imported
 * there.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateReferenceAssets } from '@kadrion/test-fixtures';

/** The composition's size: the smallest size `720p` renders without upscaling (D29.5). */
export const FLOW_WIDTH = 1280;
export const FLOW_HEIGHT = 720;
/** Four seconds at 30 fps: two segments of the default 60 frames (D47). */
export const FLOW_DURATION_US = 4_000_000;
export const FLOW_SEGMENT_US = 2_000_000;

/** The values a host instantiates the template with; every character is in the fixture font. */
export const FLOW_VALUES = Object.freeze({ name: 'Dorian', brand: '#334455' });

/** The host's files: each asset of the reference composition, by its ID. */
export const FLOW_ASSET_FILES = Object.freeze({
  'asset-image': 'assets/image.png',
  'asset-audio': 'assets/audio.wav',
  'asset-font': 'assets/font.ttf',
} as const);

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * A document as schema `0.1` saved it: a background, a group with a position
 * animation around an image, a title, and one audio clip, with the content
 * hashes of the generated assets.
 */
export function savedDocument(hashes: Readonly<Record<string, string>>): unknown {
  const still = { x: 1, y: 1 };
  return {
    schemaVersion: '0.1',
    width: FLOW_WIDTH,
    height: FLOW_HEIGHT,
    fps: 30,
    durationUs: FLOW_DURATION_US,
    assets: [
      { id: 'asset-image', type: 'image', contentHash: hashes['asset-image'] },
      { id: 'asset-audio', type: 'audio', contentHash: hashes['asset-audio'] },
      { id: 'asset-font', type: 'font', contentHash: hashes['asset-font'] },
    ],
    scenes: [
      {
        id: 'scene-main',
        nodes: [
          { id: 'node-background', type: 'background', color: '#0b1020' },
          {
            id: 'node-group',
            type: 'group',
            position: { x: 80, y: 120 },
            scale: still,
            opacity: 1,
            animations: [
              {
                id: 'anim-group-position',
                property: 'position',
                interpolation: 'linear',
                keyframes: [
                  { timeUs: 0, value: { x: 80, y: 120 } },
                  { timeUs: FLOW_DURATION_US, value: { x: 880, y: 300 } },
                ],
              },
            ],
            children: [
              {
                id: 'node-image',
                type: 'image',
                position: { x: 0, y: 0 },
                scale: still,
                opacity: 1,
                animations: [],
                assetId: 'asset-image',
                width: 256,
                height: 256,
              },
            ],
          },
          {
            id: 'node-title',
            type: 'text',
            position: { x: 80, y: 480 },
            scale: still,
            opacity: 1,
            animations: [],
            text: 'Kadrion',
            fontAssetId: 'asset-font',
            fontSize: 96,
            color: '#ffffff',
          },
        ],
      },
    ],
    clips: [
      {
        id: 'clip-audio',
        type: 'audio',
        assetId: 'asset-audio',
        startUs: 0,
        durationUs: FLOW_DURATION_US,
      },
    ],
  };
}

/**
 * The edits of the flow, as data, so that `tests/repo/host-flow.test.ts` runs
 * them on a bus of the workspace in every `check`: the UI's command, a model's
 * tool call, and the transaction that makes the document a template.
 */
export const FLOW_EDITS = Object.freeze({
  ui: { type: 'SetNodePosition', nodeId: 'node-title', position: { x: 120, y: 600 } },
  tool: { name: 'set_clip_volume', args: { clipId: 'clip-audio', volume: 0.5 } },
  template: [
    {
      type: 'AddTemplateInput',
      index: 0,
      input: { id: 'name', type: 'text', minLength: 1, maxLength: 24, default: 'Kadrion' },
    },
    {
      type: 'AddTemplateInput',
      index: 1,
      input: { id: 'brand', type: 'color', default: '#0b1020' },
    },
    { type: 'SetTextContent', nodeId: 'node-title', text: '{{name}}' },
    {
      type: 'AddTemplateBinding',
      index: 0,
      binding: { id: 'bind-name', kind: 'placeholders', nodeId: 'node-title' },
    },
    {
      type: 'AddTemplateBinding',
      index: 1,
      binding: {
        id: 'bind-brand',
        kind: 'property',
        nodeId: 'node-background',
        property: 'color',
        inputId: 'brand',
      },
    },
  ],
} as const);

/**
 * The page's part, bundled from the installed browser packages by esbuild.
 * `window.hostFlow(text)` runs the editor and returns what the Node part
 * asserts; it throws on the first refusal of the bus.
 */
export const FLOW_BROWSER_ENTRY = `import { createPlayer } from '@kadrion/player';
import { createEditorSession } from '@kadrion/editor-session';
import { executeTool } from '@kadrion/ai-sdk';
import { serializeComposition } from '@kadrion/schema/migrate';

const edits = ${JSON.stringify(FLOW_EDITS)};

async function bytesOf(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(path + ' answered ' + String(response.status));
  return new Uint8Array(await response.arrayBuffer());
}

window.hostFlow = async (text) => {
  const errors = [];
  const report = (error) => {
    errors.push(String(error && error.code !== undefined ? error.code : error));
  };
  const files = await (await fetch('/assets.json')).json();
  const assets = new Map();
  for (const [id, file] of Object.entries(files)) {
    assets.set(id, { bytes: await bytesOf('/' + file.path), mediaType: file.mediaType });
  }
  const resolveAsset = ({ id }) => assets.get(id) ?? null;
  const runtime = {
    bytes: await bytesOf('/runtime/kadrion-runtime.js'),
    contentHash: (await (await fetch('/runtime/kadrion-runtime.json')).json()).contentHash,
  };

  // Section 4 and 5 of the README: the Player, and the session that loads it.
  const player = await createPlayer(document.getElementById('stage'), {
    runtime,
    onListenerError: report,
  });
  const session = await createEditorSession({
    document: JSON.parse(text),
    player,
    resolveAsset,
    onListenerError: report,
  });
  const events = [];
  session.subscribe((event) => {
    events.push(event.type);
    if (event.type === 'error') report(event.error);
  });
  const bus = session.bus;
  const snapshot = () => JSON.stringify(bus.getDocument());

  // The UI moves the title; a model turns the music down through its tool, on the same bus.
  bus.dispatch(edits.ui);
  const tool = executeTool(bus, edits.tool.name, edits.tool.args);
  const described = executeTool(bus, 'describe_document', {});

  // One undoable step makes the document a template: a text input and a colour input.
  const beforeTemplate = snapshot();
  bus.dispatchTransaction(edits.template);
  const afterTemplate = snapshot();
  bus.undo();
  const undone = snapshot() === beforeTemplate;
  const undoneHistory = session.getHistory();
  bus.redo();
  const redone = snapshot() === afterTemplate;

  // The preview of a template is its instantiation with the defaults (D58.4).
  await session.settled();
  await session.seek(1_000_000);
  const state = session.getPlaybackState();
  const history = session.getHistory();
  const saved = serializeComposition(bus.getDocument());
  session.destroy();
  return {
    tool: tool.kind,
    described: described.kind,
    undone,
    undoneHistory,
    redone,
    history,
    state: { status: state.status, timeUs: state.timeUs, runtimeHash: state.runtimeHash },
    events,
    errors,
    saved: saved.ok ? saved.text : null,
  };
};
window.hostFlowReady = true;
`;

/** The page of the editor: a container of the composition's size, and the bundle. */
export const FLOW_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden}#stage{width:${String(FLOW_WIDTH)}px;height:${String(FLOW_HEIGHT)}px}</style>
<script type="module" src="/flow.js"></script></head><body><div id="stage"></div></body></html>`;

/** The Node part, run in the clean project as `node host-flow.mjs --ffmpeg-dir <dir>`. */
export const FLOW_NODE_SCRIPT = `import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { SCHEMA_VERSION } from '@kadrion/schema';
import { parseComposition, serializeComposition, SUPPORTED_SCHEMA_VERSIONS } from '@kadrion/schema/migrate';
import { instantiateTemplate } from '@kadrion/schema/template';
import { contextOptions, launchChromium } from '@kadrion/producer';

const { values } = parseArgs({ options: { 'ffmpeg-dir': { type: 'string' } }, strict: true });
const release = JSON.parse(readFileSync('release.json', 'utf8'));
const flow = JSON.parse(readFileSync('flow.json', 'utf8'));
const BIN = 'node_modules/@kadrion/cli/dist/bin.js';

function kadrion(args, env = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

/** A job of D48: exit 0, and JSON lines on standard output ending in done. */
function job(args, env) {
  const result = kadrion(args, env);
  assert.equal(result.status, 0, args[0] + ' exited with ' + String(result.status) + ': ' + result.stderr);
  const lines = result.stdout.trim().split('\\n').map((line) => JSON.parse(line));
  assert.equal(lines.at(-1).event, 'done', args[0]);
  console.log(args[0] + ' done: ' + lines.filter((line) => line.event === 'file').map((line) => line.file).join(', '));
  return lines;
}

// 1. Load: the saved 0.1 text, by the CLI job and by the library, which agree (D43).
const savedText = readFileSync('saved-0.1.json', 'utf8');
const migrated = job(['migrate', 'saved-0.1.json', '--out', 'migrated.json']);
assert.deepEqual(migrated[0], { event: 'versions', versions: [...SUPPORTED_SCHEMA_VERSIONS] });
const loaded = parseComposition(savedText);
assert.equal(loaded.ok, true);
assert.deepEqual(loaded.versions, [...SUPPORTED_SCHEMA_VERSIONS]);
assert.equal(loaded.composition.schemaVersion, SCHEMA_VERSION);
const migratedText = readFileSync('migrated.json', 'utf8');
assert.deepEqual(JSON.parse(migratedText), JSON.parse(serializeComposition(loaded.composition).text));
console.log('migrated 0.1 to ' + SCHEMA_VERSION);

// 2. Edit: the browser packages in the pinned Chromium, on a page the host serves.
const ORIGIN = 'http://localhost:4523';
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const runtimeDir = join(
  fileURLToPath(import.meta.resolve('@kadrion/renderer-dom/runtime-build/kadrion-runtime.js')),
  '..',
);
function served(pathname) {
  if (pathname === '/') return { body: readFileSync('flow.html'), type: 'text/html; charset=utf-8' };
  if (pathname === '/flow.js') return { body: readFileSync('out/flow.js'), type: TYPES['.js'] };
  if (pathname === '/assets.json') return { body: readFileSync('assets.json'), type: TYPES['.json'] };
  const runtime = /^\\/runtime\\/(kadrion-runtime\\.(?:js|json))$/.exec(pathname);
  if (runtime !== null) {
    return { body: readFileSync(join(runtimeDir, runtime[1])), type: TYPES[extname(runtime[1])] };
  }
  const file = Object.values(flow.files).find((path) => '/' + path === pathname);
  if (file !== undefined) return { body: readFileSync(file), type: 'application/octet-stream' };
  return null;
}
const chromium = await launchChromium();
let edited;
try {
  const context = await chromium.browser.newContext(contextOptions(flow.width, flow.height));
  const unexpected = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const file = url.origin === ORIGIN ? served(url.pathname) : null;
    if (file === null) {
      unexpected.push(route.request().url());
      return route.abort('blockedbyclient');
    }
    return route.fulfill({ status: 200, body: file.body, headers: { 'content-type': file.type } });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => window.hostFlowReady === true);
  edited = await page.evaluate((text) => window.hostFlow(text), migratedText);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpected, []);
} finally {
  await chromium.browser.close();
}
assert.deepEqual(edited.errors, []);
assert.equal(edited.tool, 'command');
assert.equal(edited.described, 'description');
assert.equal(edited.undone, true);
assert.deepEqual(edited.undoneHistory, { canUndo: true, canRedo: true, undoDepth: 2, redoDepth: 1 });
assert.equal(edited.redone, true);
assert.deepEqual(edited.history, { canUndo: true, canRedo: false, undoDepth: 3, redoDepth: 0 });
assert.deepEqual(edited.state, { status: 'ready', timeUs: 1_000_000, runtimeHash: release.runtime.contentHash });
assert.ok(edited.events.includes('document'));
assert.ok(edited.events.includes('history'));
assert.ok(!edited.events.includes('error'));
assert.equal(typeof edited.saved, 'string');
writeFileSync('template.json', edited.saved);
console.log('edited in the session: ' + String(edited.events.length) + ' events, no error');

// 3. Render: the saved template, instantiated with values, in the jobs of a worker.
const template = parseComposition(edited.saved);
assert.equal(template.ok, true);
assert.deepEqual(template.versions, [SCHEMA_VERSION]);
assert.equal(template.composition.clips[0].volume, flow.edits.tool.args.volume);
const instance = instantiateTemplate(template.composition, flow.values);
assert.equal(instance.ok, true, JSON.stringify(instance.errors));
const nodes = instance.composition.scenes[0].nodes;
assert.equal(nodes.find((node) => node.id === 'node-title').text, flow.values.name);
assert.deepEqual(nodes.find((node) => node.id === 'node-title').position, flow.edits.ui.position);
assert.equal(nodes.find((node) => node.id === 'node-background').color, flow.values.brand);
writeFileSync('composition.json', serializeComposition(instance.composition).text);

assert.ok(values['ffmpeg-dir'] !== undefined, '--ffmpeg-dir is required');
const fetched = kadrion(['fetch-ffmpeg', '--dir', values['ffmpeg-dir']]);
assert.equal(fetched.status, 0, fetched.stderr);
const paths = Object.fromEntries(fetched.stdout.trim().split('\\n').map((line) => line.split(' ').slice(0, 2)));
const ffmpeg = { KADRION_FFMPEG: paths.ffmpeg, KADRION_FFPROBE: paths.ffprobe };
const doctor = kadrion(['doctor'], ffmpeg);
assert.ok(doctor.status === 0 || doctor.status === 3, doctor.stderr);
console.log('doctor reference ' + String(JSON.parse(doctor.stdout).reference));

const inputs = ['--composition', 'composition.json', '--assets', 'assets.json'];
const estimate = job(['estimate', ...inputs, '--preset', '720p', '--samples', '2', '--budget-ms', '600000'], ffmpeg);
const measured = estimate.find((line) => line.event === 'estimate');
assert.equal(measured.segments, 2);
console.log('estimate ' + String(measured.msPerFrame) + ' ms per frame');

const at = String(flow.segmentUs);
const end = String(flow.durationUs);
job(['render-range', ...inputs, '--out', 'part-b', '--preset', '720p', '--from-us', at, '--to-us', end], ffmpeg);
job(['render-range', ...inputs, '--out', 'part-a', '--preset', '720p', '--from-us', '0', '--to-us', at], ffmpeg);
job(['render-audio', ...inputs, '--out', 'audio'], ffmpeg);
job(['join', '--in', 'part-b', '--in', 'audio', '--in', 'part-a', '--out', 'joined'], ffmpeg);
job(['export', ...inputs, '--out', 'export', '--preset', '720p'], ffmpeg);
const joined = readFileSync('joined/video-720p.mp4');
const exported = readFileSync('export/video-720p.mp4');
assert.ok(joined.length > 0);
assert.ok(joined.equals(exported), 'the joined MP4 is not the MP4 of one export');
console.log('joined MP4 = one-pass export, ' + String(joined.length) + ' bytes');

const still = job(['render-still', ...inputs, '--out', 'still', '--time-us', '1000000', '--format', 'png'], ffmpeg);
const png = still.find((line) => line.event === 'file' && line.file.endsWith('.png'));
assert.ok(png !== undefined && existsSync(join('still', png.file)));
assert.deepEqual([...readFileSync(join('still', png.file)).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
console.log('host flow passed');
`;

/**
 * Writes the inputs of the flow into the clean project: the saved document, the
 * host's asset files and asset map, the page, and the two scripts.
 */
export function writeHostFlow(project: string): void {
  const assets = generateReferenceAssets();
  const hashes: Record<string, string> = {};
  const map: Record<string, { path: string; mediaType: string }> = {};
  mkdirSync(join(project, 'assets'), { recursive: true });
  for (const asset of assets) {
    const path = FLOW_ASSET_FILES[asset.id as keyof typeof FLOW_ASSET_FILES];
    writeFileSync(join(project, path), asset.bytes);
    hashes[asset.id] = sha256(asset.bytes);
    map[asset.id] = { path, mediaType: asset.mediaType };
  }
  writeFileSync(join(project, 'assets.json'), JSON.stringify(map));
  writeFileSync(join(project, 'saved-0.1.json'), JSON.stringify(savedDocument(hashes)));
  writeFileSync(
    join(project, 'flow.json'),
    JSON.stringify({
      width: FLOW_WIDTH,
      height: FLOW_HEIGHT,
      durationUs: FLOW_DURATION_US,
      segmentUs: FLOW_SEGMENT_US,
      values: FLOW_VALUES,
      edits: FLOW_EDITS,
      files: FLOW_ASSET_FILES,
    }),
  );
  writeFileSync(join(project, 'flow.html'), FLOW_PAGE);
  writeFileSync(join(project, 'flow-browser.js'), FLOW_BROWSER_ENTRY);
  writeFileSync(join(project, 'host-flow.mjs'), FLOW_NODE_SCRIPT);
}
