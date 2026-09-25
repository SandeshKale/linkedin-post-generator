# CLAUDE.md

Guidance for Claude (or any agent) working in this repository. This repo
generates LinkedIn PDF Carousel (Document post) and slide-image content —
1080×1350 (4:5), pixel-perfect, typography-heavy — from a JSON slide
manifest, rendered deterministically with headless Chromium. It is the
document-pipeline sibling of `SandeshKale/video-generator`: same
"decouple rendering from anything non-deterministic" philosophy, adapted
from *time* (`window.__seek(t)`) to *pagination* (`page.pdf()` + CSS
`@page`). Read this before creating or editing a carousel.

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

**Nodes carry real vendored art, not just labeled boxes** — a node's
`icon` (Tabler, `scripts/icons.mjs::icon()`) plus at most one of `brand`
(a flat single-color mark, `::brandIcon()`, `assets/icons/simple-icons/
*.svg`, CC0) or `logo` (a real full-color product logo, `::logoIcon()`,
`assets/logos/gilbarbara/*.svg`, CC0 — for developer tools simple-icons
doesn't carry, e.g. Bun, Playwright) render as actual nested `<svg>`
content inside the diagram's own `<svg>`, not decoration bolted on after
the fact. `brand`/`logo` get forced dim (`opacity`) so they read as a
small corner credit, not competing with the node's own primary icon.

Use `brand`/`logo` only where it's literally true of that specific node —
never generic flair. This post's own flow manifest
(`content/jev-claude-code.flow.json`) is the worked example: the
`quality-gate.mjs`/`build.mjs` nodes carry the real Bun logo because this
repo's scripts genuinely run as `bun scripts/*.mjs` (see "Runtime &
package manager"), and `render.mjs` carries the real Playwright logo
because that stage's entire job is driving Playwright/Chromium — a
generic Node.js mark on `render.mjs` would've been *less* accurate, not
just less specific, once the repo migrated off plain `node`. A
`brandBadge` in the scene header works the same way (the real Anthropic
mark on a post that's literally about Claude Code, not a generic robot
icon).

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
│   └── gif.mjs             Animated scene HTML → looping .gif, via deterministic Web Animations scrubbing
├── templates/
│   ├── carousel.mjs        buildHtml({title, author, handle, slides}) — CSS + per-slide-type markup
│   └── flow-gif.mjs        buildFlowGifHtml({nodes, edges, ...}) — animated flow-diagram scene markup
├── content/
│   ├── example-rag-guardrails.json   Sample manifest (all 6 slide types, no icons — tests the no-icon path)
│   ├── speculative-decoding.json     Sample manifest using icons + a stat "compare" bar chart
│   └── jev-claude-code.flow.json     Sample animated-GIF flow manifest — see "Animated GIF posts"
├── assets/
│   ├── fonts/              Vendored webfonts (.woff2, OFL) — see "Typography"
│   ├── icons/              Vendored icon sets incl. tabler/ (.svg) — see "Slide manifest schema"
│   ├── illustrations/      humaaans-react, flowbite, bioicons — see "Asset library"
│   ├── logos/, photos/     Brand marks, stock photos — see "Asset library" (licensing caveats)
│   ├── animations/         From video-generator; NOT directly usable here — see "Asset library"
│   └── VIDEO_GENERATOR_ATTRIBUTION.md   Per-source license table for the merged-in set
├── output/                 Generated, gitignored — carousel.html/.pdf, slide-NN.png, caption.md, alt-text.md per slug
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

## Visual identity ("Blueprint" theme)

The current (and, for now, only) theme lives entirely as CSS custom
properties in `templates/carousel.mjs::baseStyles()` (`--bg`, `--accent`,
`--accent-2`, `--text`, `--muted`, `--border`, `--card`) plus the matching
`themeVariables` block in `scripts/mermaid.mjs::renderMermaid()` (Mermaid
diagrams don't inherit page CSS — its palette has to be kept in sync by
hand across both files). Deep slate background, static dot-grid texture,
teal/blue accent gradient, soft top-right glow. If a future post needs a
visibly distinct identity (different topic, different sub-brand), prefer
adding a second theme (a `theme` field on the manifest selecting a second
`themeVariables` object + a second CSS custom-property set) over mutating
the existing one — don't silently reskin "Blueprint" out from under posts
that already reference it.

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

- `output/` is gitignored — it's fully reproducible from `content/*.json`
  via `build.mjs` + `render.mjs`. Don't commit generated PDFs/PNGs;
  regenerate them instead. (This differs from `video-generator`, which
  *does* commit rendered `.mp4`s — a 60s video render is expensive enough
  to be worth keeping as a checked-in artifact; a carousel PDF is a
  few-second regenerate.)
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
