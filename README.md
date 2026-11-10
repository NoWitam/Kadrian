# Kadrion

Kadrion is a TypeScript engine for describing, previewing, editing, and
deterministically rendering video compositions. It is an engine/SDK, not an
end-user application, and it does not depend on any consumer product.

**Status: phase five.** The vertical spike is complete
([`docs/spike/report.md`](docs/spike/report.md), section 10); phase two,
authoring ([`docs/roadmap/phase-2.md`](docs/roadmap/phase-2.md)), delivered
PR-18 to PR-22; phase three, the engine under a host's video editor
([`docs/roadmap/phase-3.md`](docs/roadmap/phase-3.md)), delivered PR-23 to
PR-34b; phase four, a host integrating the engine
([`docs/roadmap/phase-4.md`](docs/roadmap/phase-4.md)), delivered PR-37 to
PR-43; the current phase is motion graphics, effects, and reusable elements
([`docs/roadmap/phase-5.md`](docs/roadmap/phase-5.md)). Schema `0.23` with its forward migrations from `0.1` to `0.22`, the evaluation core, the DOM
renderer and its runtime build, the Custom HTML sandbox, the Player, the
Producer with MP4 export, the command bus, and the AI tool contract exist. Each
of the five proofs of the spike has evidence in the repository, and the parity
of the Player and the Producer is measured and gated
([`docs/spike/report.md`](docs/spike/report.md)). The workflow runs on a
GitHub runner in the pinned image. Q14 is open again: the run 41857750361 of
the validated main commit 062f532 met every criterion, but PR-46 changed the
pinned transitions test and the reports it writes, so its evidence was deleted
until a green run of a later commit, PR-47 added the pinned easing test and
its two reports, PR-48 the pinned motion test and its report, and PR-49 the
pinned text test and its two reports
([`docs/ci/first-run.md`](docs/ci/first-run.md)). The
repository is publicly visible, but the project is not open source: no licence
is granted, and the packages are private and unpublished (D37). The APIs below
are those of the spike and may still change.

## Documentation

- [`AGENTS.md`](AGENTS.md) — binding project instructions: decisions, invariants,
  package boundaries, workflow
- [`docs/adr`](docs/adr/README.md) — decision log (D01–D64; all accepted except D10, superseded by
  D37)
- [`docs/spike/vertical-spike.md`](docs/spike/vertical-spike.md) — what the
  vertical spike has to prove, acceptance criteria, open questions, PR sequence
- [`docs/spike/report.md`](docs/spike/report.md) — what the spike proved, with
  its evidence and its limits
- [`docs/roadmap/phase-2.md`](docs/roadmap/phase-2.md) — the plan of phase
  two: authoring and the integration contract for the Taskio editor
- [`docs/roadmap/phase-3.md`](docs/roadmap/phase-3.md) — the plan of phase
  three: the engine under a host's video editor
- [`docs/roadmap/phase-4.md`](docs/roadmap/phase-4.md) — the plan of phase
  four: a host integrates the engine
- [`docs/roadmap/phase-5.md`](docs/roadmap/phase-5.md) — the plan of phase
  five: motion graphics, effects, and reusable elements
- [`docs/integration/host-guide.md`](docs/integration/host-guide.md) — for a
  host: per task, the call, its errors, its limits, and the ADR that rules it
- [`docs/ci/first-run.md`](docs/ci/first-run.md) — the first CI run, and how
  Q14 closes and reopens
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
| `api:update`     | Builds, then writes `packages/*/api-report.txt` from the `.d.ts` (D60)  |
| `clean`          | Removes TypeScript build output                                         |

After installation the scripts also run without pnpm, for example
`node --run check`.

Each package commits an API report, `api-report.txt`: every export of its
`exports` map with its declaration, generated from the built `.d.ts`. `check`
fails when a report and the build differ (`tests/api/api-report.test.ts`), so a
pull request that changes the public surface changes the report in the same
diff and says whether the change is additive or breaking (D60).

The playground (D25.9, D32) shows the engine in a browser. After
`node --run build`:

```bash
KADRION_FFMPEG=<the pinned ffmpeg> node --run playground:media   # once, for the video showcase
node --experimental-strip-types apps/playground/scripts/serve.ts
```

It serves http://127.0.0.1:4520/ (set `PORT` to change it). The page offers:

- **Showcases** — the reference composition, keyframes, a group transform,
  sandboxed Custom HTML, a landscape canvas at 24 fps, and the features of
  phase three: a video in each `fit`, audio clips with fades, scenes with
  transitions, captions, and a template previewed with its defaults and
  instantiated with values. Each shows the JSON it
  loads and where that file lives; `http://127.0.0.1:4520/#<id>` opens one
  directly. The sources are `apps/playground/src/showcases/*.json`, listed in
  `apps/playground/src/showcases.ts`; `tests/repo/showcases.test.ts` keeps them
  valid, and `tests/pinned/showcases.pinned.test.ts` opens and plays each one in
  Chromium (D32.10). The video is made by the pinned FFmpeg from the recipe of
  the test fixtures into `.kadrion-cache/playground-media/`, which Git ignores;
  without it the video showcase reports `asset-missing`.
- **Your own JSON** — edit the shown JSON, paste another, or load a file. It is
  validated in full; errors are listed as the bus and the Player report them. A
  document can use the assets listed on the page (one image, one font with the
  glyphs ` DKabcdegimnorsty`, one audio track, and the fixture video).
- **Editing** — drag a node on the canvas, run a call of any tool of the AI
  catalogue (D46), and undo or redo either on the one command bus. A template
  can be instantiated with values of your own; the result opens as a new
  document.
- **Run Custom HTML** — off by default. Checking it makes the page run the
  code of the loaded document's Custom HTML elements; that is the page's
  decision, not the document's, and it is not network isolation (D32.9, D36).

## Using Kadrion

The packages are workspace packages: an application in this repository depends
on them with `"@kadrion/<name>": "workspace:*"` and imports them by name. They
are ESM, and they resolve to `dist`, so run `node --run build` first. A host
outside this repository installs the tarballs of a release instead (section 10,
D45), and the [host guide](docs/integration/host-guide.md) lists its tasks in
order, each with its call, errors, limits, and ADR. The
playground (`apps/playground`) and the tests of `tests/app` and `tests/pinned`
are complete, working examples of everything below.

| Package                   | Use it to                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| `@kadrion/schema`         | validate a composition document and convert between times and frames             |
| `@kadrion/runtime`        | evaluate the state of a composition at one time                                  |
| `@kadrion/renderer-dom`   | render evaluated state to DOM/SVG; it also ships the runtime build               |
| `@kadrion/player`         | preview a composition in a browser page                                          |
| `@kadrion/editor-sdk`     | change a document through typed commands, with undo and redo                     |
| `@kadrion/editor-session` | join the bus and the Player: every edit reaches the preview, one table of events |
| `@kadrion/ai-sdk`         | give a model tools that dispatch the same commands                               |
| `@kadrion/producer`       | render frames and export MP4 in the pinned Chromium, from Node.js                |
| `@kadrion/cli`            | render, export, and migrate as jobs; fetch FFmpeg; check the setup               |
| `@kadrion/test-fixtures`  | the reference composition, its generated assets, and the golden frames           |

`@kadrion/test-fixtures/compatibility` is a second entry of the fixtures: the
saved documents that must keep loading (D43). Tests read it; no package does.

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

A composition is a JSON document of schema `0.23`
([`packages/schema/src/composition-schema.ts`](packages/schema/src/composition-schema.ts)).
Unknown fields are errors. This one shows a text that fades in:

```json
{
  "schemaVersion": "0.23",
  "width": 1080,
  "height": 1920,
  "safeArea": { "fromTop": 0, "fromRight": 0, "fromBottom": 0, "fromLeft": 0 },
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
      "durationUs": 3000000,
      "nodes": [
        {
          "id": "node-background",
          "type": "background",
          "startUs": 0,
          "durationUs": 3000000,
          "color": "#101828",
          "animations": []
        },
        {
          "id": "node-title",
          "type": "text",
          "startUs": 0,
          "durationUs": 3000000,
          "position": { "x": 90, "y": 140 },
          "scale": { "x": 1, "y": 1 },
          "rotation": 0,
          "origin": { "x": 0, "y": 0 },
          "opacity": 1,
          "animations": [
            {
              "id": "anim-title-opacity",
              "property": "opacity",
              "keyframes": [
                { "timeUs": 0, "value": 0, "easing": { "kind": "ease-out" } },
                { "timeUs": 1000000, "value": 1, "easing": { "kind": "linear" } }
              ]
            }
          ],
          "text": "Kadrion",
          "fontAssetId": "asset-font",
          "fontSize": 144,
          "color": "#ffffff",
          "style": {
            "stroke": { "kind": "none" },
            "shadow": { "kind": "none" },
            "box": { "kind": "none" }
          },
          "textAnimations": [],
          "effects": [],
          "mask": { "kind": "none" },
          "matte": { "kind": "none" },
          "blendMode": "normal"
        }
      ],
      "clips": [],
      "transitions": [],
      "effects": []
    }
  ],
  "clips": [],
  "transitions": [],
  "definitions": [],
  "template": { "inputs": [], "bindings": [], "conditions": [], "repeats": [] }
}
```

- **Scenes:** a composition is a sequence of scenes, at least one, played in
  their order. A scene has an ID, a `durationUs`, its nodes, and its own audio
  clips; it has no start of its own: it starts where the scene before it ends,
  and the composition's `durationUs` must be the sum of the scenes' (D49, D54).
  Every time inside a scene is scene time, from 0 at the scene's start, so a
  scene renders alone exactly as it does in the sequence.
- **Transitions:** the composition's `transitions` sit on boundaries between
  adjacent scenes: during a transition's `durationUs` the incoming scene
  already plays over the end of the outgoing one, so it starts that much
  earlier and the composition is that much shorter. Its `effect` is
  `crossfade`, `fade-through-color` with a `color`, `slide`, `wipe`, or `push`
  with a `direction`, `zoom` with a `fromScale`, or `iris` with a `center`. A
  scene's own `transitions` join two clips of one layer whose lifetimes
  overlap by exactly the transition's duration, with any of these effects,
  whose frame is then the canvas (D49, D56, D66). A transition's `easing`
  shapes its progress like a keyframe's (D67).
- **Nodes:** `background`, `text`, `image`, `video`, `group`, `custom-html`,
  `captions`, `shape`, and `instance`. Array order is the z-order. An image or a video fills its box
  by `fit`: `fill`, `contain`, or `cover`; its `focus` `{ x, y }`, in per mille
  of the picture, is the point that stays in place: under `cover` it chooses
  what is cropped, under `contain` where the bars go, and `{ "x": 500, "y": 500 }`
  is the centre (D63).
- **Effects:** an image, a video, a text, captions, a group, and a scene have
  `effects`, CSS filters applied in their order after the content and the
  corner radius and before the opacity and the transform: `blur` with a
  `radius`, `brightness`, `contrast`, and `saturate` with a factor `amount`,
  `grayscale`, `invert`, and `sepia` with an `amount` from 0 to 1, `hue-rotate` with an
  `angle`, and `drop-shadow` with a `color`, an `opacity`, an `offset`, and a
  `blur`. Each effect animates its parameters in its own `animations`, on scene
  time. A group's and a scene's effects apply to everything in it composited
  together. An empty list draws no filter at all; any effect, even one that
  changes nothing, draws its holder in a pass of its own. The transition
  `blur-dissolve` with a `radius` blurs one side out while the other blurs in
  (D71). Five more kinds are SVG filters in sRGB, in the same list and order:
  `curves` with a table of levels per channel (`red`, `green`, `blue`) mixed in
  by `amount`, `color-grade` with `lift`, `gamma`, `gain`, `temperature`, and
  `tint`, `glow` with a `color`, an `opacity`, and a `radius`, `vignette` with
  an `amount` and a `size`, and `chroma-key` with a `key` channel (`green` or
  `blue`), a `tolerance`, a `softness`, and a `spill` (D72).
- **Compositing:** an image, a video, a text, captions, a shape, and a group
  end with a `mask`, a `matte`, and a `blendMode`, applied in that order after
  the effects: a `mask` of kind `shape` (a geometry of a shape in a box of the
  node, with `inverted` and a `feather`, its geometry and feather animated in
  its own `animations`) or `image` (an image asset by its `alpha` or
  `luminance`) moves with the node; a `matte` of kind `node` names a sibling
  `shape` node, drawn only into the mask, in the space of the parent, by
  `alpha`, `luminance`, or their inverted modes; `blendMode` is one of the 16
  modes of CSS `mix-blend-mode`, and a scene or group holding a node that
  blends is composited on its own (D75). An instance takes all three too.
- **Nested compositions:** the document's `definitions` are compositions built
  once, each with an `id`, its own canvas (`width`, `height`), a `durationUs`,
  nodes, audio clips, and clip transitions, and no video or Custom HTML. An
  `instance` node places one as a single layer: at scene time `t` it shows the
  definition at `sourceStartUs + (t − startUs)`, its canvas fitted to the
  instance's box by `fit`, and its effects, mask, matte, opacity, and blend
  mode apply to the definition composited as one picture. A definition may
  hold instances of others, 8 deep at most, never of itself
  (`definition-cycle`); inside an instance, the ID of a node, clip, or
  transition is addressed by the path of instance IDs to it, as
  `card-left/card-title`. The sounds of a definition play where an instance
  shows them (D76).
- **Elements:** a definition also has a `sourceHash`, `""` or a `sha256:`
  label a host gives the source it made the definition from (never checked),
  and a `template` of its own. A definition with a template is an element: an
  instance gives values to its inputs in `inputs`, sorted by input ID, each
  `{ inputId, type, value }`, and shows the definition instantiated with them
  exactly as `instantiateTemplate` instantiates a template; an input it gives
  no value takes its default. An element's inputs hold no assets. The binding
  `words` writes a list of `text`, `startUs`, and `durationUs` into the words
  of a captions node. `SetInstanceInput` and `ClearInstanceInput` edit the
  values of an instance, and `ReplaceDefinition` replaces a definition whole,
  its template included (D77).
- **Custom HTML:** a `custom-html` node holds its `html`, the font assets it
  uses in `fontAssetIds`, and typed `parameters` sorted by `key`, each
  `{ key, type, value }` of type `text`, `number`, `boolean`, or `color`. Its
  frame runs a managed clock before the html: CSS animations, the Web
  Animations API, `requestAnimationFrame`, `Date`, and `performance.now` all
  follow the time of its scene from the node's `startUs`, `Math.random` is
  seeded by the node and that time, and the element answers the host for
  itself unless it listens to messages, so an element needs no protocol code.
  A font is a face named by its asset ID; the number and colour parameters
  are the CSS custom properties `--<key>`, and all of them are
  `window.kadrion.parameters`. A binding of kind `parameter` writes a template
  input into one parameter. `SetCustomHtml` replaces the html, the fonts, and
  the parameters in one step, and the tool `check_custom_html` reports what
  in the html cannot run or cannot be deterministic (D78).
- **Video:** a `video` node shows source time
  `sourceStartUs + (t − startUs)` of its video asset; the frame is chosen from
  the container's own timestamps (D49, D50). Every source time a node samples
  must lie inside the video. The Producer decodes video with the pinned FFmpeg,
  so rendering a document with video nodes needs `--ffmpeg` and `--ffprobe`.
  The Player reads H.264 in MP4, fragmented MP4, QuickTime, or Matroska with
  Mediabunny (D79), decodes it in its host window with WebCodecs, and converts
  colour exactly as the Producer does, so both show the same pixels (D51); its
  resolver may return a video as a `Blob`, verified by SHA-256 before use, and
  it refuses files it cannot show exactly (such as HEVC, VP9, AV1, 10-bit,
  interlaced, BT.2020, or rotated) with `video-unsupported`, whose `details`
  list every reason. `inspectVideo` gives the same verdict before a load
  (section 4).
- **Lifetimes:** every node has `startUs` and `durationUs`, in the time of its
  scene, and is shown at scene time `t` while `startUs <= t < startUs +
durationUs`. A child of a group is shown only while its group is shown too. A
  lifetime may reach past the end of its scene, where it is cut. The render page
  declares a white background for the pixels no node covers (D42.5); that the
  pixels are white in the Producer and in the Player is measured in the pinned
  environment (D42.6).
- **Animations:** `opacity`, `position`, `scale`, `rotation`, and `origin` on
  every node but a background; `size`, `crop`, and `cornerRadius` on an image or
  a video; `color` on a text, captions, or a background (D68), with keyframes on scene
  time: a lifetime does not shift them. Each keyframe's `easing` shapes the
  segment that starts at it: `linear`, `hold` (the value stays until the next
  keyframe), `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier` with
  `x1`, `y1`, `x2`, `y2` (`x` from 0 to 1, `y` from -1 to 2), or `steps` with a
  `count` and a `position` (`start` or `end`). The easing of the last keyframe
  is never read. Every curve is computed with `+ - * /` only, so the Player
  and the Producer get the same bits; a curve that overshoots is held within
  the range of its property (D67).
- **Transform:** a node's `position` places the top-left corner of its box;
  `scale` and then `rotation` (degrees, positive clockwise) apply about its
  `origin`, a point of the box in per mille of its sides (a group's box is the
  canvas). An image or a video has a `crop`, per mille cut from each edge of
  its picture, and a `cornerRadius` in pixels (D68).
- **Clips:** any number of audio clips, in composition time in the
  composition's `clips` (sound that spans scenes, such as music) and in scene
  time in a scene's `clips` (sound that moves with its scene, cut at its end). A clip plays its
  asset from `sourceStartUs` for its `durationUs`, at a linear `volume` from 0
  to 1, with linear fades `fadeInUs` and `fadeOutUs`; clips and the sound of
  video nodes are summed (D52). A `video` node has a `volume` too: at 0 it is
  silent and its file needs no sound. The Producer mixes all of it with the
  pinned FFmpeg, sample-exact; the Player plays the same plan with Web Audio
  when the host gives it an audio context (D53).
- **Assets:** images, fonts, audio, and video, by ID and `contentHash`.

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

`validateComposition` accepts schema `0.23` only. The Player, the Producer, the
CLI, and the command bus therefore require a `0.23` document, and none of them
upgrades an older one. The validator's verdict on an older document is
`unsupported-schema-version` at `/schemaVersion`; the command bus reports it as
its own `invalid-document` error, with that verdict in the details. A host that
holds a document of schema `0.1` to `0.13` carries it forward itself, once, and stores the
result as a new version:

```ts
import { migrateComposition } from '@kadrion/schema/migrate';

const migrated = migrateComposition(JSON.parse(text));
if (migrated.ok) {
  migrated.composition; // a new, validated 0.23 document; the input is untouched
  migrated.versions; // ['0.1', …, '0.22', '0.23'], or ['0.23'] for a document that was current
} else {
  migrated.version; // the version the errors belong to, or null when none is known
  for (const error of migrated.errors) console.error(error.code, error.path, error.message);
}
```

- The step from `0.1` gives every node `startUs: 0` and the `durationUs` of the
  composition, so every node stays shown for the whole composition. Lengthening
  the composition later does not lengthen these lifetimes.
- The step from `0.2` gives every image `fit: "fill"`, which is how an image
  was always drawn.
- The step from `0.3` gives every video `volume: 0`, the silence it had, and
  every audio clip `sourceStartUs: 0`, `volume: 1`, `fadeInUs: 0`, and
  `fadeOutUs: 0`, the sound it had.
- The step from `0.7` gives the composition an empty template section,
  `"template": { "inputs": [], "bindings": [] }`: a composition that is no
  template (D58).
- The step from `0.8` gives the template section an empty list of
  `conditions` and of `repeats` after its bindings (D59).
- The step from `0.9` gives every image and video `focus: { "x": 500, "y": 500 }`
  right after its `fit`, the centre where it was always placed (D63).
- The step from `0.10` changes the version alone: every transition of `0.10`
  means the same in `0.11`, which adds kinds of transitions and lets a clip
  transition take every kind (D66).
- The step from `0.11` removes each animation's `interpolation`, which could
  only be `linear`, and gives every keyframe `easing: { "kind": "linear" }`
  after its `value`, and every transition `easing: { "kind": "linear" }` after
  its `effect`: the motion it always had (D67).
- The step from `0.12` gives every transformed node `rotation: 0` and
  `origin: { "x": 0, "y": 0 }` after its `scale`, every image and video no crop
  and `cornerRadius: 0` after its `focus`, and every background an empty list
  of `animations` after its `color`: the picture it always had (D68).
- The step from `0.13` gives every text a `style` with no stroke, no shadow,
  and no box, and an empty list of `textAnimations`, after its `color`: a text
  drawn in one piece, as it always was (D69).
- The step from `0.15` gives every scene, image, video, text, captions node,
  and group an empty list of `effects` as its last key: no filter, as it always
  had (D71).
- The step from `0.16` changes only `schemaVersion`: `0.17` adds kinds of
  effects (D72).
- The step from `0.17` changes only `schemaVersion`: `0.18` adds the node
  type `shape` (D73).
- The step from `0.18` changes only `schemaVersion`: `0.19` adds the asset
  type `svg` (D74).
- The step from `0.19` gives every image, video, text, captions node, shape,
  and group `mask: { "kind": "none" }`, `matte: { "kind": "none" }`, and
  `blendMode: "normal"` after its `effects`: the picture it always had (D75).
- The step from `0.20` gives the document an empty list of `definitions`
  before its `template`: no nested composition, as it always had (D76).
- The step from `0.21` gives every instance node an empty list of `inputs`
  after its `definitionId`, and every definition `sourceHash: ""` after its
  `id` and an empty `template` as its last key: no element, as it always had
  (D77).
- The step from `0.22` gives every Custom HTML node an empty list of
  `fontAssetIds` and of `parameters` after its `html` (D78).
- The steps change nothing else: IDs, the order of arrays and of keys, and
  every other value stay as they are.
- A document without a known `schemaVersion` is refused with
  `unsupported-schema-version` (D35, D42).

#### Save and load

The saved form of a composition is the composition itself as JSON text: no
envelope, and no version of a file format beside `schemaVersion` (D43).
Whatever a host keeps around a document is the host's own. Two functions of
`@kadrion/schema/migrate` read and write that text; a host calls them itself,
or runs `kadrion migrate` (section 9), and neither makes the Player, the
Producer, the render commands of the CLI, or the command bus accept an older
document.

```ts
import {
  parseComposition,
  serializeComposition,
  SUPPORTED_SCHEMA_VERSIONS,
} from '@kadrion/schema/migrate';

const loaded = parseComposition(text);
if (loaded.ok) {
  loaded.composition; // a new, validated 0.23 document that belongs to the caller
  loaded.versions; // ['0.1', …, '0.22', '0.23'] from 0.1, ['0.23'] when it was current
} else if (loaded.stage === 'text') {
  loaded.error.code; // 'not-a-string' or 'invalid-json': no document was reached
} else {
  loaded.version; // as with migrateComposition: the version the errors belong to, or null
  loaded.errors; // every error of the validation: there may be several
}

const saved = serializeComposition(composition);
if (saved.ok) {
  saved.text; // compact JSON without a trailing newline
} else {
  saved.errors; // the validator's errors: an older document is refused, never migrated
}

SUPPORTED_SCHEMA_VERSIONS; // ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '0.10', '0.11', '0.12', '0.13', '0.14', '0.15', '0.16', '0.17', '0.18', '0.19', '0.20', '0.21', '0.22', '0.23']: what this build can carry forward
```

- The text follows the rules of JSON and no others: a byte order mark is
  refused, the last of two equal keys wins, and every check of a number sees
  the value `JSON.parse` made of it, not its spelling. A `-0` is written as `0`.
- White space and the order of keys carry no meaning. The identity of a
  document is its composition hash, never the bytes of its text.
- A version that `SUPPORTED_SCHEMA_VERSIONS` does not list is refused; it is
  never read as the nearest known one.
- The list names what can be **migrated**, not what is **accepted**:
  `validateComposition`, and everything built on it, accepts its last version
  only. The validator's message for an earlier document, that this build
  supports `"0.23"`, speaks of that.

Loading replaces the document, so a host creates a new command bus for it,
with a fresh history, and publishes it only after the load succeeded:

<!-- host-example:start -->

```ts
import {
  createCommandBus,
  type BusListener,
  type CommandBus,
  type ListenerErrorHandler,
} from '@kadrion/editor-sdk';
import {
  parseComposition,
  serializeComposition,
  type ParseCompositionResult,
} from '@kadrion/schema/migrate';

/** What a host keeps for the document that is open. */
interface Session {
  readonly bus: CommandBus;
  readonly unsubscribe: () => void;
}

export interface Host {
  open(text: string): ParseCompositionResult;
  save(): string | null;
  bus(): CommandBus | null;
}

export function createHost(onChange: BusListener, onListenerError: ListenerErrorHandler): Host {
  let session: Session | null = null;
  return {
    open(text) {
      const loaded = parseComposition(text);
      // Refused: the open document, its history, and its listener stay as they are.
      if (!loaded.ok) return loaded;
      // A new bus, and so a fresh history, for the loaded document (D32). It is
      // built and subscribed before it is published in one assignment.
      const bus = createCommandBus(loaded.composition, { onListenerError });
      const unsubscribe = bus.subscribe(onChange);
      session?.unsubscribe();
      session = { bus, unsubscribe };
      // loaded.versions.length > 1: it was migrated; store it as a new version (D02).
      return loaded;
    },
    save() {
      if (session === null) return null;
      const saved = serializeComposition(session.bus.getDocument());
      return saved.ok ? saved.text : null;
    },
    bus: () => session?.bus ?? null,
  };
}
```

<!-- host-example:end -->

`parseComposition` sees no bus, so a refused text cannot change one; replacing
the open document in one step is this host's own code. A repository test runs
this very example and shows that it keeps its bus, its history, and its
listener when a load is refused. That is evidence for this example, not for a
host written otherwise.

#### Templates

A composition with a non-empty `template` section is a template (D58). Its
`inputs` declare what a host fills in — `text`, `number`, `boolean`, `color`,
an `image`, `video`, or `audio` asset by content hash, and a `list` of items
of those types — each with constraints and a default. Its `bindings` say where
a value goes: a whole `text` or `color` property of a node, a text whose
`{{inputId}}` placeholders stand for text and number inputs, or the content
hash of an asset. A bound property or asset always holds its input's default,
so a template is also a valid composition of its defaults.

The Player and the Producer refuse a template with `invalid-document`; a host
renders its instantiation:

```ts
import { instantiateTemplate, templateDefaults } from '@kadrion/schema/template';

const result = instantiateTemplate(template, { name: 'Ada', rank: 42 });
if (result.ok) {
  result.composition; // a validated composition with an empty template section
} else {
  // invalid-values, unknown-input, invalid-input-value, or invalid-composition,
  // each with the input it is about and the path of the value.
  for (const error of result.errors) console.error(error.code, error.inputId, error.path);
}
templateDefaults(template); // what an input left out takes
```

Since `0.9` a template also has `conditions` and `repeats` (D59). A condition
keeps a scene or a node only while its test of an input holds — `empty` and
`not-empty` (a text or a list), `true` and `false` (a boolean), `equal-text`,
and `equal-number` — and a false one removes the element with everything in
it and every transition that names it. A repeat replaces a scene or a node by
one copy for each item of a list, one after the other: each copy lasts the
`durationUs` of its target, or the number of microseconds a field of its item
names. Copy `k` of an ID `x` is `x--k`. Inside a repeat, `{{list.key}}` and
the bindings `item-property` and `item-asset` write the fields of the copy's
item; an asset bound to a field becomes one asset per item. An instantiation
whose copies would hold more than 100 000 IDs is refused with `repeat-limit`.

Instantiation is pure: the same template and values give the same document,
key for key. The same function, from the main entry, instantiates every
element instance where its definition is shown (D77). `@kadrion/editor-session` previews a template as its
instantiation with the defaults, while its bus edits the template itself with
the nine template commands (D58.6, D59.6).

### 3. Evaluate a frame

```ts
import { evaluateComposition } from '@kadrion/runtime';

const state = evaluateComposition(composition, 2_500_000);
// state.scenes: the scene playing at that time, with its scene time (timeUs minus its start);
// state.scenes[0].nodes: whether each node is active, and its resolved position, scale, and opacity
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
player.setPlayRange({ startUs: 1_000_000, endUs: 2_000_000, loop: true });
player.getState(); // { status, timeUs, runtimeHash, error, playRange }
player.destroy();
```

- `load` validates the document in full.
- A failure rejects with a `PlayerError`, and `getState()` reports it with its
  `code`.
- After an edit, `player.update(editedDocument, resolver)` shows it in the same
  page at the time shown now; it asks the resolver only for assets whose hash
  the Player does not hold yet, and it plays on if it was playing (D44.5).
  `player.subscribe(listener)` reports every change of the state; it needs the
  option `onListenerError` of `createPlayer`.
- Playback events (D61): the status is `ended` once a play reached the last
  frame of the document or of the play range, and `waiting` while the frame
  the clock is at, or the sound, is not ready yet; the frames the clock asks
  for leave the status `playing`. `setPlayRange({ startUs, endUs, loop })`
  keeps playback inside a range on the frame grid, and with `loop` restarts it
  at `startUs`, sound included, sample for sample; `null` is the whole
  document. A `PlayerError` about an asset names it in
  `asset: { id, contentHash }`.

**Whether a video plays as it is.** `inspectVideo(blobOrBytes)` of
`@kadrion/player` reads a file and returns the Player's verdict on it, from the
same examination the Player uses when it loads the video (D79.4):
`{ playable, reasons, container, format, video, audio }`. Each reason has a
`code` (`unreadable`, `container`, `no-video`, `codec`, `bit-depth`, `chroma`,
`interlaced`, `colour`, `rotation`, `timing`, or `audio-channels`; treat a code
you do not know as "not directly") and a `message`; `video` holds the codec,
size, rotation, frames, `durationUs`, time base, and frame rate, and `audio`
the codec, channels, and sample rate. A host transcodes a file that is not
`playable` before it uses it. It reads no URL: fetch the file and pass the
`Blob`. The Player imports `mediabunny`; a host that serves the Player's
`dist` through an import map maps `mediabunny` to
`mediabunny/dist/bundles/mediabunny.mjs` of the installed package, as the
playground does, and a bundler resolves it by itself.

**Sound in the Player.** A Player plays no sound unless the host passes an
`AudioContext` at 48 kHz, created on a gesture of the user:
`createPlayer(container, { runtime, audio: { context } })` with
`context = new AudioContext({ sampleRate: 48000 })` (D53). It then decodes the
sources the document hears, plays them on the Producer's sample grid, and the
picture follows the context's clock. `player.prepareAudio(asset, resolveAsset)`
decodes one audio or video asset and returns its length; `editor-session`
reads these facts, so the bus refuses a clip or a heard video that reads past
its source (`source-range-exceeded`) or whose source it does not know
(`media-facts-missing`).

**The size of an image.** `player.prepareImage(asset, resolveAsset)` verifies
one image asset and returns `{ width, height }`, read from its PNG, JPEG, or
WebP header by Kadrion's own parser, with no decode; `session.readMediaFacts`
of an image returns `{ type: 'image', width, height }` the same way (D62). The
size is the one an image node lays out: the EXIF orientation of a JPEG or a
PNG is applied as the pinned Chromium applies it, and a WebP's is ignored, as
Chromium ignores it. Another media type is `image-unsupported`, and bytes that
are not a whole file of their media type are `image-invalid`, in both hosts,
which refuse such an image when they resolve it. The Producer compares each
image's header with the pinned Chromium's decode before the first frame
(`image-size-mismatch`).

**SVG assets.** An asset of type `svg` (media type `image/svg+xml`) is a
drawing that an image node shows as an image, so it runs no script and loads
nothing (D74). Its bytes must pass `readSvg` of `@kadrion/schema`, Kadrion's
own sanitiser, which both hosts and `svgToShapes` call: UTF-8 XML of shapes,
paths, groups, and linear and radial gradients painted by presentation
attributes, with a whole `width` and `height` and a `viewBox` on the root.
Anything else is refused, never stripped, with the code of its first offence
and where it lies: `svg-script`, `svg-event-attribute`, `svg-foreign-object`,
`svg-external-reference` (an `href`, or a `url()` other than `url(#id)`),
`svg-style` (CSS beyond presentation attributes), `svg-animation`,
`svg-element`, `svg-attribute`, `svg-value`, and others. The hosts report it
as `svg-refused`. `prepareImage` and `session.readMediaFacts` of an SVG return
its `width`, `height`, and `viewBox`. To animate its parts, convert it:

```ts
import { svgToShapes } from '@kadrion/editor-sdk';

const nodes = svgToShapes(svgBytes, {
  idPrefix: 'logo', // the nodes are logo-1, logo-2, …
  x: 40,
  y: 40,
  width: 320,
  height: 160, // the box it fills, as an image with fit fill
  startUs: 0,
  durationUs: 2_000_000,
});
session.bus.dispatchTransaction(
  nodes.map((node, index) => ({ type: 'AddNode', parentId: 'scene-main', index: 1 + index, node })),
);
```

Each drawn element becomes one `shape` node with its path in a box around
itself, its origin at its centre. What a shape cannot state, such as dashes in
user units, a gradient in the units of a bounding box, or a stroke under an
uneven scale, is refused with `svg-not-convertible`, naming the element.

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
  The render page and every element inherit the page's policy, so it must
  admit inline script and style, `data:` images, and `data:` fonts
  (`font-src data:`) for the fonts of Custom HTML (D78).
- The Producer renders Custom HTML as trusted and relies on its container's
  `--network none` for isolation (D28.9), not on the browser.

### 5. Edit through the command bus

Here `documentJson` is the document of section 1, and `captionNode` is a
complete text node with the ID `caption` and one position animation.

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
copy.createdIds; // ['caption-2', 'caption-2-a-position'] for a caption with a position animation
bus.dispatch({ type: 'ReorderNode', nodeId: 'caption-2', index: 0 }); // to the bottom layer
bus.dispatch({ type: 'RemoveNode', nodeId: 'caption' }); // with its animations

// Animations: add a complete one (its ID chosen by the host) to a node that does
// not animate that property yet, then edit its keyframes, each addressed by its
// animation and its time in microseconds.
const fadeIn = {
  id: 'fade-in',
  property: 'opacity',
  keyframes: [
    { timeUs: 0, value: 0, easing: { kind: 'linear' } },
    { timeUs: 1_000_000, value: 1, easing: { kind: 'linear' } },
  ],
};
bus.dispatch({ type: 'AddAnimation', nodeId: 'caption-2', index: 1, animation: fadeIn });
bus.dispatch({ type: 'SetOpacityKeyframe', animationId: 'fade-in', timeUs: 500_000, opacity: 0.5 });
bus.dispatch({
  type: 'SetKeyframeEasing',
  animationId: 'fade-in',
  timeUs: 0,
  easing: { kind: 'cubic-bezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
});
bus.dispatch({ type: 'MoveKeyframe', animationId: 'fade-in', timeUs: 500_000, toTimeUs: 750_000 });
bus.dispatch({ type: 'RemoveKeyframe', animationId: 'fade-in', timeUs: 750_000 });
bus.dispatch({ type: 'RemoveAnimation', animationId: 'fade-in' });

// Lifetime: when a node is shown, in composition time. It moves no keyframe.
bus.dispatch({
  type: 'SetNodeLifetime',
  nodeId: 'caption-2',
  startUs: 1_000_000,
  durationUs: 1_500_000,
});
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
- The property and asset commands are `SetNodeScale`, `SetNodeSize`,
  `SetNodeColor`, `SetTextFontSize`, `SetTextFont`, `SetImageAsset`, `AddAsset`,
  and `RemoveAsset`. Sizes are rounded like positions, and a colour is stored
  in lower case. An image or a text may point only at an asset of the
  document of the right type (`unknown-asset`, `asset-type-mismatch`), and an
  asset that is still used cannot be removed (`asset-in-use`, with its users).
- The animation commands are `AddAnimation`, `RemoveAnimation`,
  `SetOpacityKeyframe`, `SetPositionKeyframe`, `SetScaleKeyframe`,
  `AddKeyframe`, `RemoveKeyframe`, `MoveKeyframe`, and `SetKeyframeEasing`. A keyframe has no ID: it
  is addressed by its time, and the keyframes stay in the order of their times.
  A typed command sets the value at a time, or inserts a keyframe there, and
  applies only to an animation of its property (`animation-property-mismatch`);
  `AddKeyframe` takes a keyframe as exact data. A keyframe a typed command
  inserts takes the easing of the keyframe before it, or `linear` when there is
  none; one it changes keeps its easing, and so does a moved one (D67). Times are integer microseconds,
  never rounded, and may lie after the end of the composition. A node animates
  each property once (`duplicate-animation-target`), `AddKeyframe` or a move
  onto a taken time is refused (`keyframe-exists`), and a removal that would
  leave an animation fewer keyframes than the schema allows is refused
  (`too-few-keyframes`): remove the whole animation instead, or, to replace
  every keyframe in a transaction, insert the new ones before removing the old.
  Animations are read from `getDocument()`.
- `SetNodeLifetime` sets `startUs` and `durationUs` of any node, the background
  and a child of a group included. Both are integer microseconds, never rounded,
  and the duration is at least 1. It changes when the node is shown and nothing
  else: the node's keyframes keep their composition times. A node added with
  `AddNode` carries its lifetime like every other field.
- The video commands are `SetNodeFit`, `SetNodeFocus` (D63; images too),
  `SetVideoAsset`, `SetVideoSource` (D50), and `SetVideoVolume`. The audio commands are `AddAudioClip`,
  `RemoveAudioClip`, `SetClipVolume`, `SetClipFades`, and `SetClipSource`
  (D52): a clip is added whole, like a node, and is addressed by its ID
  (`unknown-clip`); a volume is a factor from 0 to 1, and the two fades
  together fit in the clip's duration.
- After `AddAsset`, the host must supply the new asset's bytes whenever the
  document is loaded, even while nothing uses it; after `RemoveAsset`, a host
  that passes asset URLs must stop passing the removed asset's URL.
- Every result and change carries `createdIds`: the IDs the operation created
  that still exist afterwards.
- A refused command or transaction throws an `EditorError` and leaves the
  document and the history unchanged. A command that changes nothing writes no
  history and delivers no change.
- A listener's error goes to `onListenerError` and never reaches the caller of
  `dispatch`. While a change is being delivered, a listener cannot change the
  document: `dispatch`, `dispatchTransaction`, `undo`, and `redo` throw `busy`.
- The bus is defined by D30, D38, D39, D40, D41, and D42.

**The host facade.** `@kadrion/editor-session` does the joining of a bus and a
Player for a host editor (D44):

```ts
import { createEditorSession } from '@kadrion/editor-session';

const player = await createPlayer(container, {
  runtime: { bytes, contentHash },
  onListenerError: reportError,
});
const session = await createEditorSession({
  document: documentJson,
  player, // not loaded yet; the session loads it and destroys it with itself
  resolveAsset: ({ id }) => assets.get(id) ?? null,
  onListenerError: reportError,
});
session.subscribe((event) => {
  // event.type is 'document', 'history', 'playback', or 'error'.
});
session.bus.dispatch(command); // reaches the preview at the time it shows
await session.settled();
session.destroy();
```

- Edits go through `session.bus`, the one bus; the session has no other path
  into the document. Edits made while an update runs are coalesced: only the
  latest document is sent.
- `history` carries `canUndo`, `canRedo`, `undoDepth`, and `redoDepth`;
  `playback` the Player's state, with `ended`, `waiting`, and the play range
  (D61); `error` a `PlayerError` when the preview could not show a document,
  which stays on the bus all the same. `session.setPlayRange` passes a play
  range to the Player.

### 6. Let a model edit through the same bus

```ts
import { executeTool, TOOL_CATALOGUE } from '@kadrion/ai-sdk';

// Offer the tools to a model: each has a name, a description, and a JSON Schema input.
const tools = TOOL_CATALOGUE.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

// Run each call of the model on the host's bus, exactly as the same edit in the UI.
const result = executeTool(bus, 'set_node_position', {
  nodeId: 'node-title',
  position: { x: 300, y: 400 },
});
```

- There is one tool per command of the registry (`set_node_position`,
  `add_node`, `set_opacity_keyframe`, …), plus `describe_document`, which
  returns the IDs, types, lifetimes, layers, and fields of the document and
  changes nothing, `add_clip_transition_at_cut`, which puts a clip
  transition on a cut by trimming the two clips and adding it as one undoable
  step (`clipTransitionAtCut` of `@kadrion/editor-sdk` builds the same
  commands for a host), `check_custom_html`, which reads the html of a Custom
  HTML element for network requests, timers, wall clocks, storage, and
  navigation and, when the host lends a render check (`checkCustomHtml` of
  `@kadrion/producer`), renders the element alone forward and backward and
  reports every frame that differs (D78), and `run_transaction`, which applies
  several tool calls as one undoable step.
- A tool needs `getDocument`, `dispatch`, and `dispatchTransaction` of the bus,
  never undo or redo. Refusals are the bus's `EditorError` codes, and a refused
  call changes nothing.
- The catalogue is defined by D46, on the contract of D31, and the tool at a
  cut by D66. The same arguments
  give the same document as the equivalent UI command.

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
- A document with video nodes also needs `ffmpeg`: the pinned FFmpeg decodes
  the source frames, and the manifest records how (`video`, D50). Every sampled
  source range is checked against the video before the page opens
  (`source-range-exceeded`).
- A video or an audio asset may also come by path: the resolver returns
  `{ path, mediaType }` with an absolute path, and the Producer reads the file
  where it is, without holding it in memory or copying it. It verifies the
  file's SHA-256 by streaming it, checks `maxAssetBytes` against its size before
  reading it, and refuses a file that changes after that with `asset-changed`
  (D64). Images and fonts always come as bytes. The CLI hands video and audio of
  its asset map to the Producer by path.
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
  encodes H.264 video, and mixes every clip and the sound of every video node
  above volume 0 into one AAC track, each sound placed on the 48 kHz sample
  grid (D29, D52). A source too short for what is heard is refused as
  `source-range-exceeded` before the first frame; a composition in which nothing
  is heard has no audio track.
- The FFmpeg paths must be absolute and name the pinned build. `PATH` is never
  searched, and the executables are verified by their SHA-256.
- A failed export removes its partial output.
- The video is a sequence of segments of `segmentFrames` frames (default 60),
  each encoded by its own FFmpeg process; the export renders them and joins
  them with the audio (D47).

A host's queue can render the same MP4 in jobs (D47): `renderSegments` renders
a range of whole segments, `renderAudio` the audio of a range, and
`joinSegments` checks their manifests and joins them into the MP4 that one
`exportMp4` would write, byte for byte. `renderStill` renders one frame as PNG,
JPEG, or WebP.

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

A render in jobs, in any order and in separate processes (D47):

```bash
node packages/cli/dist/bin.js render-range --composition composition.json \
  --assets assets.json --out part-a --preset 720p --from-us 0 --to-us 6000000
node packages/cli/dist/bin.js render-range --composition composition.json \
  --assets assets.json --out part-b --preset 720p --from-us 6000000 --to-us 10000000
node packages/cli/dist/bin.js render-audio --composition composition.json \
  --assets assets.json --out audio
node packages/cli/dist/bin.js join --in part-a --in part-b --in audio --out video
node packages/cli/dist/bin.js render-still --composition composition.json \
  --assets assets.json --out still --time-us 2500000 --format png
```

- **`render-range`:** writes `segment-NNNNNN.mp4` files and
  `segments-<first>-<last>.manifest.json`. Both ends of the range must lie on
  the segment grid; without them the range is the whole composition.
  `--grid-from-us` and `--grid-to-us` anchor the grid on a fragment instead,
  and `--min-segment-frames` merges a shorter last segment into the one before
  it, so a fragment on any frames renders in segments of at least that length;
  every job of the fragment gives the same grid, and the join checks it
  (proposed in D80).
- **`render-audio`:** writes `audio.wav` and `audio.manifest.json`. Its range is
  the range the join must cover, so a preview of a range is that range at
  `720p`, its audio, and a join.
- **`join`:** reads the manifests of the `--in` directories, exactly one of them
  an audio manifest, refuses parts that are not one render, and writes
  `video-<preset>.mp4` and its render manifest.
- **`render-still`:** writes `still-NNNNNN.<png|jpg|webp>` and its manifest; PNG
  needs no FFmpeg unless the document has video nodes, and neither does
  `render-frames`.
- Every file is written under a temporary name and renamed when complete.
- **FFmpeg:** it comes from `--ffmpeg` and `--ffprobe`, or from `KADRION_FFMPEG`
  and `KADRION_FFPROBE`.

Each of these commands is a job a host's queue can run (D48):

- **Standard output** is JSON lines and nothing else: `start`, one `frame` per
  frame, one `segment` per finished segment, one `file` per file written, and
  last one `done` or `error`. Diagnostics go to standard error.

  ```text
  {"event":"start","frames":120,"segments":2}
  {"event":"frame","frame":0,"done":1,"frames":120}
  {"event":"segment","segment":0,"done":1,"segments":2}
  {"event":"file","file":"segment-000000.mp4"}
  {"event":"file","file":"segments-000000-000001.manifest.json"}
  {"event":"done","manifest":"segments-000000-000001.manifest.json"}
  ```

- **Cancellation:** `SIGTERM` or `SIGINT` stops Chromium and FFmpeg, removes
  what the job wrote, and exits 5. A job killed without a signal leaves only
  files under their temporary names, which the next run replaces.
- **Limits:** `--max-document-bytes`, `--max-duration-us`, `--max-frames`,
  `--max-assets`, `--max-asset-bytes`, and `--max-total-asset-bytes` are checked
  before rendering; `--max-wall-ms` cancels the job when its time is up.
  `join` takes only `--max-wall-ms`.
- **Exit codes:** 0 for success, 1 for an error of the Producer or of the FFmpeg
  installation, 2 for a usage error, 4 for an exceeded limit, 5 for a
  cancelled job, and 6 for a document `migrate --check` finds not current.
- **`estimate`:** renders and encodes a few frames, keeps none of them, and
  reports the time per frame and how many segments fit into `--budget-ms`:

  ```bash
  node packages/cli/dist/bin.js estimate --composition composition.json \
    --assets assets.json --preset 1080p --samples 10 --budget-ms 600000
  ```

In the library, every job takes `signal` (an `AbortSignal`), `onProgress`, and
`limits`.

Stored documents are migrated by a job too (D43, amended by PR-41):

```bash
node packages/cli/dist/bin.js migrate saved.json --out migrated.json
node packages/cli/dist/bin.js migrate saved.json --check
```

- **`migrate`:** reads one saved document with `parseComposition`, reports the
  versions it passed through in a `versions` line, and writes
  `serializeComposition` of the result to `--out`, which may be the input
  itself; the file is written under a temporary name and renamed.
- **`--check`:** writes nothing; it exits 0 when the document is current and 6
  (`not-current`) when it is valid but of an earlier version.
- **A refused document:** an `invalid` line carries what `parseComposition`
  reported (`stage`, and the text error or the document's `version`,
  `versions`, and every validation error), then the `error` line
  `invalid-document` with exit 1. Nothing is written.
- It takes no limit of a render, only `--max-wall-ms`. A directory or a
  database is the host's loop.

  ```text
  {"event":"versions","versions":["0.1","0.2","0.3","0.4","0.5","0.6","0.7","0.8","0.9","0.10","0.11","0.12","0.13","0.14","0.15","0.16","0.17","0.18","0.19","0.20","0.21","0.22","0.23"]}
  {"event":"file","file":"migrated.json"}
  {"event":"done","manifest":null}
  ```

The Player's verdict on a video file, without a browser (D79.6):

```bash
node packages/cli/dist/bin.js inspect --json upload.mov
```

- **`inspect`:** prints the verdict of `inspectVideo` (section 4) as JSON with
  `--json`, or as lines of text without, and exits 0 whether the file plays or
  not; 1 when the file cannot be opened, 2 for a usage error.

For a host's worker (D45):

```bash
kadrion fetch-ffmpeg --dir /opt/kadrion/ffmpeg
kadrion doctor --ffmpeg /opt/kadrion/ffmpeg/autobuild-2026-09-21-13-55/bin/ffmpeg \
  --ffprobe /opt/kadrion/ffmpeg/autobuild-2026-09-21-13-55/bin/ffprobe
```

- **`fetch-ffmpeg`:** downloads the pinned FFmpeg archive unless a verified one
  is in the directory, refuses any other bytes, installs `ffmpeg` and `ffprobe`
  only when both have their pinned SHA-256, and prints both paths. It needs a
  network; the render does not.
- **`doctor`:** prints a JSON report of whether this process is the one
  environment whose output is reference output: Linux x64, the pinned image
  declared in `KADRION_PINNED_IMAGE`, the pinned Playwright and Chromium, the
  pinned FFmpeg (from the flags or `KADRION_FFMPEG` and `KADRION_FFPROBE`), no
  network but loopback, and the runtime build. It exits 0 when every check
  passes and 3 otherwise; output anywhere else is informative.

### 10. Installing a release

A release is the tag `v<version>` of this repository. Its GitHub release holds
one tarball per package, `kadrion-<name>-<version>.tgz`, and
`kadrion-release.json`, which names each tarball by its SHA-256 and its
`integrity`, together with the schema version the release validates, the
versions its migration accepts (D43), the hash of the runtime build, and the
pinned image and FFmpeg of the reference environment. `@kadrion/test-fixtures`
is not shipped. The release workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml)) installs the
tarballs into a clean project, renders a frame, and runs the host flow there
(`tests/release/host-flow.ts`: load a saved `0.1` document, edit it in the
session and by a tool, save it, instantiate it, estimate, render it in jobs
and join them, compare with a one-pass export, and render a still) before it
attaches them. The [host guide](docs/integration/host-guide.md) follows the
same flow, task by task.

Pin every Kadrion package, also the ones you do not import, because the
tarballs name each other by version, and no `@kadrion` name may resolve from a
registry. With npm, give each tarball as a dependency and as an override, for
example from a vendored directory:

```json
{
  "dependencies": {
    "@kadrion/schema": "file:vendor/kadrion/kadrion-schema-0.5.0.tgz",
    "@kadrion/editor-sdk": "file:vendor/kadrion/kadrion-editor-sdk-0.5.0.tgz"
  },
  "overrides": {
    "@kadrion/schema": "file:vendor/kadrion/kadrion-schema-0.5.0.tgz",
    "@kadrion/editor-sdk": "file:vendor/kadrion/kadrion-editor-sdk-0.5.0.tgz"
  }
}
```

and so on for all nine tarballs, or the release URLs in place of the files.
Check that the lockfile records the `integrity` of `kadrion-release.json` for
each one; with pnpm, put the same specifiers under `overrides`. Upgrading means
replacing all nine at once by the tarballs of one release.

The browser side needs `schema`, `editor-sdk`, `ai-sdk`, `editor-session`, and
`player` (with `renderer-dom` and `runtime`, whose runtime build the host
serves, section 4). The worker needs `producer` and `cli`, the pinned image,
and the pinned FFmpeg, which Kadrion does not ship: `kadrion fetch-ffmpeg`
installs it, and `kadrion doctor` says whether the worker produces reference
output (section 9). The packages stay private and unlicensed: a release
grants no licence (D37).

## Layout

```text
packages/
  schema/ runtime/ renderer-dom/ player/ editor-sdk/ editor-session/ ai-sdk/ producer/
  cli/ test-fixtures/
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
  release/        packing a release, its manifest, and the install smoke test (D45)
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
- The calls to the bus in the example of section 5 run, in the order written,
  against the document of section 1.
- The host example of section 2 is the code of the module
  `tests/repo/readme-host-example.ts`, character for character, and a test
  runs it: a refused load leaves its bus, history, and listener as they were
  (D43).
- The compatibility corpus of `@kadrion/test-fixtures/compatibility` is frozen
  and stands alone: every file of its directory is named by the manifest, lies
  in the directory of the version it names, hashes to the manifest's bytes —
  a change of formatting included — and loads as its hand-written document of
  the current version; no entry names a file outside that directory, and every
  supported version has an entry (D43).
- The main entry of `@kadrion/test-fixtures` reaches no file of that corpus,
  and no source of a package or of an application imports the corpus entry
  (D43).
- The main entry of `@kadrion/schema` reaches exactly its own modules: no
  historical schema, no migration step, and no saved-text function. No source
  of a package or of an application imports `@kadrion/schema/migrate`: the
  migration is outside the runtime build, and migrating is the host's act
  (D42, D43).
