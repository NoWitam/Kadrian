# D22 — DOM mapping and CSS serialisation

- Status: Accepted — by the project owner on 2026-09-22
- Amended by: D23 (accepted 2026-09-22) — the Custom HTML row of 22.3, as 22.3 anticipated
- Amended by: PR-16 (D36) on 2026-09-27 at the owner's request — the Custom HTML row of 22.3
  (through D23.8 and D23.10) depends on the host's Custom HTML policy; 22.4: the policy is
  checked before the asset URLs; 22.7: the code `invalid-options`
- Amended by: PR-21 (D42) on 2026-10-03 at the owner's request — 22.2 and 22.4:
  `renderState` also writes the visibility of every node
- Date: 2026-09-22
- Supersedes: —
- Amended by: PR-28a (D50) on 2026-10-31: `fit` as `object-fit` on images and videos, and the video node as an `<img>` of host-supplied bytes (D50.4)
- Amended by: PR-30 (D54) on 2026-11-01: 22.4: every scene is mounted; a scene the state does not evaluate is hidden and its nodes lose what an earlier render wrote (D54.3)
- Amended by: PR-32 (D56) on 2026-11-01: a scene element carries the opacity, offset, or cut of a transition, and the stage the backdrop (D56.5)
- Amended by: PR-33 (D57) on 2026-11-02: the captions node as a box of pages, lines, and word spans built at mount; a render shows one page and colours the spoken word (D57.6)
- Amended by: PR-48 (D68) on 2026-11-07: the transform list with a pivot and a rotation, the canvas as the box of a group, `object-view-box` and `border-radius` of a picture, and colours written on every render (D68.6)
- Amended by: PR-49 (D69) on 2026-11-08: the stroke, shadow, and box of a text, and a text in nested fragments whose opacity, transform, and colour are written on every render (D69.5)
- Amended by: PR-50 (D70) on 2026-11-08: captions with a moving or underlaid word are drawn in pieces, lines and words whose values every render writes (D70.5)
- Amended by: PR-51a (D71) on 2026-11-09: the `filter` of a node, a group, or a scene, written by every render and removed where there is no effect (D71.4)
- Amended by: PR-51b (D72) on 2026-11-09: a hidden `<svg data-kadrion-effects>`, the last child of the stage, holds the filters of SVG effects, written by every render (D72.4)
- Amended by: PR-52 (D73) on 2026-11-09: the box of a shape holds an inline `<svg data-kadrion-shape>` with its gradient and one `<path>`, written by every render (D73.5)
- Amended by: PR-64 (D83) on 2026-11-11, in force from PR-66: 22.6: a text with a frame, and captions broken by width, are drawn as the lines the runtime measured (D83.5)
- Amended by: K3 (opacity history) on 2026-11-11 at the owner's request: 22.9: every node, and every scene, fragment, and caption piece whose opacity can fall below 1, carries `will-change: opacity` from the mount on, so that a frame does not depend on the frames rendered before it
- Related: D03, D05, D14, D15, D16, D18, D19, D20, D21,
  [specification](../spike/vertical-spike.md) §5 P1–P2, §6.1, and open
  question Q5

## Context

PR-03 renders the evaluated state of D19 as DOM (D03, D20). Several things are
decided on the way that the specification forbids deciding "implicitly in
code":

- D18 leaves "serialising doubles for CSS" to the renderer. A value such as
  1.7125000000000001 (the reference composition at 9 900 000) must reach the page
  as the same text in every host.
- D15 fixes the transform order, the origin of scaling, and that a group is
  composited before its opacity applies; D16.4 makes array order the z-order.
- D14 leaves "image pixels versus its node box" to PR-03 and defers the asset
  resolver; the renderer still needs URLs, and "missing required assets are
  errors, not silent fallbacks" (`AGENTS.md`).
- The review of the plan listed styles that a renderer could get wrong without
  any test noticing: the transform origin, stray `z-index`, text set as markup,
  and CSS properties left to the browser's defaults.

Evidence gathered on 2026-09-22: jsdom 29.1.1 returns every declaration listed
under 22.3 unchanged when it is written in the form given there, including
`1e-7`, `1e-7px`, and `0.30000000000000004`. It rewrites `#rrggbb` colours into
`rgb(r, g, b)`, which is also how the CSS Object Model serialises a colour.

## Decision

The parts are numbered for reference.

**22.1 Numbers.** An evaluated number becomes CSS text through ECMAScript
`Number::toString` (`String(n)`): exactly specified, the shortest decimal that
reads back as the same double, so every engine writes the same text for the same
bits. `-0` becomes `0`. Below 1e-6 the text uses an exponent (`1e-7`), which is a
valid `<number>` token of CSS Syntax Level 3; a length appends `px` (`1e-7px`).
The ranges of D15 exclude `NaN`, the infinities, and the exponent form above
1e21. Nothing is rounded, fixed to a number of digits, or clamped.

**22.2 Transform and opacity.** Every node with a transform gets, on every
render, `transform: translate(<x>px, <y>px) scale(<sx>, <sy>)` and
`opacity: <o>` on its own element, with `transform-origin: 0px 0px`. CSS applies
the list from the right: the node is scaled about its top-left corner and then
moved by its position, which is D15. Amended by: PR-48 (D68): from `0.13`
the list is `translate(x, y) [translate(ox%, oy%)] [rotate(r deg)] scale(sx, sy)
[translate(−ox%, −oy%)]`, the pivot pair only when the origin is not `0, 0` and
`rotate` only when the rotation is not 0, so a document of `0.12` writes the
string it wrote before (D68.6). The children of a group are child elements
of the group element, so they live in its scaled space, and the group's opacity
applies to the composited group (D15, D18.5). Nothing sets `z-index`: absolutely
positioned siblings paint in DOM order, which is the array order (D16.4).

Amended by: PR-21 (D42). Every node, the background included, additionally gets
`visibility: hidden` while it is inactive and carries no `visibility`
declaration while it is active (D42.4). `visible` is never written: the property
inherits, so an inactive group hides its children. A tree whose nodes are all
active is exactly the tree of this section.

**22.3 Elements.** `mountComposition` replaces the content of the host's `root`
element with this tree; `W` and `H` are the canvas size.

| Element                                   | Attributes                                           | Styles                                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| stage `div`                               | `data-kadrion-composition=""`                        | `position: relative`, `width: Wpx`, `height: Hpx`, `overflow: hidden`                                                                                                                         |
| scene `div`, one per scene in order       | `data-kadrion-scene=<id>`                            | `position: absolute`, `left: 0px`, `top: 0px`, `width: Wpx`, `height: Hpx`                                                                                                                    |
| background `div`                          | `data-kadrion-node=<id>`                             | the scene styles, plus `background-color: rgb(r, g, b)`                                                                                                                                       |
| group `div`                               | `data-kadrion-node=<id>`                             | `position: absolute`, `left: 0px`, `top: 0px`, `transform-origin: 0px 0px`                                                                                                                    |
| image `img`                               | `data-kadrion-node=<id>`, `src=<host URL>`, `alt=""` | the group styles, plus `display: block`, `width`, `height` in px, `object-fit: fill`                                                                                                          |
| text `div` with one text node             | `data-kadrion-node=<id>`                             | the group styles, plus `white-space: pre`, `font-family: kadrion-font-<fontAssetId>`, `font-size` in px, `line-height: 1.25`, `font-weight: 400`, `font-style: normal`, `color: rgb(r, g, b)` |
| Custom HTML placeholder `div`, no content | `data-kadrion-node=<id>`                             | the group styles, plus `width`, `height` in px                                                                                                                                                |

Every transformed element additionally carries the `transform` and `opacity` of
22.2 once it has been rendered. A colour `#rrggbb` is written as
`rgb(r, g, b)` with decimal channels. Text is set as a text node, never parsed
as markup. The Custom HTML placeholder stays empty: its `html` is not copied
anywhere until the sandbox of PR-04. (Amended by PR-16 (D36): the row as D23.8
states it holds for a trusted element; for a disabled one the placeholder is
empty and carries `data-kadrion-custom-html="disabled"`, and so does the stage,
D23.10.) The image fills its node box and is
stretched when the aspect ratios differ (`object-fit: fill`); that is the answer
to D14's "image pixels versus its node box". Text has an explicit line height
and weight so that no browser default decides its box. The attributes address
elements; no meaning lives in them that the document does not hold (`AGENTS.md`).

**22.4 Two calls, no memory.**

- `mountComposition(root, composition, assetUrls)` checks the asset URLs first,
  then builds the tree of 22.3. It writes every static property of the
  document and no evaluated value. (Amended by PR-16 (D36), D23.10: the
  function is `mountComposition(root, composition, assetUrls, options)`. It
  checks its whole input contract first: the host's Custom HTML policy
  `options`, and then the asset URLs. Only then does it build the tree.)
- `renderState(root, state)` first checks that the mounted tree has exactly the
  scenes and nodes of the state, in the same order and hierarchy, and only then
  writes `transform` and `opacity` of every transformed node. A mismatch throws
  before anything is written, so the DOM never shows two times at once.
- Neither function keeps anything between calls; the DOM under `root` is the
  only state. Both reach the document of `root` through `root.ownerDocument`, so
  they work in whichever realm owns the element.
- A document whose static properties changed must be mounted again:
  `renderState` only checks IDs, order, and hierarchy. That is a host contract,
  and PR-08 (editing) relies on it.

Amended by: PR-21 (D42). After the same check, `renderState` also sets or
removes the `visibility` declaration of every node on every call, so the tree
still depends on the mounted document and the last state only. A mismatch still
throws before anything, a visibility included, is written.

**22.5 Asset URLs.** Until the resolver of D14 exists, the host passes a plain
object that maps an asset `id` to the URL of bytes it has already verified,
such as a `blob:` URL. Every image asset of an image node and every font asset
of a text node must have an own entry with a non-empty string; an entry for an
ID that is not an asset of the document is an error; entries for other assets
(audio) are allowed. Only own, enumerable data properties count; a getter or a
hidden property is invalid. The renderer copies the entries once and builds the
tree from that copy, so a value cannot change between check and use. All
problems are collected, sorted by asset ID, and thrown as one `RenderError`
before the DOM is touched. The renderer never verifies a hash.

**22.6 Fonts.** A text node names the family `kadrion-font-<fontAssetId>`, and
its font URL is required, but PR-03 registers no font face: loading the font and
waiting for it is open question Q5. Until then a browser draws text in a
fallback font, so no text pixel may count as golden before Q5 is answered.

**22.7 Errors.** `RenderError` extends `Error` and carries a `code`:
`asset-url-missing`, `asset-url-unknown`, and `asset-url-invalid` from 22.5;
`not-mounted` and `state-mismatch` from 22.4; and `invalid-document` for a node
type the renderer does not know, which only a forged brand can bring in (D19). As in D19.3, callers check `code`,
because `instanceof` fails across realms. (Amended by PR-16 (D36), D23.10: also
`invalid-options` from 22.4, when the host states no Custom HTML policy or not
exactly one of its forms.)

**22.8 Guardrail lists.** D20.3 binds every source of `@kadrion/runtime` and
`@kadrion/renderer-dom`. `eslint.config.js` implements it with these lists,
each entry proven by `tests/repo/lint-guardrails.test.ts`:

- banned globals: the clocks, timers, and frame callbacks of §6.1, plus
  `document`, `window`, `self`, `globalThis`, `queueMicrotask`, the three
  observers, `fetch`, `XMLHttpRequest`, `Image`, `FontFace`,
  `getComputedStyle`, and `Intl` (`new Intl.DateTimeFormat().format()` reads
  the wall clock); the renderer reaches the DOM only through the element it is
  given;
- banned members of any object: the same timer names (`view.requestAnimationFrame`),
  `defaultView`, `queueMicrotask`, the observers, `fetch`, `XMLHttpRequest`,
  `FontFace`, `getComputedStyle`, and the Web Animations entries `animate`,
  `getAnimations`, `timeline`, and `timeStamp`;
- module state: a module-level `let` or `var`, exported or not; a module-level
  value or default export built with `new`; a static class field that is not
  `readonly` or whose value is built with `new`.

The static rules cannot see every form of state (an object or array literal at
module level, a closure inside a module-level function call); the dynamic tests
remain the stronger guard.

**22.9 Elements whose opacity a render can set below 1.** Amended by: K3
(opacity history) on 2026-11-11, at the owner's request, after the
measurement of PR-66.

_Cause._ In the pinned Chromium, an element that has a `transform` (and every
transformed node, fragment, and caption piece has one, at rest too) is drawn
differently at opacity 1 once its opacity was below 1, however it got back:
written as `1`, or removed. The difference lies on anti-aliased edges, at most
2 per channel on a stroked or shadowed text (390 of 40 000 pixels in the
probe) and up to 24 on a rotated, scaled image; it does not show at an opacity
below 1. A full repaint does not clear it, the layer tree is the same, and the
element is then drawn exactly as a fresh one with `will-change: opacity` (0
pixels apart). So the pixels of a frame depended on the frames rendered before
it, in the Player (seek order) and in the Producer (the times of a range job,
one page for many frames), against "runtime state for a frame is derived from
`(composition, timeUs)`" (`AGENTS.md`). `isolation: isolate`, `contain:
paint`, `backface-visibility: hidden`, removing the opacity at 1, and leaving
the identity transform out did not help; never writing an opacity of exactly 1
did, but it changes values the state holds, and was refused. An element
without a transform, such as a scene outside a transition, showed nothing;
another `transform`, `filter`, `clip-path`, or `visibility` before showed
nothing either.

_Rule._ The mount writes `will-change: opacity` on these elements, decided
from the document alone, and nothing ever writes or removes it:

- the element of **every node but a background**, animated or not;
- a scene element that is a side of a scene transition whose effect fades
  (D56): `crossfade`, `fade-through-color`, `zoom`, `blur-dissolve`, the
  effects whose sides `effectAt` of the runtime changes the opacity of;
  `slide`, `wipe`, `push`, and `iris` move or cut only (a scene that zoomed in
  and is pushed out later was drawn apart);
- the fragments of a text of every unit that an animation uses whose
  `opacity` track has a keyframe other than 1 (D69);
- the lines and words of captions in pieces whose entrance or exit, of their
  unit, has such a track, and the words when the highlight's tracks have one
  (D70).

A track whose keyframes are all 1 keeps the opacity at 1 whatever its easing,
so it marks nothing: a text or captions in pieces at rest still draws as in
one piece (D69, D70.4). A background, the frame of a clip transition, the
canvas of an instance, a page of captions, and the elements under a fragment
carry none. The declaration is static, like the styles of 22.3, written after
them; on a node after the styles of its row and before what `renderState`
writes. It makes each such element a composited layer from the start, so it
is drawn as it would be after a fade, in every frame.

_Why every node, not only the animated ones._ A narrower rule — a node with an
opacity animation or a side of a clip transition that fades — was clean for
the history, but `tests/pinned/transitions.pinned.test.ts` then failed: a clip
transition at its end no longer drew as the document without it (272 pixels,
15 per channel), because removing the transition removed the declaration from
its side (D49.4, D66). The same holds for any comparison of two documents that
differ by an animation or a transition. Marking every node keeps those
equalities, and costs one layer per node.

_Evidence._ A grid in the pinned Chromium (`playwright-core` 1.63.0, outside
the container): for a stroked and shadowed text, a fragment in it, a caption
word, a group around a text, a rotated image, and a shape, the opacity history
`0, 0.5, 1`, `1, 0.3, 1`, and `0.5` then removed against a fresh element were
0 pixels apart with the declaration, and up to 390 pixels (2 per channel), 168
(2), and 177 (24) apart without it. `tests/pinned/opacity-history.pinned.test.ts`
renders two documents derived from the fixtures — a stroked and shadowed text
faded as a node, a text faded in letters, words, and lines, and outlined and
shadowed captions whose words enter and leave by their opacity — forward, in
reverse, and frame by frame alone in the Producer, and seeks them in reverse
and then forward in the Player: every frame byte for byte the same with the
rule, and 940 pixels (9 per channel) apart without it.

_Consequences._ The pixels of every node change once, also at rest: a
composited layer is rastered and then transformed, so a rotated or scaled
picture or shape has slightly softer edges (up to 79 per channel on the dashed
outline of a rotated shape; text in one piece unrotated barely changes). The
golden frames of every fixture with a transformed node change and are
generated again in the pinned container; every golden manifest records the new
runtime build, and the parity record is measured again there.

_Not covered, open for the owner._ Three further dependences on earlier frames
showed in the same measurements, none of them caused by an opacity of a node,
fragment, or caption piece, and none cleared by this rule: the content of the
mask of a matte (D75) whose opacity was below 1 (2 pixels, 9 per channel); a
word of captions in pieces under the highlight's scale and underline (614
pixels, 1 per channel, at one frame); and captions in pieces with a box, a
highlight box, and a shadow (9 pixels at every frame, and up to 120 per channel
while the lines enter by their scale).

## Alternatives considered

- **Fixed decimals (`toFixed`) or rounding to a pixel grid** — a second rounding
  rule on top of D18, and it hides the evaluated value from every comparison.
- **Hex colours** — shorter, but the CSS Object Model reads them back as
  `rgb()`, so the written and the stored text would differ.
- **`left`/`top` for the position** — lengths and transforms would mix, and the
  order of D15 would depend on the layout model instead of one transform list.
- **Folding the group into its children** — wrong for overlapping children
  (D15, D19).
- **One call that rebuilds the tree on every frame** — a history-free result as
  well, but it re-creates images and text for every frame.
- **SVG for every node** — D03 allows it, but HTML text and images need no
  foreign objects; SVG stays available for later node types.
- **`object-fit: contain` or `cover`** — each needs a rule for the uncovered or
  cut area; `fill` needs none and matches the node box exactly.

## Consequences

- The package exports `mountComposition`, `renderState`, `RenderError`, and the
  types `AssetUrls` and `RenderErrorCode`. The page entry of D21 builds on them.
- Chromium parses `opacity` and transforms into single precision and may
  serialise fewer digits; that the pixels follow the text written here is
  measured in the pinned environment by PR-06, not in jsdom.
- A pixel check of a scaled, nested corner in pinned Chromium becomes an
  acceptance item of PR-06; jsdom has no layout.
- Host styles can still reach the stage through inheritance. The spike renders
  into a page that contains nothing else (PR-05, PR-06); a shadow root or a reset
  is a later decision.

## Verification

- `packages/test-fixtures/src/compositions/reference.expected-render.json`: the
  complete expected tree at the five golden timestamps, derived by hand from
  `reference.expected-state.json` and this ADR; guarded on its own by
  `tests/repo/expected-render.test.ts`.
- 22.9: `packages/renderer-dom/test/opacity-varies.test.ts` (every element of
  every fixture that renders write two different opacities on carries the
  declaration from the mount on, in a shuffled order of every frame; every node
  but a background carries it; scenes of transitions that only move or cut,
  and fragments and pieces whose tracks keep the opacity at 1, carry none) and
  `tests/pinned/opacity-history.pinned.test.ts`.
- `packages/renderer-dom/test`: the fixture tree element by element, with every
  attribute, style, and child; the string of every transform and opacity at all
  300 grid frames; repeatability and order independence on one mounted tree;
  restoration of damaged styles; interleaved roots; no mutation of document or
  state; synthetic documents for a scale that is not the identity, nested
  transforms, a group with an opacity below 1, and the z-order, each with a
  premise that the wrong variant differs; markup in text; the empty
  placeholder; asset errors before the DOM is touched; a mismatch that writes
  nothing; and clock independence in the realm of the page.
