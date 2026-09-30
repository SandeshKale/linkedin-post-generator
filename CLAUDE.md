# CLAUDE.md

Guidance for Claude (or any agent) working in this repository. This repo
generates LinkedIn PDF Carousel (Document post) and slide-image content —
1080×1350 (4:5), pixel-perfect, typography-heavy — from a JSON slide
manifest, rendered deterministically with headless Chromium. It is the
document-pipeline sibling of `SandeshKale/video-generator`: same
"decouple rendering from anything non-deterministic" philosophy, adapted
from *time* (`window.__seek(t)`) to *pagination* (`page.pdf()` + CSS
`@page`). Read this before creating or editing a carousel.

## Every post's media needs its own identity — hard rule, both pipelines

Direct instruction, after two flow-GIF posts in a row reused the same
column-plus-side-panel layout under different palettes: **"go completely
wild and creative. every post's media asset that you create should be
unique."** This generalizes `video-generator`'s own "every reel needs its
own visual identity" rule (see "Visual identity" below) past *theme*
(color/shape/texture/font) to *layout* itself — a new palette on the same
skeleton is not enough. Concretely:

- A named theme/layout preset (`THEMES`, `layout: 'zigzag'`, etc.) is a
  **documented reference point to remix**, not a closed set to keep
  reusing verbatim on an unrelated post's topic. The normal path for an
  actual new post is inline custom values in that post's own manifest,
  not picking one of the existing names again.
- Before building a new flow-GIF or carousel post, research real
  layout/infographic conventions beyond whatever this repo has already
  tried (zigzag/S-curve, radial, circular, horizontal — see "Layout"
  below for what came out of exactly this search) rather than defaulting
  to the last post's structure with new colors.
- This costs real iteration — the "dossier" theme alone needed a
  title/annotation collision fixed, a branch-connector repositioning, a
  connector-contrast fix, and a background-texture rewrite for GIF file
  size, all only found by rendering and looking. Budget for that; a wild
  new layout is not free the way a palette swap is.

## Core render contract (read this first)

`video-generator`'s invariant is "`__seek(t)` must be a pure function of
`t`, no wall-clock side effects." This repo's equivalent invariant is:

**By the time `scripts/render.mjs` opens a slide's HTML, every slide must
already be fully static — no runtime JS, no animation, no async content
resolution left to do.** `scripts/render.mjs` never evaluates page JS
beyond waiting on `document.fonts.ready`; it only calls `page.pdf()` and
`elementHandle.screenshot()`. All the "hard" work — Mermaid diagram
layout, Shiki syntax highlighting — happens earlier, in `scripts/build.mjs`,
using a throwaway headless-Chromium page (`scripts/mermaid.mjs`) or plain
Node (`scripts/shiki.mjs`), and gets baked into the HTML as plain
`<svg>`/`<pre>` markup before `render.mjs` ever runs. This is *stricter*
than the video pipeline's contract (which still runs `__seek` JS live at
render time) because a still document has no time axis to be a pure
function of — the only way to guarantee determinism is to leave nothing
for the renderer to compute.

Two-stage pipeline, always run in this order:

```bash
bun scripts/build.mjs content/<manifest>.json     # → output/<slug>/carousel.html
bun scripts/render.mjs output/<slug>/carousel.html # → carousel.pdf + slide-NN.png
```

`build.mjs` never touches Playwright's *render* path — its own use of
Playwright (via `scripts/mermaid.mjs`) is purely to pre-flatten Mermaid
source into SVG strings, a separate throwaway browser instance, closed
before `build.mjs` exits.

Three-stage pipeline once the optional quality gate is included — see
"Content quality gate (Jev)" below for why it's a separate stage rather
than folded into `build.mjs`:

```bash
bun scripts/quality-gate.mjs content/<manifest>.json [--strict]  # advisory (or blocking) judgment, no output files
bun scripts/build.mjs content/<manifest>.json                    # → output/<slug>/carousel.html
bun scripts/render.mjs output/<slug>/carousel.html                # → carousel.pdf + slide-NN.png
```

## Animated GIF posts (a deliberate exception, not a mode of render.mjs)

Some gold-standard reference posts (reverse-engineered from real
high-performing LinkedIn posts — see the UPI/₹18.41T post analysis) use a
single animated GIF instead of a carousel: a flow diagram with genuine
motion — marching-dash connectors, a traveling "request" dot, per-node
glow pulses — not a static image. That's the literal opposite of this
repo's core render contract above, so it does **not** live inside
`render.mjs` or get bolted on as an "animation mode." It's a wholly
separate sibling pipeline:

```bash
bun scripts/build-flow-gif.mjs content/<slug>.flow.json   # → output/<slug>/flow-scene.html
bun scripts/gif.mjs output/<slug>/flow-scene.html output/<slug>/flow.gif [--duration=4000] [--fps=20]
```

**Before publishing a flow-GIF post, read `.claude/skills/cover-art/SKILL.md`
(invoke it via the `cover-art` skill).** Confirmed by actually publishing
`jev-claude-code`'s flow GIF to LinkedIn: the platform's post-image upload
path is a still-image recipe (`STILLIMAGE`/`feedshare-image`) that
flattens an animated GIF to one static frame the instant it's posted —
there is no true motion once it's live on the feed. That means the "cover"
isn't a nice-to-have thumbnail, it may be the *only* frame anyone ever
sees; don't let whatever frame `scripts/gif.mjs` happens to encode first
stand in for a deliberately composed poster.

- **`templates/flow-gif.mjs`** (`buildFlowGifHtml()`) builds a standalone
  HTML "scene": real CSS `@keyframes` animations (dashed-line marching
  ants, a `circle` moving via `offset-path`/`offset-distance`, per-node
  `box-shadow` pulses timed to when the dot arrives), reusing the same
  Blueprint theme tokens and vendored fonts as `templates/carousel.mjs` so
  a GIF post and a carousel post still read as the same brand.
- **`scripts/gif.mjs`** is the actual exporter, and its determinism trick
  is the same spirit as `video-generator`'s `window.__seek(t)` contract,
  just applied to the browser's own animation engine instead of bespoke
  page JS: every `Animation` on the page is paused once via the Web
  Animations API, then `animation.currentTime` is set to each sample
  instant in turn and a screenshot is taken — never real wall-clock
  playback, which would make the output non-reproducible. Setting
  `currentTime` past one iteration's own duration on an `infinite`
  animation resolves correctly via modulo, so a single shared timeline
  can drive several animations with different periods (e.g. the marching
  dashes loop faster than the dot's own travel) without extra bookkeeping.
- Frames are decoded with `pngjs` and encoded with `gifenc` (pure JS, no
  native deps — installs in well under a second on this sandbox's `bun`).

**Nodes are icon-over-label cards, not filename pills.** A node's `icon`
(Tabler, `scripts/icons.mjs::icon()`) or `logo` (a real full-color product
logo, `::logoIcon()`, `assets/logos/gilbarbara/*.svg`, CC0 — for
developer tools `simple-icons` doesn't carry, e.g. Bun, Playwright) is the
large, centered, primary visual in the card's upper area; `label` is a
short plain-language caption centered below it — never a filename or
internal identifier. **This repo's own manifests are built for a
technical audience (see the Jev quality-gate's own `AUDIENCE` constant),
but the flow-GIF diagram is the first thing a much broader, non-technical
LinkedIn scroller actually sees, and it has to stand on its own without
that context.** `content/jev-claude-code.flow.json` learned this the hard
way: its nodes originally read `quality-gate.mjs`, `build.mjs`,
`render.mjs` — meaningless to anyone who doesn't already know this repo.
They're now `"Quality Check"`, `"Build Page"`, `"Render Image"` etc. —
what each step *does*, not what file does it. `logo`/`icon` still has to
be factually true of that node (the `"Quality Check"` and `"Build Page"`
cards carry the real Bun logo because those scripts genuinely run as
`bun scripts/*.mjs`; `"Render Image"` carries the real Playwright logo
because that stage's entire job is driving Playwright/Chromium — a
generic Node.js mark would be *less* accurate, not just less specific,
once the repo migrated off plain `node`) — the caption is what changed,
not the discipline of only using real, applicable marks. A `brandBadge`
in the scene header works the same way (the real Anthropic mark on a post
that's literally about Claude Code, not a generic robot icon).

**`logo`/`icon` is the node's PRIMARY visual, large and centered — not a
corner accent — this was wrong in an earlier version of this file and of
the code, caught only by holding the actual output next to the real
reference post, not by re-reading either in isolation.** The initial
implementation sized `logo` at 20-26px, dimmed to 50-85% opacity, tucked
in the node's bottom-right corner, with the (still-technical) label
running the full card width beside it — a "credit," not content.
Compared side by side against the reference post's own image (a dense
infographic where every bank/app logo renders at roughly 80-150px, full
color, on its own white badge, plus explicit numbered steps), the gap was
structural, not cosmetic. Current behavior: a `logo` renders large (54px
icon on an 88px white rounded badge — white specifically so a multi-color
logo stays legible over the dark theme regardless of its own palette, the
same reason the reference's bank marks all sit on white chips rather than
directly on its colored zones) centered in the card's upper area; a plain
`icon` (52px, no white badge — Tabler's outline style already reads fine
directly on dark) is the fallback when no real product logo applies. The
plain-language `label` sits centered below, in `'Inter'` rather than the
monospace `'JetBrains Mono'` the rest of this diagram's UI chrome uses —
monospace reads as "code," which works against the non-technical-friendly
goal even where the words themselves are already plain. Every node also
gets a numbered step badge (a filled circle at its top-left corner,
`1`-indexed by array order) for the same reason the reference numbers its
steps: this pipeline genuinely is an ordered sequence, so the number is
real structure, not decoration (see `artifact-design`'s "structure is
information" principle — it applies here too, even outside an actual
Artifact page).

**Gotcha: node height and vertical spacing have to be recomputed together
— copying the old spacing numbers when the card got taller silently
overlapped every node into the next one.** Growing the card to fit a
much bigger logo badge (72px card height → 150px, to fit an 88px badge
plus a label row) without recalculating the y-spacing between nodes left
the old ~176px gaps smaller than the new 150px+comfortable-gap card
actually needed — nodes visually overlapped, labels sat inside the
*next* card's body, connectors criss-crossed through card interiors
again. Caught by rendering and looking (per "Verify visually" below), not
by reading the coordinates. Fix: whenever a node's `h` changes, re-derive
every `y` from scratch (`spacing = h + desired_gap`, positions
`start, start+spacing, start+2*spacing, …`) rather than reusing a
previous layout's numbers.

**Gotcha: a "smooth" easing curve on the dot is invisible if the actual
pixel distance it travels is too small to show it.** After the fix above,
node spacing left only ~23px of raw gap between adjacent cards, and
`EDGE_GAP` padding on both ends of the connector ate 20px of that — the
dot's real travel distance per hop was **3px**, over roughly 28 sampled
frames. No easing curve, however correct, reads as anything but a
teleport at that distance: the position is quantized to whole pixels, so
most consecutive frames land on the identical pixel and then jump 1-2px,
regardless of the underlying curve. This is why "the connectors don't
follow physics" and "not smooth" can both be true complaints about the
same output even after real per-hop easing (below) is already wired up —
easing curves and travel *distance* are separate problems, and fixing
only one leaves the other one dominant. Fix: widen the gap between nodes
specifically to give the dot room to move (here, card height 150→130px,
gap 23px→47px, `EDGE_GAP` 10→8px, netting roughly 31px of real travel per
hop) — confirmed by measuring the dot's actual per-frame pixel position
in a real decoded GIF (see "Verify visually" below), not by eyeballing a
still frame, since a still frame can't show whether motion was smooth.

**The dot's motion is eased per hop, not one linear constant-velocity
stretch across the whole journey** — a real flow-diagram "packet"
decelerates into a node and accelerates back out, it doesn't glide at a
fixed speed the entire way. CSS lets an individual `@keyframes` stop
declare its own `animation-timing-function`, which sets the easing curve
for the *interval ending at that stop* — so `buildFlowGifHtml()`'s
`travelStops` places one keyframe at each node's arrival instant
(`offset-distance` = that node's index fraction of the total path, since
all hops are equal length) carrying a `cubic-bezier(0.45, 0, 0.55, 1)`
ease-in-out, rather than the two-keyframe linear stretch an earlier
version used. The node glow pulse switched from `linear` to `ease` for
the same reason — a hard-edged linear glow-in/glow-out reads mechanical
next to an eased dot. (The marching-ants dash animations, `march`/
`march-branch`, stay `linear` on purpose — a conveyor-belt dash pattern
is *supposed* to move at constant speed; only the discrete node-to-node
hop benefits from easing.)

**The empty space beside the node column is filled with a "Live Status"
panel tied to real pipeline state, not decoration.** An earlier version
left roughly half the canvas empty for most of the loop (the four Jev
judgment chips only appeared briefly, floating unattached mid-canvas,
near the `jev` node). Replaced with a persistent panel listing every
node's label as a row that ticks on — checkmark dot + text, popping in
with a spring-like `cubic-bezier(0.34, 1.56, 0.64, 1)` overshoot ease,
then staying lit (same "persist, don't fade" rule as everything else in
this scene) — at the exact instant the dot arrives at that step (shares
the same `arrivalPct()` timing the node glow pulse and dot travel use, so
all three stay in sync off one source of truth). The four Jev checks
render as indented sub-rows directly under the "AI Judge" row instead of
a separate floating widget — one coherent list instead of two competing
elements fighting for the same visual space.

**Two more real gotchas hit wiring vendored icons into an SVG-in-SVG
scene, both again only visible by rendering and looking:**

3. **The two vendored icon sets disagree on both sizing and color
   convention, and naively dropping either straight into a nested `<svg>`
   breaks a different way.** Tabler icons declare `width="24" height="24"
   fill="none" stroke="currentColor"` on their own `<svg>` root (the
   `<path>`s carry no color of their own — they inherit that root's
   stroke). `simple-icons` brand marks declare neither: no width/height,
   and no stroke/fill on the path (initial SVG value: opaque black).
   Stripping the original `<svg>` tag and wrapping with a fresh, bare one
   (an earlier version of `templates/flow-gif.mjs::iconAt()` did exactly
   this to fix problem 4 below) silently drops Tabler's own
   `fill="none" stroke="currentColor"`, turning every outline icon into a
   solid black blob. **Fix: patch only `width`/`height` on the icon's own
   `<svg>` tag in place (regex, see `sizedIcon()`) — never discard the
   rest of its attributes.**
4. **A nested `<svg>` with no explicit `width`/`height` doesn't fall back
   to its `viewBox` — it falls back to the browser's default
   replaced-element box (300×150 CSS px)**, so a `simple-icons` mark
   (viewBox-only, see above) dropped in raw renders roughly 12x its
   intended size, not icon-sized. This is exactly why problem 3's fix has
   to *add* explicit `width`/`height`, not merely preserve the original
   tag as-is.

**Two real gotchas hit building the animation/timing itself, both found by
actually measuring pixel output, not by reading the generated markup or
eyeballing a couple of preview crops** (see "Verify visually" in "Git /
workflow conventions" — this applies just as hard to a GIF as to a
carousel PNG):

1. **A CSS `transform` animation completely replaces an SVG element's
   `transform` attribute instead of composing with it.** Positioning a
   node/chip via `transform="translate(x,y)"` and *also* animating CSS
   `transform` (e.g. a fade-in's `translateY`/`scale`) on the same
   element collapses it back to the SVG's origin the instant the
   animation applies — every chip landed on top of each other near
   (0,0). Fix: position on an outer, unanimated `<g>`; only animate
   `transform` on a nested inner `<g>`.
2. **An `<svg>` left in normal document flow after a preceding element
   (here, an `<h1>` title) gets pushed down by that element's flow
   height**, silently shifting every coordinate inside it and clipping
   whatever falls off the bottom of a fixed-height, `overflow: hidden`
   container — no error, just a missing last node. Fix: `position:
   absolute; top: 0; left: 0` on the `svg`, same "layered, not flowed"
   pattern `templates/carousel.mjs` already uses for `.bg-dots`/`.bg-glow`.

Both were caught by measuring actual rendered pixel positions (DOM
`getBoundingClientRect()` during debugging, then tracking the dot's
measured y-coordinate across every decoded GIF frame) rather than trusting
a quick visual skim — a small preview crop of a 2160px-tall frame is easy
to misread by eye, especially near a node boundary; a numeric position
trace across all frames is not.

**Connectors are real edges, not one line drawn through every node's
body.** An earlier version of `buildFlowGifHtml()` drew a single line
from the first node's center to the last node's center and let the dot
travel that whole span — invisible mid-node only because the card fill
happened to be opaque, not because the connector respected node
boundaries the way an actual flow-diagram edge does. Caught by holding
the output next to a real reference diagram, not by re-reading the SVG.
Current behavior: one path segment per adjacent node pair, starting
`EDGE_GAP`px below the source node's bottom edge and ending `EDGE_GAP`px
above the target's top edge, each with its own arrowhead polygon showing
direction (rotated via real trig for the diagonal branch connector, fixed
downward-pointing for the vertical main-path segments). The dot's
`offset-path` is a **separate**, invisible multi-subpath `d` string built
from those same segments — CSS motion-path treats `offset-distance` as
continuous length across subpaths and jumps instantly at each `M`, which
is correct here: the dot should only ever be visible while actually
traversing a connector, and disappear the instant it would otherwise be
"inside" a node.

**Chip/status rows persist once shown instead of fading back out.** The
four judgment checks (and every other row in the "Live Status" panel, see
above) represent things that stay true for the rest of the pipeline run
once reached, not a transient tooltip — fading a row out after the dot
moved past its node was wrong regardless of how it looked. This started
as a chip-specific fix (floating chips got a fade-in-then-idle-bob
`@keyframes` set, computed per chip with `sin()`-phased motion since a
CSS animation can't do the trig itself) and carried forward unchanged in
spirit when chips were folded into the status panel: every row's
`statusRow-N` keyframes hold `opacity: 1` from its arrival instant to
100%, never fading back to 0. Rows still reset at the loop seam (next
iteration's own 0% keyframe), which is an acceptable hard cut at a GIF
loop boundary, same as the dot's own jump back to the first node.

**GIF's frame delay is stored in 1/100s units, so true 60fps (16.67ms/
frame) isn't representable** — `gifenc` rounds to the nearest achievable
value, 2 centiseconds (20ms → 50fps), which is as close as the format
gets. That's a real format ceiling, not a bug in `scripts/gif.mjs`.
Requesting a higher frame rate also multiplies frame count directly
(`Math.round(loopMs / (1000/fps))`), which multiplies file size roughly
linearly — going from 18fps to 50fps-effective-60 on this same scene
took `output/jev-claude-code/flow.gif` from ~4.4MB (76 frames) to
~15.4MB (252 frames), likely too large for a practical LinkedIn upload.
`--fps` is a real tradeoff between motion smoothness and file size, not
a free dial — check the resulting file size after raising it, the same
way you'd check a carousel PNG's dimensions after changing `--scale`.

**Real dwell time at each node, not just a slower version of continuous
motion — direct feedback: "make each step progression stay a bit longer
for the user to read."** The original travel timeline had no real pause
at intermediate nodes at all: `travelStops` placed one keyframe per node
at its exact arrival instant, and CSS immediately continued interpolating
`offset-distance` toward the NEXT node's keyframe from that same instant
— the dot never stopped, "arrival" was only a glow flash layered on top
of motion that kept going the whole time. Increasing `loopMs` alone would
have just slowed that same continuous motion down uniformly, not created
an actual pause. Fixed with a real hold/move timeline: `HOLD_RATIO = 3`
(each hold is 3x a move's own duration) partitions `nodes.length` holds
and `nodes.length - 1` moves across the full 0–100% loop
(`holdUnit`/`moveUnit`, derived from node count rather than hardcoded);
`travelStops` now emits TWO stops per node — arrival (carrying the eased
`animation-timing-function` for the hop that just ended) and hold-end, at
the SAME `offset-distance` — and CSS holds a genuine flat plateau between
two identical-value stops. `arrivalPct(i)` is now a hold window's
*start*; `holdEndPct(i)` is new. The node glow/ink pulse was rewritten to
match: it now ramps in at hold start, stays lit through most of the hold
(a real "this is the active step" indicator while you're meant to be
reading it, not a one-frame flash), and fades out only right before the
hold ends. Chip stagger (the four Jev-style facts under a `chipsAt` node)
now spreads across ~75% of that node's own hold window
(`chipWindowSpan`) instead of a fixed `+6` percentage-point offset tuned
for the old, much shorter timeline — that fixed offset would have
crammed every chip into the first sliver of a now much longer hold, then
left them sitting there unrevealed for most of the read window.
`content/agent-governance.flow.json`'s `loopMs` went from 4600 to 7800 to
give the new hold windows (now ~13% of the loop each, versus an
effectively-zero real hold before) a comfortable absolute duration — a
post with a shorter `loopMs` still gets a real, proportionally shorter
hold rather than none at all, so this is safe to leave untouched on a
post that doesn't need it lengthened.

**Text across the whole scene is meaningfully bigger** — another direct
"make the text bigger and readable" — node labels 26→31px, the title
48px (44px for a JetBrains-Mono-display theme specifically, see the
gotcha below), notes/status rows 19→22px (main) and 16→19px (chip
sub-rows), the step badge itself enlarged to match (`STEP_R` 24→27,
digit 20→23px), branch-node text 19→22px, the brand badge 17→19px. `ROW_H`/
`SUB_ROW_H` (column layout) and `CHIP_ROW_H`/`NOTE_TO_CHIPS_GAP` (zigzag)
all grew proportionally alongside the fonts they space — bumping a font
size without also widening its row spacing just re-crowds the text that
got easier to read.

**Gotcha: a flat title-font-size bump wrapped a 2-line title to 3 lines
for the JetBrains-Mono-display theme specifically, colliding with the
first node's own badge.** A monospace face is proportionally WIDER per
declared pixel size than either of this repo's other two display fonts
(Space Grotesk, Poppins) — the same +4px bump that was safe for those two
pushed "dossier" (JetBrains Mono) past its wrap point. Same class of bug
as the earlier zigzag title-collision gotcha (see "Layout" below), just
triggered by font choice instead of title length this time, and caught
the same way — by rendering and looking, not by reading the CSS. Fixed
with a per-font-family size table (`DISPLAY_FONT_SIZES`, the same pattern
`DISPLAY_FONT_WEIGHTS` already uses) rather than one flat `h1` size for
every theme.

**Gotcha: the same bigger font that fixed readability also overflowed a
note clean past its own lane, into the neighboring node's step badge.**
`content/agent-governance.flow.json`'s `checks` node had a 44-character
note (`"Schema, structure — what a linter can catch"`) that fit, barely,
at the old 19px — at the new 22px it ran past the ~460px lane width by
enough to visually collide with the next row's diamond badge, which
itself overhangs its node's own left edge by `STEP_R * 1.4` (~38px),
leaving only a few real px of margin even for correctly-sized text. Not
a layout bug — the lane math itself is still exactly right; the note text
was simply too long for it at the new size. Fixed by shortening every
`note` string in that manifest, not by shrinking the font back down
(shrinking it back would have undone the actual readability fix). **A
`note` string's real length budget is roughly 30–36 characters at this
theme's font/lane width** — check any new note against an actual render,
the same "verify visually" discipline this file already asks for
everywhere else, rather than assuming a short-looking string is short
enough.

## Every post ships the same level of production variation as video-generator

Direct instruction, after `output/` was already switched to committed
(see "Git / workflow conventions"): match the depth of what
`video-generator`'s own per-reel output carries, not just this repo's
final media file. A `video-generator` reel folder
(`reel-<slug>/`) never ships just the `.mp4` — it's the `.mp4`/`.html`
render pair, a **purpose-built `cover.png`** (+ the `cover.html`/
`cover-build.mjs` that made it), and **separate `caption.md` and
`hashtags.md`** files. This repo now matches that for every real post:

- **`cover.png` + `cover.html`** — every `output/<slug>/` needs a
  deliberately composed poster image, not a mid-loop GIF frame. This is
  what the `cover-art` skill (`.claude/skills/cover-art/SKILL.md`) already
  mandated but this repo had no reference implementation for yet;
  `scripts/build-cover.mjs` is that implementation — see its own header
  comment and "Cover script details" below.
- **`caption.md` and `hashtags.md` as two separate files**, not one
  combined doc — matches `video-generator`'s own per-reel convention
  exactly (each file opens with a `# Caption — "<title>"` /
  `# Hashtags — "<title>"` heading). `scripts/build.mjs` writes both from
  a carousel manifest's `caption`/`hashtags` fields automatically; a
  flow-GIF post's pair is still hand-written (no schema field for either
  on a flow manifest — same as before), just now as two files instead of
  one.

### Cover script details (`scripts/build-cover.mjs`)

Takes the same `content/<slug>.flow.json` `build-flow-gif.mjs` does, plus
three cover-only optional fields, **never auto-derived** from the flow's
own node labels (same "highest quality input, write it by hand" rule this
file already applies to `alt` text and flow-GIF captions):
`coverEyebrow` (small tracked-caps line), `coverSubtitle` (one
plain-language sentence stating the hook), and `author`/`handle` (defaults
to this repo's own usual "Sandesh Kale" / "GenAI Solutions Architect" if
omitted).

Composes an **orbiting-icon ring** — every flow node's own `icon`/`logo`/
`brand` art (reusing `scripts/icons.mjs`'s real loaders, never a
hand-copied SVG path, per the `cover-art` skill's own rule) spaced evenly
around the post's `brandBadge` mark at the ring's center — a genuinely
different composition from the flow-GIF's own node-column/zigzag layout,
not a frame lifted from it. Colors/fonts/shapes are pulled from the exact
same resolved theme the flow-GIF itself renders with, via a new exported
`resolveTheme()` in `templates/flow-gif.mjs` (pulled out of
`buildFlowGifHtml()`'s own theme-merge logic specifically so this script
can't drift from it — same `hexToRgbTriplet()`/`DISPLAY_FONT_WEIGHTS`/
`DISPLAY_FONT_SIZES` helpers are exported alongside it for the same
reason). Rendered once with a plain Playwright screenshot (`1080×1350`,
`deviceScaleFactor: 2`) — no Web Animations scrubbing, a cover has no
timeline.

**Gotcha: a 1080×1080 square canvas (the skill's own "standalone
flow-GIF poster" suggestion) didn't have enough vertical room and the
title/subtitle/footer text block collided outright** — a 2-line title
ending around y=930 left only ~50px before a 2-line subtitle's own
hardcoded `top`, which itself ran straight into the footer avatar.
Switched to this repo's standard `1080×1350` canvas (same one
`templates/carousel.mjs` uses) instead — matches the "pick based on what
the cover is replacing" guidance in the skill, and a flow-GIF post
replacing a carousel is exactly this repo's own case. Caught by
rendering and looking, not by reading the CSS.

**Gotcha: the same class of bug this file already documents twice for
flow-GIF layout (node-height/spacing, zigzag title-collision) hit the
cover script too — a display-font-dependent line count broke a
hardcoded absolute pixel offset.** JetBrains Mono (the "dossier" theme's
display font) is proportionally wider per declared px than Space
Grotesk/Poppins, so `agent-governance`'s title wraps to 3 lines where the
other two themes' fonts wrap to 2 — with the title and subtitle each
independently `position: absolute; top: <hardcoded px>`, the 3rd title
line ran straight into the subtitle sitting at a fixed offset tuned for
2 lines. Fixed the general case, not just this one instance: title and
subtitle now share one normal-flow container (`margin-top` between them)
inside a single absolutely-positioned wrapper, so any line count self-
adjusts within the same generous envelope between the ring and the
footer, instead of two independently-guessed pixel offsets that only
happen to work for one specific line count. **General lesson (third time
this exact bug class has hit this repo): a display-font-dependent line
count and a hardcoded absolute `top` never coexist safely — use flow
layout (margin, not two separate absolute offsets) wherever text volume
can vary by theme.**

## Content quality gate (Jev)

`scripts/quality-gate.mjs` runs a manifest's content past [Jev](https://typesafe.ai)
(TypeSafe AI's "System One" decision model) before it's built, for the class
of judgment a Zod schema can't make: not "is this JSON well-formed" but "is
this hook actually going to land." It answers a fixed set of questions per
manifest — one `systemOne` call, several questions evaluated in parallel
(Jev's "speculative fan-out" pattern):

- **`hook_strength`** (Score, 4 levels) — only if a `hook` slide exists.
- **`cta_is_specific`** (Noul) — only if a `cta` slide exists; flags generic
  "follow me for more" boilerplate disconnected from the post's own content.
- **`jargon_risk`** (Noul) — always run, over every slide's text combined;
  flags undefined acronyms/jargon the stated audience wouldn't recognize.
- **`diagram_readability_<i>`** (Score, 3 levels) — one per `diagram` slide;
  judges legibility at LinkedIn feed-thumbnail size, not full-screen.

**Why this is its own stage, run *before* `build.mjs`, never inside it or
`render.mjs`:** this repo's core render contract (above) requires the
build/render path to be fully deterministic and offline — no runtime JS, no
async resolution — by the time a slide reaches Chromium. A call to an
external LLM-judge is neither deterministic (it can disagree with itself
between runs — see the hook-strength example below) nor offline. Keeping it
a separate, deliberately-invoked step (like running a linter before a
build, not inside one) means `build.mjs`/`render.mjs` keep their existing
guarantee unconditionally, whether or not the quality gate is ever run.

**"Input data must always be of the highest quality" — what that means in
code, not just in principle:** `buildState()` in `quality-gate.mjs`
constructs one structured `state` object per Jev's own guidance
(`docs.typesafe.ai/concepts/state`: prefer a named-field object over a
flattened string, "put related information together," and separate the
*content being judged* from the *criteria for judging it* — the criteria
live in each question's `instructions`/`criteria`, not in `state`). Concretely
this repo's `state` always includes:
- an explicit `audience` field spelling out who the post is for and what
  the account's brand actually is — without this, "is this hook strong" has
  no fixed bar to judge against;
- the full slide content relevant to each question, grouped by purpose
  (`hook_slide`, `cta_slide`, `all_slide_text`, `diagrams`) rather than one
  giant blob — each question's `instructions` points at the specific field
  it should look at (e.g. "see `state.hook_slide`");
- raw code/Mermaid source is *excluded* from the jargon check (`slideText()`
  skips `code`/`mermaid` fields) — jargon inside a code block is expected
  and not a defect, so including it would just add noise the model has to
  correctly ignore rather than removing a real signal.

**Confidence gating**, per Jev's own confidence-routing pattern
(`docs.typesafe.ai/patterns/confidence-routing`): every answer resolves to
`OK` / `FLAG` / `REVIEW`, never treated as ground truth on its own.
`CONFIDENCE_FLOOR = 0.6` (Jev's own docs: "start with conservative
thresholds... adjust as you observe results" — this is deliberately the
same floor their own example uses, not independently tuned yet) — below it,
the verdict is `REVIEW` regardless of the answer's direction, because Jev's
own interpretation guidance says a Noul near 0.5 or a low Score `confidence`
means the model itself doesn't have a clear read; only a confident answer
resolves to `OK` (good) or `FLAG` (confident problem). Score questions carry
`confidence` directly from the API; Noul questions don't, so it's derived as
`|noul − 0.5| × 2` — the same "near 0.5 is uncertain" reading Jev's docs give
for interpreting a Noul answer on its own, applied as a gate.

By default the gate is advisory: it prints a report and exits 0 even with
`FLAG`/`REVIEW` rows. Pass `--strict` to make any non-`OK` row exit 1 —
wire that into CI or a pre-publish check once you trust the thresholds
against your own results, per Jev's own tuning advice above.

**Auth**: `scripts/jev.mjs` reads the key from `process.env.JEV_API_KEY`
(this environment's actual variable name) and passes it explicitly as
`TypeSafeClient({ apiKey })`, rather than relying on the SDK's own default
env var (`TYPESAFE_API_KEY`) — the two names don't match here, so an
implicit read would silently fail. Never `echo`/log this value; if you need
to confirm it's set, check for presence (`[ -n "$JEV_API_KEY" ]` / `env |
grep -c JEV_API_KEY`), never print it.

**Extending it**: a new decision point is a new entry in `buildQuestions()`
(pick `score`/`noul`/`choice` per what's being decided — see
`docs.typesafe.ai/primitives`) plus a matching row-builder in
`evaluateChecks()`. Keep every new question's `state` reference scoped to
exactly the field it needs (as the existing four do) rather than dumping
the whole manifest into every question's `instructions` — that's the same
"highest quality input" discipline, not a one-time setup step.

## Repository map

```
linkedin-post-generator/
├── .claude/
│   └── skills/
│       └── cover-art/      SKILL.md — purpose-built poster frame for a flow-GIF post, ported from video-generator
├── scripts/
│   ├── build.mjs           Manifest → self-contained HTML (the "compiler")
│   ├── render.mjs          HTML → carousel.pdf + slide-NN.png (the "exporter")
│   ├── mermaid.mjs         Mermaid diagram engine → static <svg> string, pre-render helper
│   ├── d2.mjs              D2 diagram engine (WASM, no browser) → static <svg> string — see "Diagram engines"
│   ├── shiki.mjs           Code string → syntax-highlighted <pre> HTML, pre-render helper
│   ├── manifest-schema.mjs Zod schema + parseManifest() — the JSON-shape guardrail
│   ├── icons.mjs           Vendored icon/logo loaders: icon() Tabler, brandIcon() simple-icons, logoIcon() gilbarbara
│   ├── jev.mjs             Jev/TypeSafe AI client wrapper (JEV_API_KEY → TypeSafeClient)
│   ├── quality-gate.mjs    Manifest → Jev content-quality judgment (advisory or --strict), pre-build only
│   ├── build-flow-gif.mjs  Flow manifest → animated-scene HTML — see "Animated GIF posts"
│   ├── gif.mjs             Animated scene HTML → looping .gif, via deterministic Web Animations scrubbing
│   └── build-cover.mjs     Flow manifest → cover.html + cover.png poster — see "Every post ships a cover image"
├── templates/
│   ├── carousel.mjs        buildHtml({title, author, handle, slides, theme}) — CSS + per-slide-type markup;
│   │                       CAROUSEL_THEMES + resolveCarouselTheme() — see "Visual identity (carousel themes...)"
│   └── flow-gif.mjs        buildFlowGifHtml({nodes, edges, ...}) — animated flow-diagram scene markup
├── content/
│   ├── example-rag-guardrails.json   Sample manifest (all 6 slide types, no icons — tests the no-icon path)
│   ├── speculative-decoding.json     Sample manifest using icons + a stat "compare" bar chart
│   ├── rag-retrieval-quality.json    First real content manifest using engine: "d2" — see "Diagram engines" gotchas
│   ├── jev-claude-code.flow.json     Sample animated-GIF flow manifest, "blueprint" theme — see "Animated GIF posts"
│   └── agent-governance.flow.json    Flow manifest, "dossier" theme + "zigzag" layout — see "Visual identity"/"Layout"
├── assets/
│   ├── fonts/              Vendored webfonts (.woff2, OFL) — see "Typography"
│   ├── icons/              Vendored icon sets incl. tabler/ (.svg) — see "Slide manifest schema"
│   ├── illustrations/      humaaans-react, flowbite, bioicons — see "Asset library"
│   ├── logos/, photos/     Brand marks, stock photos — see "Asset library" (licensing caveats)
│   ├── animations/         From video-generator; NOT directly usable here — see "Asset library"
│   └── VIDEO_GENERATOR_ATTRIBUTION.md   Per-source license table for the merged-in set
├── output/                 Generated, committed — carousel.html/.pdf, slide-NN.png (or flow-scene.html/flow.gif),
│                           cover.html/cover.png, caption.md, hashtags.md, alt-text.md per slug — see "Every post
│                           ships a cover image" and "Git / workflow conventions"
├── package.json            Deps: playwright, mermaid, @terrastruct/d2, shiki, zod, @typesafe-ai/sdk
├── bun.lock                Committed lockfile — see "Runtime & package manager"
└── CLAUDE.md               This file
```

## Runtime & package manager

This repo runs on **[bun](https://bun.sh)**, not npm — `bun install`,
`bun scripts/build.mjs` (or `bun run build`/`render`/`quality-gate`, the
`package.json` script aliases). `bun.lock` is the committed lockfile;
there is no `package-lock.json` and one should not be reintroduced.

**This was a measured decision, not a default.** Before migrating,
`npm`/`pnpm`/`bun`/`yarn` install speed was actually benchmarked in this
exact sandbox on this exact `package.json` (not looked up from a generic
blog post), and the choice was then put to Jev (`docs.typesafe.ai`) as a
`choice` question over the four real options, with those measurements as
`state` — see `CLAUDE.md`'s "Content quality gate (Jev)" section above for
why that discipline (structured state, real facts, not a prose dump)
matters generally; this is the same discipline applied to an infra
decision instead of a content one. Result: **bun, 99% confidence.**
Cold installs: npm 7.2s, pnpm 3.16s, bun 3.43s, yarn (Classic, the only
Yarn actually preinstalled here — not v4/Berry) 18.8s, slower than npm
itself. The deciding factor wasn't the cold number, though — it was
**in-session repeat installs**, which is what a real dev session actually
does over and over (this session alone ran well over a dozen). Bun keeps
a global install cache that survives `rm -rf node_modules` within a
session: repeat installs measured **0.26s**, against pnpm's 2.2s.

**Before committing to the migration, the full three-stage pipeline was
run *as bun, not just installed by bun*** — `bun scripts/quality-gate.mjs`
(real Jev network call), `bun scripts/build.mjs` (Mermaid via Playwright,
D2 via WASM, Shiki, Zod, icon validation), `bun scripts/render.mjs` (real
`page.pdf()`/`screenshot()`) — and the resulting PNG was pixel-diffed
against the npm-produced one. Identical. Error paths (an invalid manifest,
`--strict` exit codes) were checked too, not just the happy path. The one
result worth flagging explicitly: `scripts/d2.mjs`'s `process.exit()`
workaround for D2's missing `dispose()` API (see "Diagram engines" below)
was re-verified to still be necessary and still work correctly under
bun's event loop — this is exactly the kind of runtime-specific gotcha
that would otherwise only surface later, silently, the first time a `d2`
diagram slide got built in production.

**One concrete upside for future work, not just parity**: the Excalidraw
diagram-engine integration documented as deferred in "Diagram engines"
below was blocked specifically on needing to bundle
`@excalidraw/mermaid-to-excalidraw` for browser injection, and ad hoc
`esbuild` installs kept getting silently pruned by *npm's* resolver
mid-session. Bun ships its own bundler (`bun build`) — no separate
dependency for npm's resolver to prune. That specific blocker is
substantially reduced on bun, should that integration get picked back up.

**Honest residual caveat**: bun's Node.js compatibility is very good but
not contractually 100%, and Playwright-on-bun has had scattered
version/platform-specific community reports historically. This repo's own
direct verification above (real PDF/PNG output, pixel-diffed) is stronger
evidence than that generic caveat for this exact dependency set as of this
migration — but it's why a version bump to `playwright`, `mermaid`, or
`@terrastruct/d2` is worth a quick re-run of the real pipeline (per
"Verify visually" in "Git / workflow conventions" below), not assumed
compatible forever.

## The pagination contract (CSS `@page`, not `__seek`)

`templates/carousel.mjs` emits one `<section class="slide">` per manifest
slide, each exactly `1080×1350` CSS px with `page-break-after: always`
(cleared on the last slide). `render.mjs` calls `page.pdf({
preferCSSPageSize: true, printBackground: true })`, which tells Chromium
to respect the `@page { size: 1080px 1350px; margin: 0; }` rule in the
template's `<style>` instead of defaulting to US Letter/A4 — this is the
load-bearing option; forgetting it silently produces a wrong-size,
wrong-margin PDF. Per-slide PNGs are exported separately with
`elementHandle.screenshot()` on each `.slide`, which needs no pagination
CSS at all — element screenshots crop to the element's own box regardless.

## Manifest validation (guardrails)

`scripts/manifest-schema.mjs` defines a Zod `discriminatedUnion('type', ...)`
schema covering the manifest shape and all six slide types.
`scripts/build.mjs` calls `parseManifest()` on the parsed JSON before doing
anything else — an unknown `slide.type`, a missing required field (e.g. a
`hook` slide without `headline`), or a non-kebab-case `slug` fails fast with
every violation listed, instead of surfacing later as an obscure `undefined`
deep inside `templates/carousel.mjs`. This is the guardrail layer a future
LLM "Planner" step (generating manifests instead of a human hand-writing
them) would need in front of `build.mjs` regardless — enforced now so any
manifest, hand-written or generated, gets the same validation. Adding a new
slide type means updating both `templates/carousel.mjs`'s `RENDERERS` map
*and* `manifest-schema.mjs`'s slide union — the two are meant to be kept in
lockstep, not just the former.

## Slide manifest schema (`content/*.json`)

```jsonc
{
  "slug": "rag-guardrails",       // optional; defaults to the filename
  "title": "...",                 // <title>, not shown on any slide
  "author": "Sandesh Kale",       // footer name, omit to hide the footer entirely
  "handle": "GenAI Solutions Architect", // footer subtitle, optional
  "theme": "daylight",             // optional; named CAROUSEL_THEMES preset, full object, or
                                    // { extends: '<preset>', ... } — defaults to "blueprint";
                                    // see "Visual identity (carousel themes...)"
  "slides": [ { "type": "hook" | "diagram" | "code" | "stat" | "list" | "cta", "alt": "...", ... } ],
  "caption": "...",               // optional — the post's own text; not rendered on any slide
  "hashtags": ["GenAI", "..."]     // optional — without leading #, added by build.mjs
}
```

`caption`/`hashtags` are never touched by `templates/carousel.mjs` — they exist
so a post's text lives in the same single-source-of-truth JSON file as its
media. If present, `scripts/build.mjs` writes them out as
`output/<slug>/caption.md` (caption, blank line, space-joined `#tags`)
alongside `carousel.html`, ready to paste into LinkedIn's post composer.

`alt` is optional on every slide type (defined once on `baseSlide` in
`manifest-schema.mjs` rather than repeated per type), capped at 1,000
characters — LinkedIn's own image alt-text field limit, enforced at
manifest-validation time rather than discovered at upload. **Never
auto-derive it** from the slide's other fields (a generated "headline: X,
sub: Y, icon: bolt" string tells a screen-reader user nothing a sighted
user gets from actually looking at the slide — the layout, the diagram's
shape, which bar is longer) — write each one by hand describing what's
actually on the slide, the same discipline as writing real alt text for
any image. If any slide in a manifest has `alt`, `build.mjs` writes
`output/<slug>/alt-text.md`, one block per slide, numbered — a slide
without `alt` gets an explicit "(no alt text written for this slide)"
placeholder rather than being silently omitted, so a partially-described
carousel shows up as a visible gap in the file instead of looking complete.

**Caption structure, calibrated against real high-performing posts, not
guessed**: a sample of 4 posts (2,830 / 1,279 / 911 / 213 likes) showed the
lowest performer was the one structurally closest to a naive AI-generated
caption — flowing prose, no myth-correction hook, nothing telling the
reader to save it. The top 3 shared: a myth-correction or shocking-number
opening line ("Your database isn't slow, you forgot to cache" / "₹18.41
Trillion"), an explicit **save-this** trigger, and emoji-sectioned,
scannable structure (⚡🎲📊⚠️ — short paragraphs under each, not dense
blocks). Notably, 2 of the top 3 had **no carousel at all** — the carousel
isn't what won, the hook and scannability did. Write every caption in this
structure (see `speculative-decoding.json`'s `caption` field for a worked
example) regardless of whether the post also has slides; don't let the
carousel's existence excuse a lazy caption. Still keep the carousel for
content whose value is genuinely visual (a real diagram, real code) — that
was the other consistent trait across posts that *did* carry a carousel
and still performed.

Slide types and their fields, all in `templates/carousel.mjs`'s
`RENDERERS` map:

- **`hook`** — `icon?`, `eyebrow?`, `headline`, `sub?`. Opening slide.
- **`diagram`** — `icon?`, `heading?`, `engine?` (`'mermaid'` default or
  `'d2'` — see "Diagram engines" below for what each needs and why two
  exist). Mermaid engine: `mermaid` (source, required), `mermaidTheme?`
  (defaults `'base'`), `look?` (`'classic'` default or `'handDrawn'` —
  reliable on simple diagrams only, see the Mermaid gotcha below). D2
  engine: `d2` (source, required instead of `mermaid`), `d2ThemeId?`
  (defaults `200`).
- **`code`** — `heading?`, `lang` (any Shiki/TextMate grammar id, e.g.
  `typescript`, `python`, `bash`), `code`, `shikiTheme?` (defaults
  `github-dark-default`). No `icon` — a code slide's content is the visual.
- **`stat`** — `icon?`, `value` (big gradient number/short string), `label`,
  `context?` (supporting sentence), `compare?` (exactly 2
  `{label, value: 0-100, highlight?}` rows — renders as a labeled
  before/after bar chart under the stat instead of leaving the number
  alone on the slide; `value` is relative bar length, not a literal
  percentage, so word it into the `label` if it needs to read as one, e.g.
  `"Speculative decoding — ~3x throughput"`).
- **`list`** — `heading?`, `items` (array; each item is either a plain
  string, rendered with an auto-numbered badge same as before, or
  `{icon?, text}` for a per-item icon badge instead of a number — mixing
  both forms in one list is fine).
- **`cta`** — `icon?`, `headline`, `sub?`. Closing slide.

`icon` fields take a name from `assets/icons/tabler/*.svg` (vendored Tabler
Icons, MIT — outline style, `stroke="currentColor"` so it recolors via CSS;
see `scripts/icons.mjs`). `scripts/manifest-schema.mjs` validates every
`icon`/list-item-`icon` value against the actual vendored file set at
schema-definition time (`readdirSync` on that directory), so referencing an
icon that was never vendored fails manifest validation with the full list
of valid names — the same "fail fast with a clear message" guardrail
philosophy as the rest of this file, not a separate concern.

**Vendoring a new icon**: this repo doesn't keep `@tabler/icons` as a
dependency — same pattern as fonts (`bun add --no-save @tabler/icons`,
copy the specific `icons/outline/<name>.svg` files needed into
`assets/icons/tabler/`, `npm uninstall`). `assets/icons/tabler/LICENSE-MIT.txt`
already covers the whole set; no per-icon attribution needed.

**Icons are optional on every slide type that has them for a reason**: a
slide with no `icon` field renders exactly as it did before this field
existed (no badge, no reserved space) — this keeps `content/example-rag-guardrails.json`
valid without changes and means a post doesn't have to hunt for a
plausible icon for every single slide. Use one where it adds real
information (which failure mode, which metric), not as decoration on every
slide reflexively — a badge on a slide with nothing to differentiate reads
as noise, not polish.

Adding a new slide type: add a `render<Type>(slide)` function and a CSS
block to `templates/carousel.mjs`, register it in `RENDERERS`, and (if it
needs pre-render hydration like `diagram`/`code` do) add a case to
`hydrateSlide()` in `scripts/build.mjs`.

## Safe zones

Unlike Instagram Reels (which overlays its own UI chrome on top of the
video), LinkedIn's document viewer does not draw persistent chrome over
carousel slide content — but it does render its own page-counter and
swipe affordance, and slides are frequently viewed as small feed
thumbnails. `templates/carousel.mjs` reserves:

- **Top ~96px, sides ~72px, bottom ~140px** (`SAFE_TOP`/`SAFE_SIDE`/
  `SAFE_BOTTOM` constants) — the `.safe` wrapper applies this as padding on
  every slide, so headline/body content never touches the raw edge.
- **Top-right**: reserved for the `N / total` page-count pill.
- **Bottom-left**: reserved for the author footer (avatar + name +
  handle).
If a new slide type needs full-bleed art behind that safe box (e.g. a
photo background), keep it on a `z-index: 0` layer under `.safe`, same
pattern as `.bg-dots`/`.bg-glow`.

## Asset library (merged in from video-generator)

`assets/` also carries a full copy of `video-generator`'s curated
third-party asset library (fonts/icons merged additively — see below —
everything else copied wholesale), so a post has real illustration/photo/
logo material to draw on instead of text-only slides. Per-source licenses
are in each package's own `LICENSE*` file; `assets/VIDEO_GENERATOR_ATTRIBUTION.md`
is video-generator's own attribution table for sources that don't ship
their own license file (read it before using anything from `logos/` or
`photos/` — `logos/svg-logos/` in particular carries **no license grant at
all**, reference/identification only, never redistribute as an owned asset).

- **`assets/illustrations/`** — `humaaans-react/` (24 pre-composed
  character poses, MIT, JSX source with resolvable color props — see
  `video-generator/CLAUDE.md`'s "Character variety (humaaans)" for the
  extraction pattern if a post ever wants a character), `flowbite/` and
  `bioicons/` (full-color illustration SVGs, used as-is).
- **`assets/logos/`** — `gilbarbara/` (brand logo marks, check its own
  LICENSE for terms), `svg-logos/` (reference/identification only, no
  license grant — see above), `unilogo/`.
- **`assets/photos/servicestack/`** — stock photography.
- **`assets/fonts/`** — gained `poppins/` and a couple of extra weights on
  the fonts already vendored here; still needs a matching `@font-face`
  block in `templates/carousel.mjs::baseStyles()` before use, same as any
  new family (see "Typography" below).
- **`assets/icons/`** — `feather/` and `simple-icons/` (brand marks) are
  new; `tabler/` is a **merge**, not a replace — the icons this repo
  already vendored via `scripts/icons.mjs`/`bun add --no-save
  @tabler/icons` (a newer icon set/format) were kept as-is and
  video-generator's older curated Tabler subset was added alongside
  without overwriting any filename already in use (its set doesn't even
  include a couple of names this repo already references, e.g.
  `git-branch`/`language` — copying over the existing files instead of
  merging around them would have broken the speculative-decoding post).
  Both formats are plain `<svg>` markup with `stroke="currentColor"`, so
  `scripts/icons.mjs`'s raw-inline loader works on either without changes
  — but if a name exists in both, this repo's own vendored version is the
  one that's actually on disk.

**The one thing here that does *not* carry over usably: `assets/animations/`.**
video-generator's whole point for that folder is wiring a real-time CSS/SMIL
animation pack up to `window.__seek(t)` so it can be scrubbed to an exact
frame at render time. This repo's render contract (top of this file) is
stricter than that — `render.mjs` has no time axis at all, just a single
static `page.pdf()`/`screenshot()` per slide — so an animation pack here
can only ever supply *one fixed visual state* (e.g. a specific loader
shape), never actual motion. If a slide ever wants something from
`assets/animations/`, freeze it to a single static frame at build time
(bake the exact CSS state into the generated HTML, no `animation-play-state`
scrubbing trick needed since there's no playback to pause) — don't wire it
up expecting it to animate, it won't: `render.mjs` never runs long enough
to see more than the first paint.

## Typography

Same vendoring rule as `video-generator`: **fonts must be vendored, never
assumed present.** Headless Chromium has no system fonts installed beyond
whatever the container image ships — an unavailable `font-family` falls
back silently, not loudly. `assets/fonts/{inter,space-grotesk,
jetbrains-mono}/*.woff2` were extracted from `@fontsource/*` packages
(`bun add --no-save @fontsource/<name>`, copy the specific weights
from `node_modules/@fontsource/<name>/files/`, then `npm uninstall` — the
repo keeps the extracted `.woff2` files, not the npm dependency) and are
loaded via relative `@font-face` `url()`s in `templates/carousel.mjs`
with `font-display: block`. License: `assets/fonts/LICENSE-OFL.txt`.

- **Space Grotesk** (700/500) — headlines, stat values, "heading" slide titles.
- **Inter** (400/600/700) — body text, footer, list items.
- **JetBrains Mono** (400/600) — eyebrow labels, page-count pill, code blocks.

Adding a new vendored family follows the identical `bun add --no-save`
→ extract → `npm uninstall` pattern — see `video-generator/CLAUDE.md`'s
"Typography house style" for the fuller rationale if this needs repeating
for a fourth family.

## Visual identity (carousel themes, and flow-gif's own theme system)

**`templates/carousel.mjs` had exactly one theme, "Blueprint," reused
verbatim by every single carousel post in this repo (the original example,
`speculative-decoding`, `rag-retrieval-quality`, `prompt-caching-economics`)
until direct feedback called this out explicitly**: "why always the same
damn design and format. you have so much at hand but still not using it at
all" — landing after the flow-GIF side had *already* grown a real
`THEMES`/`resolveTheme()` system (three presets, a `theme` manifest field,
an `extends` override — see below) in response to the exact same complaint
about *that* pipeline. The carousel side never got the same pressure until
this point, which is exactly how it ended up as the one place in this repo
still violating its own top-of-file "every post's media needs its own
identity" rule three posts in a row. Fixed by porting the same pattern
across: `CAROUSEL_THEMES` + an exported `resolveCarouselTheme()` in
`templates/carousel.mjs`, a `theme` field on the manifest schema (named
preset string, full inline object, or `{ extends, ...overrides }`, same
resolution semantics as the flow-GIF side — kept as a parallel
implementation rather than a shared import since the two theme shapes
don't overlap: carousel themes carry `cardStyle`/`iconStyle`/`bgTexture`/
`statValueStyle`, flow-GIF themes carry `nodeShape`/`connectorStyle`/etc.).

`blueprint` (default, unchanged pixel-for-pixel — regression-checked by
rebuilding all three existing posts and rendering them again) is a
translucent glass card, rounded corners, soft glow, gradient-clip stat
text, Space Grotesk. The second preset, `daylight`, is deliberately as far
from that register as the flow-GIF side's own "dossier" was from
"blueprint": light warm cream/paper background instead of dark, an opaque
*solid* card with a bold hard-cornered ink border instead of a rounded
glass one, flat solid-fill icon badges instead of soft gradient-glow ones,
a ruled-grid "graph paper" texture instead of a dot-grid + corner glow,
Poppins (already vendored — see "Typography") instead of Space Grotesk,
and a solid-ink stat value with a bold underline bar instead of a
gradient-clip glow. Real *component-language* differences, not a
recolored version of the same shapes — the identical discipline
`templates/flow-gif.mjs`'s own theme table already documents, now actually
applied to the carousel side too. Every CSS block that used to hardcode a
Blueprint-specific value (card border-radius, icon-badge shadow, stat-value
gradient, compare-bar fill, background texture) now branches on the
resolved theme's own `cardStyle`/`iconStyle`/`bgTexture`/`statValueStyle`
flags instead.

**Mermaid diagrams don't inherit page CSS** (still true, see below) — each
carousel theme now carries its own `mermaidVariables` object,
piped through `scripts/build.mjs`'s `hydrateSlide()` into
`scripts/mermaid.mjs::renderMermaid()`'s `themeVariables` param (itself
newly overridable — it used to hardcode the Blueprint palette
unconditionally). A `daylight`-themed post with a Mermaid diagram slide
now actually renders that diagram in the matching light/ink palette
instead of staying Blueprint-teal regardless of the rest of the slide.
D2 diagrams are **not** wired into this yet — D2 theming stays per-slide
(`d2ThemeId`) as before; unifying it with the carousel theme system is a
real gap, not an oversight, left for a follow-up.

**Gotcha: the grid-texture background line reused the same bold ink color
as the card borders, and wherever a line happened to fall inside a
headline letter's own counter/gap, it read as a stray mark cutting through
the glyph.** A headline's own text determines where it wraps, so this
isn't something a fixed grid offset can dodge — caught only by rendering
the actual `daylight`-themed hook slide and looking (a vertical grid line
crossed directly through the word "single" in "every single call."), not
by reading the CSS. Fixed with a dedicated, much softer `gridLineColor`
per theme, separate from the bold `--border` used for card outlines — the
same "check a shared color against every surface it touches, not just the
first one it was designed against" lesson this file already documents for
the flow-GIF dossier theme's connector color.

**Gotcha: the stat-comparison bar's non-highlighted fill was a hardcoded
cool blue-gray (`rgba(147,161,187,...)`) regardless of theme** — invisible
as a problem against Blueprint's own navy/teal palette (close enough in
hue to read as intentional), but visibly off-palette against Daylight's
warm cream/coral one. Fixed by deriving it from the theme's own `--muted`
custom property via `color-mix(in srgb, var(--muted) 55%, transparent)`
instead of a fixed rgba literal — safe to rely on since this repo's render
path is always headless Chromium (see "Core render contract"), which
supports `color-mix()`.

**A third carousel theme, `terminal`, was added after picking `blueprint`
— the original, most-reused preset — for the very next post right after
this whole theme system was built specifically because of the "why always
the same damn design" complaint.** Direct follow-up feedback: "something
is wrong with you... you again went back to that same style and format."
The mistake wasn't really the color choice — it was building a system
that only ever varied two booleans (`isGlass`/`isFlatIcon`) and assuming a
third *value* on those same two flags would count as a new identity. It
wouldn't have. `terminal` is a genuinely different component language,
not a third color on the same two shapes: monospace display type used
for **headlines**, not just the eyebrow every other theme already sets in
mono (`displayFont: 'JetBrains Mono'`, added to `DISPLAY_FONT_WEIGHTS`);
bracket-cornered "reticle" frames on cards and icon badges
(`cardStyle`/`iconStyle: 'terminal'`/`'bracket'` — open-corner `::before`/
`::after` pseudo-elements, same "an open silhouette reads as a different
shape, a closed rectangle with a new border color doesn't" lesson
`templates/flow-gif.mjs`'s `folderTabPath()` gotcha already documents,
ported to 2D CSS instead of an SVG path) instead of a rounded-glass or
solid-ink rectangle; a CRT scanline background (`bgTexture: 'scanlines'`)
instead of dots or a ruled grid; and a literal terminal-prompt stat value
(`statValueStyle: 'terminal-prompt'` — `> 49 Days_`, a `::before`/`::after`
prompt-prefix and cursor-block, not a gradient or an underline) instead of
a hero number. The eyebrow gets a `$ ` prefix and list-index badges get
`[01]` brackets for the same reason, both cheap `::before`/`::after`
additions once the bracket motif existed. Picked for an AI-agent-
architecture post specifically because it reads as a spec sheet / command
output, not a costume — the same "fits the topic, isn't a gimmick" bar
`templates/flow-gif.mjs`'s own theme choices are held to.

**The diagram slide for that same post was also switched from the
default `mermaid` engine to `d2`** (sketch mode) — not for the theme
system's sake, but because every carousel post up to that point had used
Mermaid's straight, clean boxes regardless of topic or theme, which is
the identical "same visual language every time" problem one level down
from color. D2's hand-drawn wobble is a real, different diagram language,
not a recolor of the same tree. Its own `d2ThemeId` (unrelated to the
carousel `theme` system — see "D2 diagrams are **not** wired into this
yet" above) doesn't match the terminal green palette, and rendering
confirmed it reads as a distinct purple-toned panel inside the green
terminal frame rather than a clash — closer to "a log viewer with its own
syntax highlighting" than a mismatch, but this is exactly the kind of
call that has to be checked by rendering and looking, not assumed either
way from the CSS.

**Still not enough — direct follow-up feedback on the `terminal` theme
itself: "still bullshit. just changing color scheme you cannot call it a
unique style of asset... media assets need to be unique to grab viewers'
attention."** Correct, and it applies one level deeper than theme: every
carousel slide type (`hook`, `list`, `stat`, `cta`...) uses the exact same
single-column composition — icon, then heading, then body, centered —
regardless of theme. A different card border and a different font on that
same skeleton is still the same skeleton. This is the identical "palette
on the same skeleton is not enough" problem this file's own opening
section already names for layout, and the identical fix flow-GIF already
made with `layout: 'zigzag'` — a real compositional alternative, not a
reskin — just never carried over to the carousel side until now.

Fix: **`versus`, a new slide type** (`manifest-schema.mjs`'s `versusSlide`,
`templates/carousel.mjs`'s `renderVersus()`/`.versus-*` CSS), not a new
theme. Two labeled columns split by a vertical divider and a center badge
— genuinely different geometry (split content vs. one centered column),
used only where the content is actually two-sided (a head-to-head
comparison post, e.g. `grok-bot-vs-openai-dots.json`'s "Where They
Actually Differ" slide, converted from a `list` once it was clear every
item already split cleanly along vendor lines). **Don't reach for `versus`
on content that isn't genuinely two-sided** — forcing a split where
there's nothing to split is the same "creative for its own sake" mistake
in the other direction, and the schema comment says so explicitly.

**Gotcha: the VS badge, positioned at the vertical center of the column's
full `flex: 1` height, silently clipped real body text.** `flex: 1` makes
`.versus-wrap` fill all the remaining slide height regardless of how much
actual text is in either column, so `top: 50%` landed wherever that
midpoint fell relative to the (much shorter) rendered content — here,
mid-word in the left column's second paragraph, invisibly, because the
badge's opaque background just painted over the text rather than erroring.
Caught only by rendering and looking, the same as every other layout
gotcha in this file. **First fix attempt was also wrong**: a guessed fixed
`top: 80px` offset moved the collision instead of removing it — it landed
on the icon badges and labels instead of the item text. The working fix
computes the offset from the actual CSS around it instead of eyeballing a
number: `.versus-col`'s own `padding-top` (12px) + half of
`.icon-badge-sm`'s height (56px / 2 = 28px) = 40px, the icon row's true
vertical center, which is also where both icons already sit (each
column's icon aligns to its own divider-side edge via
`align-items: flex-end`/`flex-start`) — so the badge only ever shares
their row, never the label or item text further down. **General lesson,
third time this exact class of bug has hit this file: a number that
"looks about right" and a number that's actually computed from the
surrounding layout are not the same fix, and only one of them survives
the next post's different text length.**

**Adding a fourth carousel theme**: add an entry to `CAROUSEL_THEMES`
(`colors` + `sceneBg` + `displayFont` + `cardStyle` + `iconStyle` +
`bgTexture` + `gridLineColor?` + `statValueStyle` + `mermaidVariables`) in
`templates/carousel.mjs`, or hand a full custom object (optionally
`{ extends: '<preset>', ... }`) straight to a manifest's `theme` field for
a one-off post — same "reference point to remix, not a closed set" rule
the flow-GIF `THEMES` object already documents. **A new value bolted onto
an existing boolean flag (a third color where the CSS still only branches
`isX ? a : b`) is not a new theme** — if the new preset doesn't need at
least one genuinely new CSS flag/branch (a new shape, a new texture
mechanism, a new type treatment), it's a recolor, which is the exact
regression documented above. Vendor any new font weight it needs (see
"Typography"), and **render every slide type at least once and look**
before calling a new theme done — the stat/compare/list/diagram slide
types each have their own theme-conditional CSS branch that a hook/cta-
only smoke test won't exercise. **Also vary the diagram engine
(`mermaid` vs `d2`) per post based on what actually fits, not out of
habit** — reusing Mermaid on every post is the same regression as reusing
`blueprint`, just one layer down.

**`templates/flow-gif.mjs`'s `theme` field takes either a preset name or a
full inline theme object** — prompted by two rounds of direct feedback,
not one: first that reusing the exact same teal/rounded-card look for
every flow-GIF post ("why following the same template... be creative")
was the mistake `video-generator`'s CLAUDE.md warns against under "every
reel needs its own visual identity" (a post-specific *palette* isn't
enough if the *component language* — card shape, texture metaphor,
display font — stays identical); then, after a second "Audit" preset
theme, that the underlying *layout* (a straight node column plus one
fixed side panel) was **also** identical across every post regardless of
theme, which a palette/shape system can't fix on its own — see "Layout"
below for that half of the fix. `THEMES` (three named presets:
`blueprint`, `audit`, `dossier`) are reference points to remix, not a
closed set to keep reusing verbatim on an unrelated post's topic — the
normal path for an actual new post is a full theme object inline in that
post's own manifest, merged over `blueprint`'s defaults, so it only has to
specify what it changes:

| | Blueprint (default) | Audit | Dossier |
| --- | --- | --- | --- |
| Palette | Teal/blue on navy-slate | Amber/violet on near-black | Ink-red on cream paper |
| Node shape | Rounded-rect (`<rect rx>`) | Clip-corner (`clipCornerPath()`, an SVG-path version of the CSS `clip-path` polygon `video-generator`'s loop-method reel uses) | An actual manila-folder silhouette (`folderTabPath()`, dashed border) — a real *silhouette*, not a rectangle with a different trim, after feedback that clip-corner/dashed-rect variants still all read as "a rectangle" |
| Step badge | Filled circle | Regular hexagon (`hexPoints()`) | Diamond (`diamondPoints()`) — a wax-seal/official-mark read instead of a rubber-stamp circle |
| Background | Static dot-grid | Fine grid + rotating radar-sweep (`@keyframes sweep`) | A vignette (`bgTexture: 'paper'`) — see the GIF-size gotcha below for why it's *just* a vignette |
| Connector | Straight, `--border` color | Straight, `--border` color | Hand-wobbled (`connectorStyle: 'wobble'`, an SVG `feTurbulence`/`feDisplacementMap` filter) in a dedicated `connectorColor`, not `--border` (see the contrast gotcha below) |
| Dot arrival | Soft glow pulse (`dotStyle: 'glow'`) | Same | A scale "thwack" + border darken (`dotStyle: 'ink'`), no glow — a stamp doesn't emit light |
| Display font | Space Grotesk 700 | Poppins 800 | JetBrains Mono 600 — a typewriter read |
| Extras | — | — | A rotated `stamp: {text, rotate}` watermark across the scene |

`DISPLAY_FONT_WEIGHTS` maps each `displayFont` to the one weight this repo
actually vendors for it (see "Typography") — `h1`'s `font-weight` reads
from that map rather than a hardcoded ternary, so a new display font
doesn't silently request a synthetic weight out of a single-weight
`@font-face`. Every node/branch glow color that used to be a hardcoded
Blueprint-teal `rgba(63, 208, 201, …)` literal is derived from the active
theme's own accent via `hexToRgbTriplet()`.

**Gotcha: a color with enough contrast against a node's own `--card` fill
can still be nearly invisible directly on the scene background.** Dossier's
connector line uses `--border` by default (same as every node/panel
border) and was originally left that way — on a node card's brighter,
more opaque `--card` fill it read fine, but the connector itself sits
directly on the raw, already-textured scene background, where the exact
same color at the exact same opacity was nearly imperceptible. Confirmed
by sampling actual pixel values at the connector's own coordinates (a
faint but real ~40-unit brightness dip, invisible to the eye at normal
zoom against the paper hatch, not a rendering bug), not by eyeballing a
screenshot once. Fixed with a theme-overridable `connectorColor` separate
from `--border`, so a fix here doesn't change every other border in the
theme. **General lesson: check a shared color against every surface it
actually touches, not just the first one it was designed against.**

**Gotcha: a fine repeating-gradient "paper grain" texture produced a
genuinely enormous GIF — 63MB at 30fps, still 38MB at 18fps** — a
near-continuous few-pixels-apart pattern across the whole 1080×1350 canvas
defeats a palette-based GIF encoder's per-frame compression so badly that
dropping the frame rate barely moved the file size at all, which is
itself the tell that frame count isn't the size driver in a case like
this. The same "flat, low-contrast regions compress better" lesson this
file already documents for GIF's frame-delay/fps tradeoff applies far
more severely to background *texture* — isolated by re-rendering the same
scene with the hatch layer stripped out (12.8MB) versus left in at even a
widened 40px repeat (23MB): the hatch alone cost ~10MB. Dossier's paper
texture is now a plain radial-gradient vignette, no repeating hatch at
all — still reads as "aged paper" at this resolution, and the realism
wasn't worth 10MB on a file that has to actually upload somewhere.
**Check a themed background's real GIF file size before calling a texture
done, the same way `--fps` already gets checked — a texture that looks
fine as a single PNG can still be a compression disaster as a GIF.**

**Gotcha: "a rectangle with a different border/corner treatment" doesn't
read as a different component shape, no matter how many border variants
you make.** Clip-corner panels and a dashed-border rounded-rect were both
still, fundamentally, a rectangle — direct feedback ("still not happy
with component shapes") after both. `nodeShape: 'folder-tab'`
(`folderTabPath()`) is a real change of *silhouette*: a rectangular body
with a trapezoidal tab standing off its own top-left corner, the way a
physical case-file folder looks — the outline itself is no longer a
rectangle, not just a rectangle with different corners. Pushing an
icon/logo down by a fixed `contentYOffset` (14px) was needed alongside
it — the icon badge's own top-left corner otherwise pokes through the
tab's short diagonal edge, since the tab occupies real space at the top
of the shape rather than just decorating an existing rectangle's border.
**When a "different shape" request keeps coming back, check whether every
attempt so far actually changed the outline, or just the outline's
trim** — those are not the same fix.

**Adding a fourth theme**: add an entry to the `THEMES` object (`colors` +
`sceneBg` + `displayFont` + `nodeShape` + `nodeBorderStyle` +
`stepBadgeShape` + `stepBadgeTextColor?` + `bgTexture` + `connectorStyle`
+ `connectorColor?` + `dotStyle` + `stamp?`) — or skip `THEMES` entirely
and hand a full custom object straight to a manifest's `theme` field,
which is the expected path for a one-off post rather than a new named
preset. Vendor any new font weight it needs (see "Typography"), and
**render the real GIF and check its file size** before considering a new
background texture finished.

**Overriding one field of a named preset without forking the whole
preset**: `theme` also accepts `{ extends: '<preset name>', ...overrides }`
— `buildFlowGifHtml()` resolves `extends` to that preset, then
shallow-merges `overrides` on top of it (same one-level-deeper merge for
`colors` the plain named/custom paths already got). This exists because
`dossier`'s own reference stamp (`{ text: 'CONFIDENTIAL', rotate: -18 }`,
baked into the preset to sell its "redacted case-file" read) isn't
appropriate on every dossier-themed post — `agent-governance.flow.json`
dropped it with `theme: { extends: 'dossier', stamp: null }` rather than
copying all ten of dossier's other fields into the manifest just to
change one. Any preset field can be overridden the same way; `stamp: null`
specifically is read as "no stamp" by the template (`${T.stamp ? ... :
''}`), not "use the preset's own default."

## Layout ("column", and flow-gif's "zigzag" layout)

A flow-GIF manifest's `layout` field (default `'column'`) controls the
node *arrangement*, independently of `theme` (which controls color/shape/
texture) — the two are orthogonal, checked by construction: `isZigzag`
only ever branches connector geometry and the side-content renderer,
never anything theme-related.

- **`'column'`** (default, unchanged) — every node at the same `x`,
  connected by straight vertical edges, with a single "Live Status" panel
  in the fixed dead space beside the column (one row per node, ticking on
  as the dot arrives, plus any `chips` nested under the node at
  `chipsAt`).
- **`'zigzag'`** — added alongside the "dossier" theme after feedback that
  every flow-GIF post used the same column-plus-side-panel *shape*
  regardless of theme, and real research into flowchart/infographic
  layout conventions (S-curve/zigzag connectors between alternating-side
  nodes are a standard technique for using a portrait canvas's full width
  instead of cramping a linear sequence into one column). Nodes alternate
  between two hand-placed lanes (this file still never computes a layout
  for you — see `content/agent-governance.flow.json`'s own lane-math
  comment for the worked coordinates); connectors are smooth S-curve cubic
  beziers (`bezierPath()`) instead of straight lines; each node's optional
  `note` (a short annotation string) plus any `chips` at that node render
  inline in the lane it ISN'T occupying that row — the same lane its
  neighbor two rows down will later reuse — instead of one centralized
  panel, since a fixed side column has nothing to be "beside" once nodes
  stop sharing one `x`.

**`bezierPath(x1,y1,x2,y2)`'s control-point choice is load-bearing, not
arbitrary**: both control points sit at the shared vertical midpoint but
at each endpoint's own `x`, which makes the curve leave the source and
arrive at the target moving perfectly *vertically* — that's what lets the
existing fixed-downward arrowhead polygon keep working completely
unmodified even though the curve bends sideways in the middle. When
`x1 === x2` (every `'column'`-layout connector), the two control points
collapse onto the same vertical line as the endpoints, degenerating to a
visually identical straight line — confirmed by re-rendering
`jev-claude-code.flow.json` (still `layout: 'column'`, unaffected by any
of this) and diffing a paused-at-`t=0` screenshot against its pre-zigzag
version pixel-for-pixel identical, not just assumed from the geometry.

**Gotcha: a 2-line title collided with the first zigzag node's own
annotation.** An earlier draft started the first node at `y=230`,
matching the old column layout's own first-row `y` — but that number was
tuned for a title that happened to wrap to exactly two lines at a length
that cleared it narrowly; a slightly different (still two-line) title in
the zigzag post pushed its own second line down into where that row's
annotation text renders. Caught only by rendering and looking, not by
reading the coordinates (see "Verify visually" below) — the same class of
bug as this file's earlier node-height/spacing gotcha, just triggered by
title length instead of card height. Fixed by starting the first row 50px
lower (`y=280`) for real clearance rather than the minimum that happened
to just barely work.

**The branch box's connector reuses the same fixed-downward-arrow trick**
as the main path in `'zigzag'` layout specifically by leaving from the
source node's *bottom* edge (matching every other connector in a zigzag
scene) rather than its *right* edge (the `'column'`-layout default, which
made sense when the branch always sat off to the column's side) — a small
`isZigzag` branch inside the existing branch-arrow trig code, which
already handled arbitrary angles and needed no other changes.

## Diagram engines

A `diagram` slide's `engine` field picks between two genuinely distinct
diagram engines — not a hypothetical extension point, both implemented and
render-verified:

- **`mermaid`** (default, `scripts/mermaid.mjs`) — requires the `mermaid`
  field (source in Mermaid's own syntax). Runs inside a throwaway
  Playwright page, same as always.
- **`d2`** (`scripts/d2.mjs`) — requires the `d2` field (source in
  [D2](https://d2lang.com) syntax) instead of `mermaid`; optional
  `d2ThemeId` overrides the default theme (`200`, "Dark Mauve" — the
  closest built-in D2 theme to this repo's palette; D2's own default is a
  *white* canvas, which would sit as a bright rectangle inside a
  near-black slide otherwise). Runs its compiler/renderer as WASM
  **directly in Node — no browser at all**, unlike Mermaid. Always
  rendered with `sketch: true`: that's the entire reason to reach for a
  second engine instead of just using Mermaid's own `look` field (below) —
  D2's sketch mode reliably wobbles every stroke, verified on a
  multi-node cyclic flowchart, not just simple cases.

**Both engines produce a plain `<svg>` string** consumed identically by
`renderDiagram()` in `templates/carousel.mjs` — no template changes were
needed to add D2; it drops into the same `.diagram-wrap.card` Mermaid
already used, the same way the code slide's `pre.shiki` sits at its own
tone inside the outer card.

**Gotcha: a D2 diagram taller than its card silently overflowed straight
off the bottom of the slide — and the real cause was a flexbox bug in
`templates/carousel.mjs`, not anything about D2 or `.diagram-wrap svg`'s
CSS.** First real content manifest to push a D2 diagram through the full
`build.mjs`/`render.mjs` pipeline (`content/rag-retrieval-quality.json`'s
5-node vertical retrieval pipeline) — every previous D2 verification in
this file was Mermaid-diagram-shaped in spirit (wide, short aspect ratio)
and never actually exercised a diagram taller than its card. Three
distinct things had to be fixed, found in this order, each only by
rendering and looking (a Playwright `getBoundingClientRect()` measurement
pass on `.diagram-wrap`/the `svg`, the same debugging technique this file
already used for the flow-GIF's own dot-position gotchas):

1. **The real bug: `.diagram-wrap`'s `flex: 1` never actually shrank it.**
   A flex item's default `min-height` is `auto`, which lets it grow to its
   content's own intrinsic min-content size *regardless* of `flex: 1` —
   confirmed by measuring `.diagram-wrap`'s computed height at **2256px**
   inside a 1350px-tall slide, with `max-height` computing to `none`
   because it had no bounded ancestor height to resolve a percentage
   against in the first place. This is why `max-height: 100%` on the
   child `svg` (already present) did nothing: the box it was supposed to
   be constrained by was itself unconstrained. Mermaid diagrams never hit
   this only because they're all wide/short enough that their intrinsic
   content height already happens to fit — the bug was latent, not
   engine-specific. **Fix**: `min-height: 0; overflow: hidden;` added to
   `.diagram-wrap` — the standard, well-known fix for this exact flexbox
   trap, letting `flex: 1` actually win.
2. Patching only the SVG's own `width`/`height` attributes (mirroring
   Mermaid's own `width="100%"` on its root `<svg>`, since D2's root
   `<svg>` ships with neither) turned out to be unnecessary for the
   actual fix and briefly counterproductive: setting `height="100%"` on
   an SVG inside a container whose height depends circularly on that same
   SVG's intrinsic size (bug 1, above, uncorrected) simply grows both in
   lockstep. Once bug 1 was fixed, D2's `<svg>` still had no `width`
   attribute like Mermaid's does, so `width="100%"` is kept — parity
   with Mermaid, not the overflow fix itself.
3. **A second, purely cosmetic bug, only visible after fixing #1**: D2
   hardcodes `preserveAspectRatio="xMinYMin meet"` on its root `<svg>`.
   Once the diagram actually scaled down to fit the card, a diagram
   narrower than the card (a short vertical chain, once it no longer
   overflowed) sat flush against the top-left corner with a large empty
   gap on the right, instead of centered — "meet" scales-to-fit correctly
   but "xMin YMin" anchors the result to the box's minimum corner, not
   its center. Patched to `xMidYMid meet` in the same regex pass.

`scripts/d2.mjs`'s `renderD2()` now does both SVG-tag patches (`width`
attr + `preserveAspectRatio`) via two chained `.replace()` calls, same
"patch only the specific attribute in place, never discard the rest of
the tag" pattern `templates/flow-gif.mjs`'s `sizedIcon()` already uses —
watch for the D2 output's leading `<?xml version="1.0" ...?>` declaration
if editing that regex: an anchored `/^<svg /` silently matches nothing
and looks like it worked (no error) while doing nothing, since D2's
`render()` return value starts with the XML declaration, not `<svg`
itself; drop the `^` anchor and let `.replace()`'s own single-match
default behavior find the first real `<svg` tag.

**D2-specific operational gotcha — this one matters, don't skip it if
touching `scripts/d2.mjs`**: the `D2` class has **no exposed
`dispose()`/`terminate()`/`close()` method** (confirmed against its
`.d.ts` — only `compile()` and `render()` exist). A script that creates a
`D2` instance and finishes all its real work will still **never exit on
its own** — confirmed by watching a finished process sit alive at ~0% CPU
indefinitely. `scripts/build.mjs`'s final `.finally()` therefore force-exits
with `process.exit(process.exitCode || 0)` after every other async
resource (the Mermaid/Playwright browser) is already closed — that call is
load-bearing, not defensive boilerplate; removing it reintroduces the hang
the moment any manifest uses `engine: "d2"`.

**Why not Excalidraw too — researched, deliberately deferred, not
forgotten**: the actual "in" hand-drawn diagram aesthetic right now, and
there's even an official bridge for it —
`@excalidraw/mermaid-to-excalidraw` parses ordinary Mermaid syntax into
Excalidraw's element format, then `@excalidraw/utils`' `exportToSvg`
renders it with Excalidraw's own (more polished, more consistent) sketchy
renderer. Confirmed technically reachable: `parseMermaidToExcalidraw`
throws `DOMPurify.addHook is not a function` when called from plain
Node — it genuinely needs a real DOM, so it would need the same
Playwright-page-injection pattern `scripts/mermaid.mjs` already uses, but
bundled first (it's ESM-only, no prebuilt browser/UMD bundle ships in the
package). That bundling step is exactly where this was deferred: ad hoc
`bun add --no-save` calls for this package and its siblings
repeatedly triggered npm's resolver into silently pruning *other* already-
installed packages in the same tree (esbuild and `@excalidraw/utils` both
vanished mid-session without any explicit uninstall) — a real
reproducibility risk for a repo whose whole premise is deterministic
builds. Worth finishing as a dedicated follow-up with its own careful,
from-scratch install rather than rushed in on top of that instability.

## Mermaid diagram rendering gotcha

**Hand-drawn `look` works reliably only on simple diagrams — verify
visually before trusting it on a real one.** `look: 'handDrawn'` (Mermaid's
own built-in rough.js-backed renderer, zero extra dependency) renders
correctly — visibly wobbly strokes, clear hachure fill — on small,
few-node test diagrams. On this repo's actual denser diagrams (6+ nodes,
a cycle, multi-line labels) it degrades: zooming into a rendered PNG shows
the hachure fill texture is still present but very faint, and the
characteristic wobbly stroke on box borders mostly doesn't apply — boxes
render with crisp, straight edges instead. This was **not** caught by
inspecting the generated SVG markup (searching for `"hachure"` in the
string is a dead end regardless of outcome — this Mermaid version's
rough.js integration doesn't use that literal string anywhere, on
either a working or degraded render, so a text search can't distinguish
them) — it was only visible by rendering a real slide and zooming into
the actual pixels, the same lesson as every other gotcha in this section.
**If a post wants a reliably wobbly, fully hand-drawn diagram, use the
`d2` engine instead** (above) — its sketch mode was verified wobbly on
the same multi-node diagram where Mermaid's `look: 'handDrawn'` degraded.
Keep `look: 'handDrawn'` for simple, few-node Mermaid diagrams only, where
it was actually confirmed to work.



`scripts/mermaid.mjs` intentionally does **not** set a custom
`themeVariables.fontFamily` or `fontSize`. Both were tried and caused
node-box text clipping ("User Promp[t]", "Embed Quer[y]") — Mermaid sizes
each node's box from a text measurement pass that didn't line up with the
font actually used for final rendering once either was overridden.
Diagrams render correctly at Mermaid's own default font metrics and are
then scaled up losslessly by the surrounding `<svg>`'s CSS
`max-width/max-height: 100%` in `.diagram-wrap` — scaling the whole SVG
post-layout sidesteps the measurement mismatch entirely. If this needs
revisiting, verify with a real screenshot (per "Verify visually" below),
not just by reading the generated SVG.

## Code slide line-length gotcha

`.code-card pre.shiki` sets `white-space: pre-wrap` and `overflow-wrap:
anywhere` — without it, a code line wider than the card (easily hit by a
real ~70-character Python line, e.g. a `for i, (draft_tok, q_i) in
enumerate(zip(...))` header) silently runs off the right edge of a static
image with no horizontal scroll to fall back on, since this isn't a
terminal. Found the same way as the Mermaid gotcha above: by rendering a
real slide and looking at the PNG, not by reading the generated HTML —
Shiki's output looked completely fine, the clipping only showed up in the
screenshot. Font size is `22px` (down from an earlier `26px`) for the same
reason from the other direction: wrapping alone isn't enough if the
wrapped result no longer fits vertically in the card — keep new code
snippets to roughly 12-14 short lines and favor short variable names
(`tok` not `draft_token`) so they read as a single line at this size
rather than wrapping, which is visually tidier than a wrapped line even
though wrapping is now a safe fallback either way.

## Output formats & when to use which

| Manifest → | `render.mjs --format=` | Use for |
| --- | --- | --- |
| all slides | `pdf` (default, combined with `png`) | LinkedIn "Document" post (the primary carousel format) |
| each slide | `png` (default, combined with `pdf`) | Image-carousel post, or pulling one slide as a standalone infographic/OG image |

`--scale=<n>` (default `2`) sets `deviceScaleFactor` for the PNG path —
`2` renders at 2160×2700 (crisp on retina feeds), `1` at native
1080×1350. The PDF path is vector/text where possible (Shiki spans,
native text) and doesn't need a scale flag — Mermaid diagrams are the one
raster-adjacent exception, but SVG stays sharp at any zoom.

## Git / workflow conventions

- `output/` is **committed**, per direct instruction: every post's actual
  media (carousel `.pdf`/`slide-NN.png`, or flow-GIF `flow-scene.html`/
  `flow.gif`), its purpose-built `cover.html`/`cover.png`, and its
  `caption.md`/`hashtags.md` (ready to paste into LinkedIn's composer) go
  into the repo alongside the manifest that produced them — not just
  `content/*.json` on its own. This reverses an earlier version of this
  rule, which treated `output/` as gitignored and fully
  reproducible-on-demand (still true technically — `build.mjs`/
  `build-flow-gif.mjs` + `render.mjs`/`gif.mjs`/`build-cover.mjs`
  regenerate it bit-for-bit from the same manifest and content, only the
  fonts/theme/timing that were live *at generation time* determine the
  exact bytes) — the reproducibility argument doesn't cover *finding*
  what was actually published without re-running the pipeline, which
  committing the output does. See "Every post ships the same level of
  production variation as video-generator" above for the full
  cover.png/caption.md/hashtags.md requirement and what's hand-written
  vs. script-generated. Every real post's `output/<slug>/` needs, at
  minimum, its rendered media, a `cover.png`, and a `caption.md` +
  `hashtags.md` pair — commit all of it together, not media without the
  caption/cover or vice versa. (This differs from the *previous*
  documented reasoning that drew a media-cost distinction with
  `video-generator`'s committed `.mp4`s — that distinction no longer
  applies now that this repo's own output is committed too, for the same
  "the record of what was published lives in the repo" reason, not a
  render-cost one.)
- Verify visually, don't just trust the generated markup: read a couple
  of the rendered `slide-NN.png` files back (or open the PDF) after every
  template/build change and actually look — text clipping, low-contrast
  diagram nodes, and safe-zone overlap are the kinds of bugs that only
  show up in the rendered output, not the HTML source (see the Mermaid
  gotcha above, found exactly this way).
- Every new manifest gets its own `slug` (and therefore its own
  `output/<slug>/` folder) — don't overwrite a previous post's manifest
  in place if it's a genuinely different post; copy
  `content/example-rag-guardrails.json` as a starting point instead.
