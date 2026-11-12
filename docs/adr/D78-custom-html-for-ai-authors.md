# D78 — Custom HTML for AI authors: a managed clock, fonts, and parameters, schema 0.23

- Status: Accepted — by the project owner on 2026-11-10, after PR-56 was merged
  (PR #89)
- Date: 2026-11-10
- Supersedes: —
- Amends: D23 (23.2: the shell ends with the managed clock and, before it,
  the faces of the element's fonts and its parameters; its policy admits
  `font-src data:`; 23.3: the protocol stays version 1, and the clock answers
  for an element that does not listen to messages), D25 (25.2: the policy of
  the render page admits `font-src data:`), D35 (the step from `0.22` to
  `0.23` and the frozen `0.22` schema), D46 (the catalogue gains
  `check_custom_html`, and `describe_document` shows the html), and D58 (the
  binding kind `parameter`), each with an `Amended by: PR-56 (D78)` line
- Related: D05, D14, D20, D23, D27, D28, D33, D36, D46, D54, D58, D77,
  [phase five](../roadmap/phase-5.md) PR-56

## Context

A Custom HTML element renders the frame of a time only if it derives its
picture from that time and answers the host (D23.3). An author had to write
the protocol by hand: a listener that checks the message strictly, state
computed from `timeUs`, and an acknowledgement after the frame is drawn. A
model writing an animation writes it as for a browser instead: CSS keyframes,
`requestAnimationFrame`, `Date.now`, `Math.random`. In the sandbox such an
element never answers, so every render times out; and if it answered, its
frame would depend on how long the render took and on the frames before it.
It has no fonts either, since its policy admits none and the network is shut
(D23.2, D28.9).

What the repository has, read on 2026-11-10 at `main` `e9009ba`: schema
`0.22`, 95 commands, a catalogue of 98 entries, a runtime build of 320 490
bytes.

## Decision

> D78: The shell of every Custom HTML element ends with a managed clock that runs before the author's html: every clock an element can read — CSS animations and transitions, the Web Animations API, `requestAnimationFrame`, `Date`, `performance.now`, and `Math.random` — follows the time the host pushes, less the node's start, and the clock answers for an element that does not listen to messages. Schema `0.23` gives a Custom HTML node `fontAssetIds`, font assets that enter the frame as `data:` URLs, and typed `parameters`, which a template can bind. `SetCustomHtml` edits all three, and `check_custom_html` reports what in an element cannot run or cannot be deterministic. The protocol stays version 1.

### 78.1 The managed clock

The shell of D23.2 is the policy, the instance, the faces and the parameters
of 78.2 and 78.3, and then one script element, the clock, before any byte of
the author's html. The time an element sees is `max(0, timeUs − startUs)`:
the time of its scene (D54.3) from the node's start, so that an animation
begins when the element appears; before its start the element sees 0, never
a negative time. The clock:

- replaces `Date`, so that `Date.now()`, `new Date()`, and `Date()` give that
  time in milliseconds, rounded down, and `performance.now()`, which gives it
  with its fraction;
- replaces `Math.random` by a generator seeded by an FNV-1a hash of the
  instance ID and restarted from that seed and the time on every message, so
  that the numbers drawn at a time are the same whatever was drawn before;
- queues the callbacks of `requestAnimationFrame` and runs each of them once
  per message, with the time, after the element's own listeners; a callback
  that registers again runs on the next message, and the first error of a
  callback is thrown again after all of them ran;
- then sets every animation of `document.getAnimations()` to the time and
  takes it out of the rendering: it pauses the animation, sets its current
  time, writes the value it has then into the inline style of its target by
  `commitStyles()`, and cancels it, keeping it to set it again on the next
  message. Before the callbacks of the next message, the inline values it
  wrote are restored to what they were. An animation whose value cannot be
  written (a pseudo-element, a target without a style) stays paused at the
  time. A paused animation that kept rendering was measured to leave frames
  that depend on the frames before them (one level of one pixel at the edge
  of a moving element, in Chromium 153); an inline value does not;
- answers `kadrion:time-ack` once the element's fonts are loaded, unless the
  element listens to messages itself (`addEventListener('message', …)` or
  `onmessage`), which then answers for itself exactly as D23.3 requires.

A time message is the strict one of D23.3, from the parent window only. The
clock keeps no history that the picture depends on: the time, the seed, the
queued callbacks, and the animations it holds are all the state it has, and
each frame is computed from the time.

`setTimeout`, `setInterval`, and `requestIdleCallback` are not driven: a timer
counts wall time, which has no composition time, and a timer driven by the
time would still fire in an order that depends on the frames before. They
stay as the browser has them, and `check_custom_html` reports them (78.6).
The document timeline (`document.timeline.currentTime`) and the time stamps
of events are not replaced either; the check reports them.

### 78.2 Fonts

`fontAssetIds` lists the font assets an element uses, each once
(`duplicate-font-asset`), each a font asset of the document
(`unresolved-asset-reference`, `asset-type-mismatch`). The shell declares a
face for each, whose family is the asset ID, from the URL of the asset as a
`data:` URL of base64 bytes: the host's verified bytes (D14, D27), never
fetched. A URL of another form is refused with `asset-url-invalid`. The
element's policy and the policy of the render page gain `font-src data:` and
nothing else; a frame inherits the policy of the page it is in, so a host of
the Player admits `font-src data:` in its page too (D25.2). An element
answers once the faces of its fonts are loaded.

### 78.3 Parameters

`parameters` is a list sorted by key without repeats
(`parameters-not-sorted`), each `{ key, type, value }`: `key` a letter, then
letters, digits, and underscores; `type` `text`, `number`, `boolean`, or
`color`; `value` a string, a finite number within the safe integers, a
boolean, or `#rrggbb` in lowercase. The element reads all of them as
`window.kadrion.parameters`, a frozen object, and the number and colour ones
as the CSS custom properties `--<key>` of its root. They are part of the
shell, not of the time message: the time message of D23.3 stays the same five
keys, and an element that ignores parameters runs as before.

A binding of the kind `parameter` (`{ id, kind, nodeId, key, inputId }`)
writes a template input into one parameter of a Custom HTML node: the input
has the type of the parameter (`binding-type-mismatch`), the parameter exists
(`unresolved-parameter-reference`), and it holds the input's default
(`binding-value-mismatch`), as every bound value does (D58.3). An element of
D77 cannot hold Custom HTML (D76), so a parameter is bound in a template only.

### 78.4 The limit of the html

The schema keeps `html` an unbounded string, so no saved document becomes
invalid. `SetCustomHtml` refuses html longer than 262 144 UTF-16 code units
(`MAX_CUSTOM_HTML_LENGTH`) with `invalid-argument`, and the check reports
such html as `too-large`.

### 78.5 Commands and the description

`SetCustomHtml` (`nodeId`, `html`, `fontAssetIds`, `parameters`) replaces all
three of a Custom HTML node in one step; its inverse sets the earlier ones.
The document's rules judge the result: a font that is no font, unsorted
parameters, or a parameter a binding writes removed are refused as the bus
refuses an invalid result. `describe_document` now includes the html of an
element, with its fonts and parameters: an author edits what it reads.

### 78.6 `check_custom_html`

The tool takes `nodeId` and changes nothing. It returns:

- `findings`, from reading the html (`checkCustomHtmlSource` of
  `@kadrion/editor-sdk`): `network` (a request, a loaded resource, a URL in
  CSS other than `data:`), `timer`, `wall-clock` (the document timeline,
  event time stamps, `timeOrigin`), `storage`, `navigation` (a navigation, a
  link, a form), and `too-large`, each with its offset and the text it
  matched. It reads patterns, so it can report a word in a comment; the
  sandbox enforces isolation whatever it finds;
- `render`, the render check the host lends, or `null`: `checkCustomHtml` of
  `@kadrion/producer` renders the element alone — its document's canvas and
  frame rate, at the top-left corner from time 0, unanimated, over a mid grey
  background, with its fonts only — at five times of its lifetime, the first,
  the last, and evenly between, twice, the second time in the reverse order,
  and compares the PNGs byte for byte. It reports `frames-differ` at a time
  whose frames differ, `no-acknowledgement` when the element did not answer,
  `navigated`, and `render-failed`;
- `ok`, whether nothing was found.

The render check lies in the Producer, not in the catalogue, because only a
host has a browser: `executeTool` stays a function of the bus.

### 78.7 Schema `0.23` and the step from `0.22`

The step gives every Custom HTML node `fontAssetIds: []` and
`parameters: []` right after its `html` and changes nothing else. An element
of `0.22` draws the same pixels under the clock: it listens to messages, so
the clock leaves the answer to it; its animations read its own state, which
the clock does not touch. The frozen `0.22` schema is kept for the migration
(D35).

### 78.8 Not included

Network, storage, or host APIs in the sandbox (D05); isolation beyond
Chromium (D36, option E); a driven `setTimeout`; parameters in the time
message; fonts of an element inside a definition, which holds no Custom HTML
(D76).

## Alternatives considered

- **Protocol version 2 with the parameters in the message.** It would change
  every conforming element and the host for data that does not change from
  frame to frame. The shell gives them once.
- **Pausing every animation at the time and letting it render.** Measured in
  Chromium 153: an element whose transform is animated differs by one level
  of one pixel between a render forward and one backward. The value written
  inline does not.
- **Taking each animation off its timeline (`timeline = null`).** The frame
  after the first showed the state of time 0.
- **Driving `setTimeout` by the time.** A timer fires once, in an order that
  depends on the times rendered before, so the frame still depends on the
  history. Refused in the check instead, as the plan recommended.
- **A limit of the html in the schema.** A saved document longer than the
  limit would become invalid; the command limits what is written.
- **The render check in `executeTool`.** It would need a browser in
  `@kadrion/ai-sdk`; the host lends it instead.

## Consequences

- `@kadrion/schema`: schema `0.23`, the type `CustomHtmlParameter`, the
  binding `parameter`, the codes `duplicate-font-asset`,
  `parameters-not-sorted`, and `unresolved-parameter-reference`, the frozen
  `0.22` reader, and the step.
- `@kadrion/renderer-dom`: the shell of 78.1 to 78.3, `font-src data:` in
  both policies; the runtime build grows to 332 233 bytes.
- `@kadrion/editor-sdk`: `SetCustomHtml`, 96 commands,
  `checkCustomHtmlSource`, `MAX_CUSTOM_HTML_LENGTH`; the description shows the
  html. `@kadrion/ai-sdk`: the command tool `set_custom_html` and the tool
  `check_custom_html`, a catalogue of 100 entries (96 command tools and four
  others; written as 99 until PR-63, as in D46), the result
  kind `check`, and the optional `checkCustomHtml` of a tool bus.
  `@kadrion/producer`: `checkCustomHtml` and its types.
- The change of the API is additive (new exports, a command, codes, a tool)
  and breaking (schema `0.23` in `SCHEMA_VERSION`; a Custom HTML node gains
  keys; `Command`, the template binding, and `ToolResult` gain members).
- An element that never answered now answers through the clock unless it
  listens to messages: a test of a silent element listens without answering.
- `@kadrion/test-fixtures`: the Custom HTML composition (640×360, 10 s: an
  element of CSS alone with a font and parameters, and one of script reading
  every managed clock), its 5 golden frames, the `0.23` corpus, and the
  negative cases of every new rule.
- The runtime build's hash changes, so the golden manifests are written again
  and parity is measured again; the existing golden PNG files stay byte for
  byte. Q14 stays open.

## Verification

- Unit tests of the schema (`packages/schema/test/custom-html.test.ts`, the
  migration and invalid corpora): the step 0.22 → 0.23, fonts and parameters
  checked, the parameter binding and its instantiation.
- Unit tests of the shell (`packages/renderer-dom/test/managed-clock.test.ts`):
  the faces and custom properties, the refused font URL, a parameter that
  cannot end the script, and the clock in a window of its own: the times of
  every clock, the answer and when it is left to the element, the strict
  message, and the same random numbers at a time whatever came before.
- Unit tests of the command and the static check
  (`packages/editor-sdk/test/custom-html.test.ts`), of the tool
  (`packages/ai-sdk/test/tools.test.ts`), and of the render check on a fake
  render (`packages/producer/test/custom-html-check.test.ts`).
- In pinned Chromium (`tests/pinned/custom-html-ai.pinned.test.ts`): the
  fixture gives the same pixels forward, backward, and shuffled; the Player
  shows the pixels of the Producer at every time tried; the render check
  finds nothing in the fixture and finds an element that counts its frames
  and one that reads the document timeline; the fixture meets its 5 golden
  frames.
- Parity of the Player against the Producer measured again.
