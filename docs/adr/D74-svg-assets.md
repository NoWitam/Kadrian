# D74 — SVG assets: schema 0.19

- Status: Accepted — by the project owner on 2026-11-09, after PR-53 was merged
  (PR #78)
- Date: 2026-11-09
- Supersedes: —
- Amends: D14 (the asset type `svg`), D27 (27.3: an `svg` asset is read by
  the sanitiser after its hash is verified), and D35 (the step from `0.18` to
  `0.19` and the frozen `0.18` schema), each with an
  `Amended by: PR-53 (D74)` line
- Related: D03, D22, D23, D44, D46, D49, D50, D62, D73,
  [phase five](../roadmap/phase-5.md) PR-53

## Context

A host imports logos, icons, and illustrations as SVG files. An SVG file is a
program as much as a picture: it may hold scripts, event attributes, HTML in
`foreignObject`, style sheets, and references to other files and to the
network. Kadrion shows assets in the Player, in a host's page, and in the
Producer, and a document must render what its bytes say and nothing else
(`AGENTS.md`: assets are pinned, missing assets are errors). Chromium runs no
script of an SVG shown by `<img>`, but it still reads CSS, and what such a
file draws depends on whatever the browser of the day accepts.

PR-52 gave the engine shape nodes (D73). An SVG asset whose parts a host wants
to animate is best turned into those nodes once, so that every part has an ID,
a row of the table, and a command.

What the repository has, read on 2026-11-09 at `main` `5c0a187`: schema
`0.18`, 85 commands, a catalogue of 88 entries.

## Decision

> D74: Schema `0.19` adds an asset type `svg`. Its bytes are read by `readSvg`, a sanitiser of Kadrion's own in `@kadrion/schema` that accepts a closed subset of SVG and **refuses**, never strips, anything else with a typed error naming the first offence and where it lies. An image node shows an `svg` asset as an image. `svgToShapes` of `@kadrion/editor-sdk`, a pure helper, turns an accepted drawing into shape nodes of D73 that `AddNode` inserts in one transaction. Every document of `0.18` renders byte for byte.

### 74.1 The asset type

An asset entry `{id, type: "svg", contentHash}` names the exact bytes of an
SVG file, as every asset does (D14). Its media type is `image/svg+xml`, and
the resolver of a host must answer that and nothing else for it (D27.3).
`SetImageAsset` and the `assetId` of an image node accept an `image` or an
`svg` asset; every other reference to an `svg` asset is `asset-type-mismatch`.
An `image` asset of media type `image/svg+xml` keeps working as it did, so no
document of `0.18` changes meaning; a template input has no `svg` type.

### 74.2 Refuse, not strip

The sanitiser refuses a file it does not accept whole. Stripping would make
the document render something other than what its bytes say, differently
from a viewer that kept what was stripped, and it would hide from a host that
the file it stored is not the file it sees. A host that needs a file the
subset refuses converts it first, outside Kadrion.

### 74.3 The sanitiser and its errors

`readSvg(bytes)` is a pure function: it decodes UTF-8 strictly, parses XML
with a parser of its own (no DOM, the same in Node and in a page), and answers
`{ok: true, svg: {width, height, viewBox, root}}` or
`{ok: false, error: {code, message, path}}`. `path` is the element path from
the root with each element's index among its parent's elements and `@name`
for an attribute, such as `/svg/g[0]/path[2]/@onclick`. The first offence in
document order is reported, and the checks run in an order that names the
worst one first: a dangerous element, then a dangerous attribute, then the
root, then the subset, then the grammar of a value.

| Code                         | Refused                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `svg-encoding`               | bytes that are not UTF-8, or a NUL                                         |
| `svg-malformed`              | XML that is not well formed, CDATA, an unknown entity                      |
| `svg-doctype`                | a document type declaration, which may declare entities and reach files    |
| `svg-processing-instruction` | a processing instruction other than the XML declaration                    |
| `svg-not-svg`                | a root that is not `<svg>` of the SVG namespace                            |
| `svg-script`                 | `<script>`                                                                 |
| `svg-foreign-object`         | `<foreignObject>`                                                          |
| `svg-style`                  | `<style>`, a `style` attribute, or a `class`                               |
| `svg-event-attribute`        | an attribute `on…`                                                         |
| `svg-external-reference`     | `href` or `xlink:href` of any kind, or a `url()` not of the form `url(#…)` |
| `svg-animation`              | SMIL: `animate`, `animateMotion`, `animateTransform`, `set`, `mpath`       |
| `svg-element`                | any other element outside the subset, a nested `<svg>` included            |
| `svg-attribute`              | an attribute outside the subset of its element                             |
| `svg-value`                  | a value outside its grammar or bounds, or `url(#id)` naming no gradient    |
| `svg-size`                   | a root without a whole `width` and `height` from 1 to 16 384 or a viewBox  |
| `svg-too-large`              | more than 1 000 000 bytes, 10 000 elements, or a depth of 64               |

The command bus does not hold bytes, so it does not read them; the renderer
reads every `svg` asset after verifying its hash and before showing it, so
the Player and the Producer refuse it alike, with the error `svg-refused`
naming the code and the path. The session reads its facts the same way.

### 74.4 The subset

- **Elements:** `svg` (the root only), `g`, `defs`, `title`, `desc`, `path`,
  `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
  `linearGradient`, `radialGradient`, and `stop`.
- **Presentation attributes** on `svg`, `g`, and every shape: `fill`,
  `fill-opacity`, `fill-rule`, `stroke`, `stroke-width`, `stroke-opacity`,
  `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`,
  `stroke-dasharray`, `stroke-dashoffset`, `opacity`; and `transform` on `g`
  and the shapes. The geometry attributes of each shape, `id` where a
  gradient needs it, and the gradient attributes `gradientUnits`,
  `gradientTransform`, `spreadMethod`, and their coordinates.
- **Values:** numbers and lengths without units or in `px`; colours `#rgb`,
  `#rrggbb`, `rgb()`, and twenty named colours; paint `none`, a colour, or
  `url(#id)` of a gradient of the file; path data of every command of SVG;
  transforms `matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`.
- The root needs `width` and `height` as whole pixels and a `viewBox`: they
  are the size an image node lays out (D62) and the space `svgToShapes`
  maps.

What the subset accepts runs no script and loads nothing, whether shown as an
image or converted. Fonts and text inside an SVG are outside it.

### 74.5 `svgToShapes`

`svgToShapes(svg, {idPrefix, x, y, width, height, startUs, durationUs})`
returns one shape node per drawn element, in paint order, with IDs
`<idPrefix>-1`, `<idPrefix>-2`, …, placed in the box `x, y, width × height`
as an image node with `fit: "fill"` shows the drawing: the view box is
mapped onto the box by its `preserveAspectRatio`, as Chromium maps it.

- **A helper, not a command.** It reads nothing of the document and changes
  nothing; a host or a model dispatches the nodes it returns with `AddNode`
  in one transaction, undone in one step. A command would have to hold the
  bytes of a file the bus does not store.
- Each element becomes a path in a box of its own around its drawing, with
  its origin at the box's centre, so it can be turned and scaled about
  itself. Its transform and those of its groups are applied to its numbers.
  Arcs are kept under a similarity and turned into cubic curves under any
  other transform.
- Paint is inherited from groups; opacity is the product of the opacities of
  the element and its groups, times its fill or stroke opacity. A gradient in
  user space becomes a gradient in the pixels of the shape's box.
- What a shape cannot state is refused with `svg-not-convertible` and the
  path of the element: dashes (in the units of the drawing), a miter limit
  other than 4, a gradient stroke, a gradient or a stroke under a transform
  that is not a similarity, a fill opacity unlike the stroke opacity, a
  gradient in the units of its bounding box, with a `gradientTransform`, a
  spread other than `pad`, a focus, or other than 2 to 16 stops, and a
  geometry beyond the bounds of D73. A file the sanitiser refuses is
  `svg-refused` with its code and path.

### 74.6 Facts

`session.readMediaFacts` of an `svg` asset answers `{type: "svg", width,
height, viewBox}` from the sanitiser, and `describe_document` states them on
the asset, as it states the size of an image (D62). The Producer checks that
the size the sanitiser read is the size pinned Chromium decodes
(`image-size-mismatch`).

### 74.7 Schema `0.19` and the step from `0.18`

`step018To019` sets `schemaVersion` to `0.19` and changes nothing else: no
document of `0.18` holds an `svg` asset. The frozen `compositionSchemaV018`
reads `0.18` (D35); the compatibility corpus gains `compatibility/v0-19/`
with every fixture migrated and the SVG composition, and the documents of
`compatibility/v0-18/` that were expectations become frozen inputs of their
own entries.

## Alternatives considered

- **Stripping what is not accepted** (as DOMPurify does). It renders a
  different picture from the bytes, silently, and depends on a library's
  idea of danger that changes between versions.
- **A DOM parser of the browser.** The Producer's Node and the Player's page
  would read the bytes with different parsers; one parser of Kadrion's own
  gives the same answer everywhere, and a unit test covers it.
- **Inlining the SVG into the page.** Its IDs, gradients, and CSS would meet
  those of the page and of other assets; an image keeps it in a document of
  its own.
- **`svgToShapes` as a command.** The bus would have to hold the bytes or
  read the resolver; a helper keeps the bus free of assets, as D59 kept
  `instantiateTemplate`.

## Consequences

- `@kadrion/schema`: schema `0.19`, the asset type `svg`, `readSvg` and the
  parsers of its values, the frozen `0.18` reader, and the step.
- `@kadrion/renderer-dom`: an `svg` asset is resolved as `image/svg+xml` and
  read by the sanitiser (`svg-refused`); an image node shows it.
- `@kadrion/player` and `@kadrion/producer`: `svg-refused`; the Player's
  image facts of an SVG state its view box; the Producer checks its size.
- `@kadrion/editor-sdk`: `svgToShapes`, `SvgFacts`, the errors
  `svg-refused` and `svg-not-convertible`; `SetImageAsset` takes an `svg`
  asset. `@kadrion/editor-session`: the facts of an `svg` asset.
- `@kadrion/ai-sdk`: the descriptions of `SetImageAsset` and `AddAsset`.
- The change of the API is additive (new exports, a media fact, error codes)
  and breaking (schema `0.19` in `SCHEMA_VERSION`; `Asset['type']` and
  `MediaFacts` gain a member).
- `@kadrion/test-fixtures`: the SVG badge (`generateSvgAsset`), the SVG
  composition (640×360, 1.6 s: the badge as an image, its shapes beside it
  with the star turning, the curve drawn on, and the sun fading, and a
  smaller image of it turning), its 4 golden frames, the `0.19` corpus.
- The runtime build grows to 251 303 bytes, since the renderer it holds
  reads every `svg` asset with the sanitiser; its hash changes, so the golden
  frames are written again (every existing PNG file byte for byte) and parity
  is measured again (0 differing pixels).
- Q14 stays open: a new pinned test and its reports are added.

## Verification

- Unit tests of the sanitiser (`packages/schema/test/svg.test.ts`): the
  subset accepted, the hostile corpus refused each with its code and path
  (scripts, event attributes, `foreignObject`, `href` and `xlink:href` to the
  network, CSS `url()`, `<style>`, a doctype, SMIL), the encoding, the
  limits, the first offence in order, and the parsers of values.
- Unit tests of `svgToShapes` (`packages/editor-sdk/test/svg-shapes.test.ts`):
  the view box mapped and centred, paint and opacity inherited, arcs kept or
  turned into curves, gradients converted, nothing drawn left out, one
  transaction undone in one step, and every refusal.
- Unit tests of the renderer, the Player, the Producer, the session, and
  `describe_document` for `svg` assets; the step 0.18 → 0.19 with its
  migration pair and the invalid corpus of `0.18`.
- In pinned Chromium (`tests/pinned/svg.pinned.test.ts`): an SVG with a
  script fails the render with `svg-refused` naming `svg-script`; the shapes
  of `svgToShapes` show what an image of the same asset shows, but for
  anti-aliased edges (measured: 1 pixel of the box differs by more than 48 in a
  channel, 204 pixels of the frame at all, at most by 53); and the frames of the SVG composition meet their 4
  golden frames. The existing golden PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.
