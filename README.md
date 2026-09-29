# Kadrion

Kadrion is a TypeScript engine for describing, previewing, editing, and
deterministically rendering video compositions. It is an engine/SDK, not an
end-user application, and it does not depend on any consumer product.

**Status: phase two.** The vertical spike is complete
([`docs/spike/report.md`](docs/spike/report.md), section 10); the current
phase is authoring and the preparation for the Taskio editor
([`docs/roadmap/phase-2.md`](docs/roadmap/phase-2.md)). Schema `0.1`, the evaluation core, the DOM
renderer and its runtime build, the Custom HTML sandbox, the Player, the
Producer with MP4 export, the command bus, and the AI tool contract exist. Each
of the five proofs of the spike has evidence in the repository, and the parity
of the Player and the Producer is measured and gated
([`docs/spike/report.md`](docs/spike/report.md)). The workflow runs on a
GitHub runner in the pinned image, and Q14 is closed: the run 36350016065 of
the validated PR-16 commit 531ab79 met every criterion, with its evidence in
[`docs/ci/q14-evidence.json`](docs/ci/q14-evidence.json)
([`docs/ci/first-run.md`](docs/ci/first-run.md)). The
repository is publicly visible, but the project is not open source: no licence
is granted, and the packages are private and unpublished (D37). The APIs below
are those of the spike and may still change.

## Documentation

- [`AGENTS.md`](AGENTS.md) — binding project instructions: decisions, invariants,
  package boundaries, workflow
- [`docs/adr`](docs/adr/README.md) — decision log (D01–D37; all accepted, except
  D10, superseded by D37)
- [`docs/spike/vertical-spike.md`](docs/spike/vertical-spike.md) — what the
  vertical spike has to prove, acceptance criteria, open questions, PR sequence
- [`docs/spike/report.md`](docs/spike/report.md) — what the spike proved, with
  its evidence and its limits
- [`docs/roadmap/phase-2.md`](docs/roadmap/phase-2.md) — the plan of phase
  two: authoring and the integration contract for the Taskio editor
- [`docs/ci/first-run.md`](docs/ci/first-run.md) — the first CI run, the
  evidence that closes Q14, and how Q14 reopens
- [`docs/architecture/package-boundaries.json`](docs/architecture/package-boundaries.json)
  — machine-checked package dependency map (see D12)

## Requirements

- Node.js 22 (`.node-version` pins 22.22.0; `engines` requires `>=22.13.0`)
- pnpm 11.27.0, pinned in `package.json` and launched through Corepack, which
  ships with Node.js 22. Either run `corepack enable pnpm` once, or prefix every
  pnpm command with `corepack`, as the examples below do.

The browser tests and the Producer need the Chromium that `playwright-core`
1.63.0 pins (D26): `corepack pnpm exec playwright-core install chromium --no-shell`.
The MP4 export needs the pinned FFmpeg build (D29.1), a Linux x64 build that
`node --run ffmpeg:fetch` downloads into `.kadrion-cache/ffmpeg/` and verifies.
It needs `tar`, and `xz` or `python3` with its `lzma` module to decompress the
archive.
Golden frames and the reference output come only from the pinned container
`mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30…a27` (D26.2), which
`tests/pinned/container/pinned-run.sh` runs; a run anywhere else is
informative.

## Commands

```bash
corepack pnpm install
corepack pnpm run check
```

| Script           | What it does                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| `typecheck`      | `tsc -b`: type-checks every project, including tests (writes `dist/`)   |
| `lint`           | ESLint with type-aware rules, zero warnings allowed                     |
| `format:check`   | Prettier check (`format` rewrites files)                                |
| `build`          | `tsc -b`, then the runtime build artifact of `renderer-dom` (D21)       |
| `test`           | Builds, then Vitest: repository-level checks and package tests          |
| `check`          | All of the above in that order; this is the gate for every pull request |
| `test:pinned`    | Builds, then the browser and export tests of `tests/pinned` (D26–D34)   |
| `ffmpeg:fetch`   | Downloads and verifies the pinned FFmpeg build (D29.1); needs a network |
| `goldens:update` | Writes the golden frames; refuses outside the pinned container (D26.5)  |
| `clean`          | Removes TypeScript build output                                         |

After installation the scripts also run without pnpm, for example
`node --run check`.

The playground (D25.9, D32) shows the engine in a browser. After
`node --run build`:

```bash
node --experimental-strip-types apps/playground/scripts/serve.ts
```

It serves http://127.0.0.1:4520/ (set `PORT` to change it). The page offers:

- **Showcases** — the reference composition, keyframes, a group transform,
  sandboxed Custom HTML, and a landscape canvas at 24 fps. Each shows the JSON it
  loads and where that file lives; `http://127.0.0.1:4520/#<id>` opens one
  directly. The sources are `apps/playground/src/showcases/*.json`, listed in
  `apps/playground/src/showcases.ts`; `tests/repo/showcases.test.ts` keeps them
  valid.
- **Your own JSON** — edit the shown JSON, paste another, or load a file. It is
  validated in full; errors are listed as the bus and the Player report them. A
  document can use the assets listed on the page (one image, one font with the
  glyphs ` DKabcdegimnorsty`, one audio track).
- **Editing** — drag a node on the canvas, run a `set_node_position` tool call
  (the AI tool of D31), and undo or redo either on the one command bus.
- **Run Custom HTML** — off by default. Checking it makes the page run the
  code of the loaded document's Custom HTML elements; that is the page's
  decision, not the document's, and it is not network isolation (D32.9, D36).

## Using Kadrion

The packages are workspace packages: an application in this repository depends
on them with `"@kadrion/<name>": "workspace:*"` and imports them by name. They
are ESM, and they resolve to `dist`, so run `node --run build` first. The
playground (`apps/playground`) and the tests of `tests/app` and `tests/pinned`
are complete, working examples of everything below.

| Package                  | Use it to                                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| `@kadrion/schema`        | validate a composition document and convert between times and frames   |
| `@kadrion/runtime`       | evaluate the state of a composition at one time                        |
| `@kadrion/renderer-dom`  | render evaluated state to DOM/SVG; it also ships the runtime build     |
| `@kadrion/player`        | preview a composition in a browser page                                |
| `@kadrion/editor-sdk`    | change a document through typed commands, with undo and redo           |
| `@kadrion/ai-sdk`        | give a model tools that dispatch the same commands                     |
| `@kadrion/producer`      | render frames and export MP4 in the pinned Chromium, from Node.js      |
| `@kadrion/cli`           | render frames and export MP4 from the command line                     |
| `@kadrion/test-fixtures` | the reference composition, its generated assets, and the golden frames |

### Rules every host follows

- The composition document is the only source of rendering truth. The state of
  a frame depends only on the document and the time.
- Times are integer microseconds (`timeUs`, `startUs`, `durationUs`), never
  seconds or floats (D04). The Producer renders only times on the frame grid of
  the composition's `fps`.
- Every node, scene, clip, animation, and asset has a stable, unique ID.
- The host supplies asset bytes. Each must hash to the SHA-256 its asset
  declares in `contentHash`. A missing asset or a different hash is an error,
  never a fallback. Fonts come only from font assets (D27).
- Edits go through the command bus, from the UI and from AI alike. Nothing
  changes a rendered page or the runtime directly.

### 1. Describe a composition

A composition is a JSON document of schema `0.1`
([`packages/schema/src/composition-schema.ts`](packages/schema/src/composition-schema.ts)).
Unknown fields are errors. This one shows a text that fades in:

```json
{
  "schemaVersion": "0.1",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationUs": 3000000,
  "assets": [
    {
      "id": "asset-font",
      "type": "font",
      "contentHash": "sha256:8b9741fd276dd775769286861ad4ff14d651a01aee1fb927cb5a784d3872a4a4"
    }
  ],
  "scenes": [
    {
      "id": "scene-main",
      "nodes": [
        { "id": "node-background", "type": "background", "color": "#101828" },
        {
          "id": "node-title",
          "type": "text",
          "position": { "x": 90, "y": 140 },
          "scale": { "x": 1, "y": 1 },
          "opacity": 1,
          "animations": [
            {
              "id": "anim-title-opacity",
              "property": "opacity",
              "interpolation": "linear",
              "keyframes": [
                { "timeUs": 0, "value": 0 },
                { "timeUs": 1000000, "value": 1 }
              ]
            }
          ],
          "text": "Kadrion",
          "fontAssetId": "asset-font",
          "fontSize": 144,
          "color": "#ffffff"
        }
      ]
    }
  ],
  "clips": []
}
```

- **Nodes:** `background`, `text`, `image`, `group`, and `custom-html`. Array
  order is the z-order.
- **Animations:** `opacity`, `position`, and `scale`, with linear keyframes.
- **Clips:** an audio track; schema `0.1` allows at most one.
- **Assets:** images, fonts, and audio, by ID and `contentHash`.

The font above is the one of `@kadrion/test-fixtures`. For every field, see the
reference composition
([`packages/test-fixtures/src/compositions/reference.json`](packages/test-fixtures/src/compositions/reference.json))
and the playground showcases.

### 2. Validate it

```ts
import { validateComposition } from '@kadrion/schema';

const result = validateComposition(JSON.parse(text));
if (!result.ok) {
  // Each error has a code, a JSON Pointer to the field, and a message.
  for (const error of result.errors) console.error(error.code, error.path, error.message);
} else {
  const composition = result.composition; // a ValidatedComposition
}
```

Only `validateComposition` produces a `ValidatedComposition`, and the other
packages validate what they are given themselves. `frameToTimeUs`,
`timeUsToFrame`, and `frameCount` convert between frames and microseconds.

### 3. Evaluate a frame

```ts
import { evaluateComposition } from '@kadrion/runtime';

const state = evaluateComposition(composition, 2_500_000);
// state.scenes[0].nodes: the resolved position, scale, and opacity of every node
```

The evaluation is pure: no DOM, no clock, no assets. A time that is not an
integer, or not in `[0, durationUs)`, throws an `EvaluationError`.

### 4. Preview it in a browser

The Player runs the runtime build of `@kadrion/renderer-dom` in a sandboxed
frame inside a container element. The host serves that build and passes its
bytes together with the `contentHash` of its manifest. The Player checks the
hash before it runs anything (D25.5).

```ts
import { createPlayer } from '@kadrion/player';

// Served from @kadrion/renderer-dom/runtime-build/kadrion-runtime.js and .json.
const bytes = new Uint8Array(await (await fetch('/kadrion-runtime.js')).arrayBuffer());
const { contentHash } = await (await fetch('/kadrion-runtime.json')).json();

// Give the container its size before the Player is created. Without
// `customHtml`, no Custom HTML runs (D36); see "Custom HTML in the Player".
const player = await createPlayer(container, { runtime: { bytes, contentHash } });

// The resolver gets { id, type, contentHash } and returns { bytes, mediaType }, or null.
await player.load(documentJson, ({ id }) => assets.get(id) ?? null);
await player.seek(2_500_000);
player.play();
player.pause();
player.getState(); // { status, timeUs, runtimeHash, error }
player.destroy();
```

- `load` validates the document in full.
- A failure rejects with a `PlayerError`, and `getState()` reports it with its
  `code`.
- After an edit, load the edited document again.

**Custom HTML in the Player.** Custom HTML is disabled by default (D36). A
Player created without `customHtml` never runs it: every Custom HTML element
is an empty box of its size and place, with no frame, so none of its script,
messages, requests, or WebRTC can start. The host enables it explicitly:

```ts
const player = await createPlayer(container, {
  runtime: { bytes, contentHash },
  customHtml: { mode: 'trusted' }, // or { mode: 'disabled' }, the default
});
```

- `trusted` is the host's decision to execute the code of every document this
  Player loads. It runs each element in its sandboxed frame without host
  secrets (D23), but it is **not** a security guarantee: the Player does not
  provide network isolation, and in a user's browser an element can still
  reach STUN and TURN servers and DNS through WebRTC. Trust only documents
  whose code you would run.
- The policy belongs to the host and holds for the Player's lifetime; it is
  never a field of the document. To change it, create a new Player.
- A policy other than these two forms is the `PlayerError` code
  `invalid-options`.
- The `Permissions-Policy`, the Content Security Policy, and the other response
  headers of the page that embeds the Player are the host's responsibility.
- The Producer renders Custom HTML as trusted and relies on its container's
  `--network none` for isolation (D28.9), not on the browser.

### 5. Edit through the command bus

```ts
import { createCommandBus } from '@kadrion/editor-sdk';

// The host's own error reporting; here it only logs.
function reportHostError(error: unknown): void {
  console.error(error);
}

// A PlayerError is checked by its code, not by instanceof (D25.7).
function isSuperseded(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'superseded'
  );
}

// Throws an EditorError if the document is invalid. Both options are optional.
const bus = createCommandBus(documentJson, {
  historyLimit: 100, // undo reaches this many operations; 0 keeps no history
  onListenerError: (error) => reportHostError(error), // needed by subscribe; must not throw
});

// Subscribe before the first edit: one frozen change per committed operation,
// delivered after the commit.
const unsubscribe = bus.subscribe((change) => {
  player.load(change.document, resolveAsset).catch((error: unknown) => {
    // player.load() may be rejected. It is rejected with the code `superseded`
    // when a newer load replaces this one, e.g. after undo and redo in a row;
    // that one is expected, and every other rejection goes to the host.
    if (!isSuperseded(error)) reportHostError(error);
  });
});

const result = bus.dispatch({
  type: 'SetNodePosition',
  nodeId: 'node-title',
  position: { x: 300, y: 400 },
});
result.document; // the edited document, validated in full
result.inverse; // the command that undoes it, or null when nothing changed

// Several commands as one operation: all or none, one undo step.
bus.dispatchTransaction([
  { type: 'SetNodeOpacity', nodeId: 'node-title', opacity: 0.5 },
  { type: 'SetTextContent', nodeId: 'node-title', text: 'Hello' },
]);

bus.undo(); // undoes the whole transaction
bus.redo();
bus.canUndo();

// Structure: add a complete node (every ID chosen by the host), duplicate it
// under a new ID, move it, remove it. Each result names the IDs it created.
bus.dispatch({ type: 'AddNode', parentId: 'scene-main', index: 2, node: captionNode });
const copy = bus.dispatch({ type: 'DuplicateNode', nodeId: 'caption', newNodeId: 'caption-2' });
copy.createdIds; // ['caption-2', 'caption-2-a-opacity'] for a caption with an opacity animation
bus.dispatch({ type: 'ReorderNode', nodeId: 'caption-2', index: 0 }); // to the bottom layer
bus.dispatch({ type: 'RemoveNode', nodeId: 'caption' }); // with its animations
unsubscribe();
```

- The field commands are `SetNodePosition` (the base position, in composition
  pixels), `SetNodeOpacity` (the base opacity, from 0 to 1), and
  `SetTextContent` (the text of a text node, exactly as given).
- The structural commands are `AddNode`, `RemoveNode`, `DuplicateNode`, and
  `ReorderNode`. They work on whole subtrees: a node carries its animations,
  and a group its children. `AddNode` takes a complete node whose IDs the host
  chooses; `DuplicateNode` takes the ID of the copy, and the other IDs derive
  from it: `<id>-c<i>` for the child at index i, `<id>-a-<property>` for an
  animation of the copy, and `<id>-c<i>-a-<property>` for an animation of a
  child. An ID already in the document is refused as `id-in-use`; never reusing
  an ID across the history is up to the host. `COMMAND_TYPES` lists every
  command.
- Every result and change carries `createdIds`: the IDs the operation created
  that still exist afterwards.
- A refused command or transaction throws an `EditorError` and leaves the
  document and the history unchanged. A command that changes nothing writes no
  history and delivers no change.
- A listener's error goes to `onListenerError` and never reaches the caller of
  `dispatch`. While a change is being delivered, a listener cannot change the
  document: `dispatch`, `dispatchTransaction`, `undo`, and `redo` throw `busy`.
- The bus is defined by D30, D38, and D39.

### 6. Let a model edit through the same bus

```ts
import { executeSetNodePosition, setNodePositionTool } from '@kadrion/ai-sdk';

// Offer the tool to a model: its name, description, and JSON Schema input.
const { name, description, inputSchema } = setNodePositionTool; // 'set_node_position'

// Run the model's call on the host's bus, exactly as a drag would.
const result = executeSetNodePosition(bus, { nodeId: 'node-title', position: { x: 300, y: 400 } });
```

The tool contract is defined by D31. The same arguments give the same document
as the equivalent UI command.

### 7. Render frames from Node.js

```ts
import { readFile } from 'node:fs/promises';
import { launchChromium, renderFrames } from '@kadrion/producer';

const files = { 'asset-font': { path: 'assets/font.ttf', mediaType: 'font/ttf' } };
const resolveAsset = async ({ id }: { id: string }) => {
  const file = files[id as keyof typeof files];
  return file === undefined
    ? null
    : { bytes: new Uint8Array(await readFile(file.path)), mediaType: file.mediaType };
};

const chromium = await launchChromium(); // refuses any Chromium but the pinned one
try {
  const { frames, manifest } = await renderFrames({
    document: documentJson,
    resolveAsset,
    timesUs: [0, 1_000_000, 2_500_000],
    chromium,
  });
  // frames: { index, timeUs, png }; manifest: the document hash, runtime, Chromium,
  // environment, assets, and the hash of every frame
} finally {
  await chromium.browser.close();
}
```

- Without `chromium`, `renderFrames` launches and closes a browser itself.
- Only a render in the pinned container is the reference output. Anywhere else,
  the pixels are informative (D26).

### 8. Export an MP4

```ts
import { exportMp4 } from '@kadrion/producer';

const { outputPath, manifest, stats } = await exportMp4({
  document: documentJson,
  resolveAsset,
  preset: '1080p', // or '720p'
  outputPath: 'out/video-1080p.mp4',
  ffmpeg: { ffmpegPath: '/abs/path/ffmpeg', ffprobePath: '/abs/path/ffprobe' },
});
```

- The export streams the frames to FFmpeg and writes no intermediate frames. It
  encodes H.264 video, and muxes the audio clip; schema `0.1` allows at most one
  (D16, D29).
- The FFmpeg paths must be absolute and name the pinned build. `PATH` is never
  searched, and the executables are verified by their SHA-256.
- A failed export removes its partial output.

### 9. The command line

```bash
node packages/cli/dist/bin.js render-frames --composition composition.json \
  --assets assets.json --out frames --times 0,1000000,2500000
```

```bash
node packages/cli/dist/bin.js export --composition composition.json \
  --assets assets.json --out video --preset 1080p
```

- **`--assets`:** a JSON file that maps each asset ID to `{ "path", "mediaType" }`,
  with paths relative to that file. For example:
  `{ "asset-font": { "path": "font.ttf", "mediaType": "font/ttf" } }`.
- **`render-frames`:** writes `frame-000000.png` and so on, plus
  `render-manifest.json`.
- **`export`:** writes `video-<preset>.mp4` and its render manifest.
- **FFmpeg:** it comes from `--ffmpeg` and `--ffprobe`, or from `KADRION_FFMPEG`
  and `KADRION_FFPROBE`.
- **Exit codes:** 0 for success, 2 for a usage error, and 1 for an error of the
  Producer.

## Layout

```text
packages/
  schema/ runtime/ renderer-dom/ player/ editor-sdk/ ai-sdk/ producer/ cli/ test-fixtures/
apps/
  playground/     local page that plays the reference composition (not a package)
docs/
  adr/            decision log
  architecture/   package dependency map
  ci/             the first CI run and the Q14 procedure
  spike/          vertical-spike specification, report, and parity record
tests/
  repo/           repository-level checks (boundaries, workspace structure, ADR log, Q14)
  app/            the playground's drag and the AI tool on one bus (P3, P4)
  parity/         the parity metric and record (D33, D34)
  ci/             the CI identity and the pinned test summary, and their generators
  pinned/         browser and export tests in Chromium (D26–D34)
```

## Conventions enforced by `tests/repo`

- The set of packages equals the list in `AGENTS.md`; each manifest is private,
  unlicensed, ESM, and described by its responsibility line from `AGENTS.md`.
- Workspace dependencies stay within the map in
  `docs/architecture/package-boundaries.json`; external runtime dependencies
  must be on its allowlist, with a reason and a licence.
- Every TypeScript file belongs to exactly one project. Package sources live in
  `packages/<name>/src`; package tests live in `packages/<name>/test` with a
  non-emitting `tsconfig.json` that references the package. Every project is
  referenced from the root `tsconfig.json`.
- Workspace packages are imported by name and resolve through `exports` to
  `dist`, so tests see what a consumer gets and `build` precedes `test`. Every
  workspace dependency has a matching TypeScript project reference (D11).
- Source files import only declared runtime dependencies (D12).
- The fixture assets are generated from code and pinned by their SHA-256; no
  binary asset is committed, only golden frames listed with their hashes
  (D14, D26.5, D27.5).
- `playwright-core`, the CI image, and the Producer's pins agree (D26).
- The hand-derived expected state and the hand-derived expected DOM tree stay
  in step with the reference composition, with each other, and with the golden
  timestamps of `AGENTS.md`.
- The sources of `player` may not use the network (D25.8), and no package
  depends on an application.
- The sources of `runtime`, `renderer-dom`, and `schema` may not reach a clock,
  a timer, a frame callback, a random source, the host page, a weak collection,
  or module state (specification §6.1, D20, D24; one named exception, D24.3), and
  only `validateComposition` may produce a
  `ValidatedComposition`. A test feeds violating source text to the real
  ESLint configuration and asserts the rejection.
- The decisions that `AGENTS.md` lists (D01–D09 and D37, which superseded D10)
  stay `Accepted`, and their quotations stay verbatim with `AGENTS.md`.
