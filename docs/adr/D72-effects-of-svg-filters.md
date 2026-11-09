# D72 — Effects of SVG filters: schema 0.17

- Status: Accepted — by the project owner on 2026-11-09, after PR-51b was merged
  (PR #74)
- Date: 2026-11-09
- Supersedes: —
- Amends: D71 (five kinds of effects drawn by an SVG filter of their own, at
  their place among the CSS functions of 71.4), D22 (a hidden `<svg>` of the
  stage holds those filters), D35 (the step from `0.16` to `0.17` and the
  frozen `0.16` schema), and D65 (65.5: the SVG primitives of these kinds are
  in the probe record), each with an `Amended by: PR-51b (D72)` line
- Related: D03, D04, D16, D18, D26, D33, D46, D50, D54, D67, D68,
  [phase five](../roadmap/phase-5.md) PR-51b

## Context

D71 gave nodes, groups, and scenes a list of effects drawn by CSS filters. A
host's videos also need what CSS filters cannot say: a colour correction by
curves, a grade with lift, gamma, gain, and white balance, a glow around a
title, a vignette, and a key that removes a green or blue screen. SVG filter
primitives say all of them, and the probes of PR-45 measured the ones they
need (D65.5): a component transfer by table and by gamma, a colour matrix, a
Gaussian blur of the alpha, a flood, a composite, a merge, and a channel
difference turned into alpha were exact in pinned Chromium. This PR adds the
primitives those did not cover to `tests/probes/catalogue.ts` (an arithmetic
mix, a matrix followed by a gamma, light from a point over a flat surface in
the units of the box, and the matte and spill of a key), and runs the probes again twice in fresh pinned containers, the second
against the first: all 111 probes are exact (294 rows in
`docs/spike/motion-probes.json`), and every earlier row has the pixels it had.

What the repository has, read on 2026-11-09 at `main` `11f343f`: schema
`0.16`, 81 commands, a catalogue of 84 entries.

## Decision

> D72: Schema `0.17` adds five kinds of effects — `curves`, `color-grade`, `glow`, `vignette`, and `chroma-key` — each drawn by an SVG filter of its own that stands in the CSS `filter` of its holder as `url("#kadrion-effect-<id>")` at its place in the list. Every filter works in sRGB, over a region that never cuts what an earlier effect spilled. The commands and tools of D71 edit them without change; every document of `0.16` renders byte for byte.

### 72.1 The kinds and their parameters

| Kind          | Parameters                                     | Bounds                                                                        | Animated      |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------- |
| `curves`      | `red`, `green`, `blue`, `amount`               | each table 2 to 32 levels from 0 to 1; `amount` 0 to 1                        | `amount`      |
| `color-grade` | `lift`, `gamma`, `gain`, `temperature`, `tint` | −1 to 1; 0.1 to 10; 0 to 10; −1 to 1; −1 to 1 (none: 0, 1, 1, 0, 0)           | every one     |
| `glow`        | `color`, `opacity`, `radius`                   | `#rrggbb`; 0 to 1; 0 to 1000 composition pixels                               | every one     |
| `vignette`    | `amount`, `size`                               | 0 to 1; 0.05 to 10, the height of the light over the box in units of its side | every one     |
| `chroma-key`  | `key`, `tolerance`, `softness`, `spill`        | `green` or `blue`; 0 to 1; 0.01 to 1; 0 to 1                                  | all but `key` |

- **Curves.** A table per channel (`feComponentTransfer`, type `table`) maps
  the level of the channel; `amount` mixes the result with the input
  (`feComposite` arithmetic, `k2 = amount`, `k3 = 1 − amount`). A table is a
  list, not a number, so only `amount` animates: a table that animates would
  need tables of one length and a rule for each level, and fading a curve in
  is what `amount` is for.
- **Colour grade.** **Deviation from the plan:** the kind is `color-grade`,
  not `color-matrix`, because its parameters are those of a grade and a
  matrix is how it is drawn, not what a host or a model writes. One
  `feColorMatrix` maps each channel `c` to `lift + (gain − lift) · w_c · c`,
  with the white balance `w_r = 1 + temperature / 4`, `w_g = 1 − tint / 4`,
  `w_b = 1 − temperature / 4`; a gamma transfer with the exponent `1 / gamma`
  then bends the mid-tones. Alpha is kept.
- **Glow.** The alpha of the holder blurred by `radius`
  (`feGaussianBlur` of `SourceAlpha`), filled with `color` at `opacity`, and
  merged under the holder. It spills beyond the box, as a blur does (D71.4).
- **Vignette.** A white light from a point over the centre of the box at the
  height `size` (in units of the box, `primitiveUnits="objectBoundingBox"`)
  lights a flat surface (`feDiffuseLighting`, `surfaceScale="0"`); its
  falloff, raised to the fourth power and scaled to `1 − amount … 1`, darkens
  the holder by multiplication. Outside the box the factor is 1. A radial
  gradient, as the plan named it, cannot stand in a filter without an image
  of its own; the light needs the box of the holder, which a text does not
  know until it is laid out, and the units of the box give it to the filter
  without measuring.
- **Chroma key.** A matrix writes the difference `d = K − (A + B) / 2` of the
  key channel `K` over the mean of the other two into alpha; a linear
  transfer `1 − (d − tolerance) / softness` gives the matte. The spill is
  suppressed by multiplying the key channel by
  `1 − spill · max(0, K − (A + B) / 2)` before the matte is applied.

### 72.2 The colour space

**Every filter works in sRGB** (`color-interpolation-filters="sRGB"`), as the
CSS filters do. The probes measured both spaces exact; sRGB is chosen so that
a level of a curve, a lift, or a key colour means what it means in a colour
picker and in CSS, and so that an effect of D71 and one of D72 in one list
share one space.

### 72.3 The limit of the chroma key

A key is a **difference of channels**, which a matrix and a transfer express:
the key is green or blue, and a pixel is transparent to the degree its key
channel exceeds the mean of the other two. A key by **distance from a colour
in three dimensions** does not fit a matrix (the distance is not linear in the
channels), and no SVG primitive takes a square root of a sum. A host with a
plate of another colour keys it outside Kadrion or waits for the pixel path of
D03.

### 72.4 The filters in the page

- Each SVG effect has one `<filter id="kadrion-effect-<effect id>">` in one
  hidden `<svg data-kadrion-effects width="0" height="0">`, the last child of
  the stage; a document without SVG effects has no such element.
- The CSS `filter` of the holder (D71.4) writes `url("#kadrion-effect-<id>")`
  at the place of the effect in the list, so CSS and SVG effects apply in the
  order of the list.
- The region of every filter is `filterUnits="userSpaceOnUse"` with
  `x = y = −4 000 000` and `width = height = 8 000 000` composition pixels, so
  nothing an earlier effect spilled is cut. The units of the primitives are
  `objectBoundingBox` for the vignette and `userSpaceOnUse` for the others.
- The mount writes the `<filter>` elements with their ID only;
  `renderState` writes the region, the units, the colour space, and the
  primitives at every render, and empties the filter of an effect the state
  does not hold, so a tree rendered at a state is that of a fresh mount
  rendered at it (D54.3).

### 72.5 Commands and tools

The four commands of D71.6 take the new kinds without change; their tool
descriptions name the kinds and parameters. The registry keeps 81 commands
and the catalogue 84 entries; the snapshot of the catalogue changes with the
descriptions.

### 72.6 Schema `0.17` and the step from `0.16`

`step016To017` sets `schemaVersion` to `0.17` and changes nothing else: no
document of `0.16` holds a kind of D72. The frozen `compositionSchemaV016`
reads `0.16` (D35); the compatibility corpus gains `compatibility/v0-17/` with
every fixture migrated and the SVG effects composition, and the earlier
corpora keep their bytes.

### 72.7 What this ADR does not decide

- **A 3D colour table (LUT).** No SVG primitive looks a colour up in three
  dimensions; a LUT needs the pixel path that D03 places later (question 6 of
  the plan).
- Keying by distance from a colour (72.3), keying by machine learning, and
  motion tracking.
- Blend modes, masks, and the adjustment layer (PR-54).

## Alternatives considered

- **linearRGB.** Exact as well, but its numbers would mean something other
  than the CSS filters' in the same list, and a level of a curve would not be
  a level a host sees.
- **One `<filter>` for the whole list of a holder.** It would make the CSS
  kinds SVG primitives too and change every frame of `0.16`; a filter per SVG
  effect keeps D71 byte for byte.
- **A filter region of the box with a margin.** A margin in percent of the box
  cuts a large blur on a small node; a fixed square far beyond any position
  costs nothing measurable in Chromium, which clips the region to the
  surface.
- **A vignette by a radial gradient image (`feImage`).** It would need an
  image resource per holder and its size; the light needs neither.

## Consequences

- `@kadrion/schema`: schema `0.17`, the five kinds in `Effect`, the frozen
  `0.16` reader, and the step. The type of `effectSchema` is named
  (`EffectSchema`) so that the inferred types of the schemas that hold effects
  stay within the limit of TypeScript.
- `@kadrion/runtime`: the states of the five kinds and their bounds in
  `EFFECT_BOUNDS`. The runtime build grows to 220 408 bytes; its hash
  changes, so the golden frames are written again and parity is measured
  again.
- `@kadrion/renderer-dom`: the filters of the stage and their primitives
  (`svg-filters.ts`), and `url(…)` in the CSS filter.
- `@kadrion/editor-sdk` and `@kadrion/ai-sdk`: the descriptions of the effect
  tools and the catalogue's snapshot. The change of the API is additive (new
  exports and kinds) and breaking (schema `0.17` in `SCHEMA_VERSION`).
- `@kadrion/test-fixtures`: the green-screen video `asset-video-green`, made by
  the pinned FFmpeg from a committed recipe and checked by its hash; the SVG
  effects composition (640×360, 1.6 s, two scenes: the kinds animated over an
  image, a video, a text, a group, and a scene, a chain of CSS and SVG
  effects, and a keyed video over a plate; and every kind at rest over an
  image, a text, and a video), its 4 golden frames, the `0.17` corpus, and
  every fixture at `0.17`.
- Q14 stays open: a new pinned test and its report are added.

## Verification

- Unit tests of the runtime (`packages/runtime/test/effects-svg.test.ts`):
  values at rest and sampled in scene time, bounds after an overshoot, and the
  tables carried as they are.
- Unit tests of the renderer (`packages/renderer-dom/test/effects-svg.test.ts`):
  the primitives of every kind, the `url(…)` at its place in the filter, no
  `<svg>` without SVG effects, and the same tree after any order of renders.
- Unit tests of the commands with the new kinds
  (`packages/editor-sdk/test/effects.test.ts`); negative fixtures for every
  new field and bound; the step 0.16 → 0.17 with its migration pair and the
  invalid corpus of `0.16`.
- In pinned Chromium (`tests/pinned/effects-svg.pinned.test.ts`): every kind
  changes the pixels of an image, a text, and a video; a glow spills beyond
  the box; an SVG filter applies at its place among the CSS functions; a key
  makes its colour transparent so the plate under it shows through, pixel for
  pixel; and the frames of the composition meet their 4 golden frames. The
  existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
