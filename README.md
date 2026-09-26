# linkedin-post-generator

**Deterministic LinkedIn content, generated from a JSON manifest, rendered
pixel-for-pixel with headless Chromium — no design tool, no manual export,
no drift between runs.**

Two sibling pipelines live here:

| Pipeline | Input | Output | Use for |
| --- | --- | --- | --- |
| **Carousel** | a slide manifest (`content/*.json`) | `carousel.pdf` + `slide-NN.png` | LinkedIn Document posts, image carousels, one-off infographics |
| **Flow GIF** | a flow-diagram manifest (`content/*.flow.json`) | `flow.gif` | A single animated (or LinkedIn-flattened-to-static, see below) process diagram post |

Both are *document* pipelines, not video: every pixel is resolved before
Chromium ever opens the page, so the same manifest always produces the same
output, byte for byte. This is the document-generation sibling of
[`video-generator`](https://github.com/SandeshKale/video-generator) — same
"decouple rendering from anything non-deterministic" philosophy, just
applied to *pagination* (`page.pdf()` + CSS `@page`) instead of *time*
(`window.__seek(t)`).

---

## Table of contents

- [Quick start](#quick-start)
- [The carousel pipeline](#the-carousel-pipeline)
  - [Slide types](#slide-types)
  - [Caption & hashtags](#caption--hashtags)
  - [Alt text](#alt-text)
  - [Diagram engines](#diagram-engines)
- [The flow-GIF pipeline](#the-flow-gif-pipeline)
- [Content quality gate (Jev)](#content-quality-gate-jev)
- [Visual identity — the "Blueprint" theme](#visual-identity--the-blueprint-theme)
- [Vendored assets](#vendored-assets)
- [Repo layout](#repo-layout)
- [Design principles this repo enforces](#design-principles-this-repo-enforces)
- [Why bun](#why-bun)
- [Skills](#skills)
- [Contributing a new post](#contributing-a-new-post)

---

## Quick start

```bash
bun install
bunx playwright install chromium   # first run only, if not already cached

# 1. (optional) content-quality gate — see below, needs JEV_API_KEY
bun scripts/quality-gate.mjs content/example-rag-guardrails.json

# 2. manifest → self-contained HTML
bun scripts/build.mjs content/example-rag-guardrails.json

# 3. HTML → PDF + per-slide PNGs
bun scripts/render.mjs output/rag-guardrails/carousel.html
```

Output lands in `output/rag-guardrails/`:

- **`carousel.pdf`** — the multi-page LinkedIn **Document** post, upload as-is.
- **`slide-01.png` … `slide-06.png`** — the same slides as standalone
  images, for an image-carousel post, a link-preview image, or a one-off
  infographic/OG image.
- **`caption.md`** — ready to paste into LinkedIn's post composer, if the
  manifest has a `caption` field.
- **`alt-text.md`** — per-slide alt text, if the manifest has any `alt` fields.

## The carousel pipeline

```
content/<slug>.json
        │  bun scripts/build.mjs content/<slug>.json
        ▼
output/<slug>/carousel.html          (self-contained, no runtime JS)
        │  bun scripts/render.mjs output/<slug>/carousel.html
        ▼
output/<slug>/carousel.pdf + slide-01.png … slide-NN.png
```

**`scripts/build.mjs`** validates the manifest against a Zod schema
(`scripts/manifest-schema.mjs`) — an unknown slide type, a missing
required field, or a non-kebab-case `slug` fails immediately with every
violation listed, not a mysterious `undefined` three layers down. It then
*hydrates* the manifest: Mermaid/D2 diagram source is pre-rendered to a
static `<svg>` string (`scripts/mermaid.mjs` / `scripts/d2.mjs`) and code
blocks are pre-highlighted to Shiki HTML (`scripts/shiki.mjs`) — all the
"hard," non-deterministic work happens *here*, so the emitted
`carousel.html` needs nothing but a font-load wait to render correctly.

**`scripts/render.mjs`** opens that static HTML in headless Chromium and
never evaluates page JS beyond `document.fonts.ready`. It exports two ways:

```bash
bun scripts/render.mjs output/<slug>/carousel.html [--scale=2] [--format=pdf,png]
```

- `page.pdf({ preferCSSPageSize: true })` — respects each slide's `@page`
  CSS box (`1080×1350`), producing the combined carousel PDF for a
  LinkedIn Document post.
- `elementHandle.screenshot()` per `.slide` — standalone PNGs, at
  `--scale=2` (2160×2700, retina-crisp, default) or `--scale=1` (native
  1080×1350).

### Slide types

Six slide types ship out of the box, each with its own renderer in
`templates/carousel.mjs`'s `RENDERERS` map:

| Type | Purpose | Key fields |
| --- | --- | --- |
| `hook` | Opening slide | `icon?`, `eyebrow?`, `headline`, `sub?` |
| `diagram` | A Mermaid or D2 diagram | `icon?`, `heading?`, `engine?` (`mermaid`\|`d2`), plus engine-specific source field |
| `code` | Syntax-highlighted code block | `heading?`, `lang`, `code`, `shikiTheme?` |
| `stat` | A hero number, optionally with a before/after bar chart | `icon?`, `value`, `label`, `context?`, `compare?` |
| `list` | Numbered or icon-badged list | `heading?`, `items[]` |
| `cta` | Closing slide | `icon?`, `headline`, `sub?` |

Every slide is optionally `icon`-badged from the vendored Tabler set
(`assets/icons/tabler/*.svg`) — validated at manifest-parse time against
the actual files on disk, so a typo'd icon name fails fast with the full
list of valid names instead of silently rendering nothing.

See `CLAUDE.md`'s **"Slide manifest schema"** for the complete field
reference, including `list`'s mixed plain-string/icon-badge item forms and
`stat`'s `compare` bar-chart semantics.

### Caption & hashtags

A manifest's `caption` and `hashtags` fields are never rendered on any
slide — they exist so a post's full text lives in the same
single-source-of-truth JSON as its media, and are written out to
`output/<slug>/caption.md` (caption, blank line, space-joined `#tags`)
ready to paste straight into LinkedIn's composer.

Caption structure is calibrated against real high-performing posts, not
guessed — see `CLAUDE.md`'s **"Slide manifest schema"** section for the
worked example and the reasoning (a myth-correction hook, an explicit
"save this" trigger, emoji-sectioned scannable paragraphs — the pattern
that separated a 2,830-like post from a 213-like one in the same account's
history).

### Alt text

Every slide type accepts an optional `alt` field (capped at 1,000
characters — LinkedIn's own image alt-text limit, enforced at
validation time). Alt text is **hand-written, never auto-derived** from
the slide's other fields — a generated "headline: X, icon: bolt" string
tells a screen-reader user nothing a sighted user actually sees. If any
slide has `alt`, `build.mjs` writes `output/<slug>/alt-text.md`, one
numbered block per slide (a slide without `alt` gets an explicit
placeholder rather than being silently skipped).

### Diagram engines

A `diagram` slide picks its engine with `engine: 'mermaid' | 'd2'`:

- **Mermaid** (default) — `mermaid` source field, runs in a throwaway
  Playwright page, supports `mermaidTheme?` and `look: 'handDrawn'` (rough.js
  sketch mode — reliable on small diagrams only, see `CLAUDE.md`'s gotcha).
- **D2** — `d2` source field, runs as **WASM directly in Node, no browser**,
  always rendered with `sketch: true` for a reliably wobbly hand-drawn look
  even on dense, cyclic diagrams where Mermaid's own `handDrawn` mode
  degrades. Optional `d2ThemeId?` (default `200`, "Dark Mauve").

Both engines emit a plain `<svg>` string consumed identically by
`templates/carousel.mjs` — no template changes needed to add a third
engine later.

## The flow-GIF pipeline

For the rare post that's better as one animated flow diagram than a
multi-slide carousel — a reverse-engineered "gold standard" format for
process/pipeline explainer posts:

```
content/<slug>.flow.json
        │  bun scripts/build-flow-gif.mjs content/<slug>.flow.json
        ▼
output/<slug>/flow-scene.html        (CSS @keyframes + Web Animations API)
        │  bun scripts/gif.mjs output/<slug>/flow-scene.html output/<slug>/flow.gif [--duration=4000] [--fps=20]
        ▼
output/<slug>/flow.gif
```

This is a **deliberately separate sibling pipeline**, not a mode of
`render.mjs` — a genuinely animated scene is the literal opposite of the
"everything static before Chromium opens it" contract the carousel
pipeline enforces. Determinism here comes from a different trick: every
CSS `Animation` on the page is paused once via the Web Animations API,
then scrubbed to each sample instant with `animation.currentTime` before a
screenshot — never real wall-clock playback, which would make the output
non-reproducible.

Scenes show a labeled pipeline as icon/logo-badged step nodes, connected
by real edge-to-edge connectors (not one line drawn through every node's
body) with a traveling, eased "packet" dot and a persistent "Live Status"
panel that ticks on as the dot reaches each step. Nodes use real vendored
product logos (`scripts/icons.mjs::logoIcon()`) where factually accurate,
falling back to a Tabler outline icon otherwise — and plain-language
labels, never filenames, since a flow-GIF diagram is often the *first*
thing a non-technical scroller sees.

> **Know before you publish**: LinkedIn's post-image upload path is a
> still-image recipe. Confirmed by actually publishing a flow-GIF post —
> the platform flattens the animation to a single static frame the
> instant it goes live; there is no true motion once it's on the feed.
> **Read the [`cover-art`](.claude/skills/cover-art/SKILL.md) skill before
> publishing** — the frame that ends up representing the whole post should
> be a deliberately composed poster, not whatever `gif.mjs` happens to
> encode first.

Full gotcha log (icon sizing across two vendored SVG conventions, SVG
`transform`-attribute vs. CSS `transform` composition, GIF's 1/100s frame
delay ceiling, node-spacing-vs-dot-travel-distance, and more) lives in
`CLAUDE.md`'s **"Animated GIF posts"** section — read it before touching
`templates/flow-gif.mjs`.

## Content quality gate (Jev)

`scripts/quality-gate.mjs` runs a manifest's content past
[Jev](https://typesafe.ai) (TypeSafe AI's "System One" decision model)
*before* anything gets built — the class of judgment a Zod schema
structurally cannot make: not "is this JSON well-formed" but "is this hook
actually going to land."

```bash
export JEV_API_KEY=...                                       # never commit or log this
bun scripts/quality-gate.mjs content/my-post.json             # advisory — prints a report, exits 0
bun scripts/quality-gate.mjs content/my-post.json --strict    # exits 1 on any flagged/uncertain check
```

Four questions, evaluated in parallel in a single `systemOne()` call:

| Question | Type | Runs when |
| --- | --- | --- |
| `hook_strength` | Score, 4 levels | a `hook` slide exists |
| `cta_is_specific` | Noul (yes/no probability) | a `cta` slide exists |
| `jargon_risk` | Noul | always, over all slide text (code/Mermaid source excluded) |
| `diagram_readability_<i>` | Score, 3 levels | once per `diagram` slide |

Every answer resolves to `OK` / `FLAG` / `REVIEW` — never trusted as
ground truth on its own. Below a `0.6` confidence floor, the verdict is
always `REVIEW` regardless of direction, because a low-confidence "good"
grade is exactly as useless as a low-confidence "bad" one.

This is intentionally a **separate, deliberately-invoked stage** — never
folded into `build.mjs` or `render.mjs` — because a call to an external
LLM judge is neither deterministic nor offline, and this repo's core
render contract requires both by the time a slide reaches Chromium. See
`CLAUDE.md`'s **"Content quality gate (Jev)"** for the full design,
including how the request `state` is structured (grouped by purpose,
criteria kept out of the judged content) for high-quality input.

## Visual identity — the "Blueprint" theme

The current (and, for now, only) design system: deep slate background,
static dot-grid texture, teal/blue accent gradient, soft top-right glow.
Lives as CSS custom properties in `templates/carousel.mjs::baseStyles()`
(`--bg`, `--accent`, `--accent-2`, `--text`, `--muted`, `--border`,
`--card`), mirrored in `scripts/mermaid.mjs`'s `themeVariables` (Mermaid
diagrams don't inherit page CSS, so the palette is kept in sync by hand
across both files) and reused verbatim by `templates/flow-gif.mjs` so a
carousel post and a flow-GIF post from the same account read as the same
brand.

Typography — three vendored families, each with a house-style role:

- **Space Grotesk** (700/500) — headlines, stat values, diagram/heading titles.
- **Inter** (400/600/700) — body text, footer, list items.
- **JetBrains Mono** (400/600) — eyebrow labels, the page-count pill, code blocks.

Fonts are `@font-face`-declared against real vendored `.woff2` files with
`font-display: block` — headless Chromium has no system fonts beyond
whatever the container ships, so an unvendored `font-family` falls back
silently, not loudly.

## Vendored assets

`assets/` carries a curated, additively-merged copy of
[`video-generator`](https://github.com/SandeshKale/video-generator)'s
third-party asset library, so a post has real illustration/photo/logo
material instead of being text-only:

```
assets/
├── fonts/          Space Grotesk, Inter, JetBrains Mono, Poppins (.woff2, OFL)
├── icons/          tabler/ (outline, MIT), feather/, simple-icons/ (flat brand marks, CC0)
├── illustrations/  humaaans-react/ (24 character poses, MIT), flowbite/, bioicons/
├── logos/          gilbarbara/ (full-color product marks, CC0), svg-logos/ (ref-only, no license grant), unilogo/
├── photos/         servicestack/ stock photography
└── animations/     real-time CSS/SMIL packs — NOT directly usable by this repo's static
                    render contract; see CLAUDE.md before wiring one up
```

Per-source licenses are in each package's own `LICENSE*` file;
`assets/VIDEO_GENERATOR_ATTRIBUTION.md` covers sources that don't ship
their own. **`assets/logos/svg-logos/` in particular carries no license
grant at all** — reference/identification only, never redistribute as an
owned asset.

## Repo layout

```
linkedin-post-generator/
├── .claude/skills/cover-art/   Purpose-built poster-frame skill for flow-GIF posts
├── scripts/
│   ├── build.mjs               Manifest → self-contained HTML (the "compiler")
│   ├── render.mjs              HTML → carousel.pdf + slide-NN.png (the "exporter")
│   ├── mermaid.mjs             Mermaid diagram engine → static <svg>
│   ├── d2.mjs                  D2 diagram engine (WASM, no browser) → static <svg>
│   ├── shiki.mjs               Code string → syntax-highlighted <pre> HTML
│   ├── manifest-schema.mjs     Zod schema + parseManifest() — the shape guardrail
│   ├── icons.mjs               Vendored icon/logo loaders: icon(), brandIcon(), logoIcon()
│   ├── jev.mjs                 Jev/TypeSafe AI client wrapper
│   ├── quality-gate.mjs        Manifest → Jev content-quality judgment
│   ├── build-flow-gif.mjs      Flow manifest → animated-scene HTML
│   └── gif.mjs                 Animated scene HTML → looping .gif
├── templates/
│   ├── carousel.mjs            buildHtml({title, author, handle, slides}) — the carousel template
│   └── flow-gif.mjs            buildFlowGifHtml({nodes, edges, ...}) — the flow-diagram scene template
├── content/                    JSON manifests, one per post (*.json carousels, *.flow.json flow-GIFs)
├── assets/                     Vendored fonts, icons, illustrations, logos, photos — see above
├── output/                     Generated, gitignored — fully reproducible from content/*.json
├── package.json                Deps: playwright, mermaid, @terrastruct/d2, shiki, zod, @typesafe-ai/sdk
├── bun.lock                    Committed lockfile
└── CLAUDE.md                   Full architecture notes, gotchas, and house-style rules
```

## Design principles this repo enforces

These aren't just documentation — they're actively checked by the tooling
or repeatedly re-learned the hard way and written down so they don't get
re-broken:

- **Nothing non-deterministic ever reaches the renderer.** Every diagram,
  every syntax-highlighted code block, every piece of hydration happens in
  `build.mjs`, before Chromium ever opens the resulting HTML.
- **Fail fast, fail with a list.** `manifest-schema.mjs` validates the
  *whole* manifest and reports every violation at once — including
  checking every referenced icon name against the actual files vendored on
  disk — rather than surfacing one obscure error at a time.
- **Never auto-derive accessibility content.** Alt text is hand-written or
  absent — a generated summary of a slide's field values isn't a
  description of what a sighted viewer actually sees.
- **Verify visually, not just by reading markup.** Several real bugs in
  this repo's history — Mermaid text clipping, node overlap in the
  flow-GIF layout, a 3px-travel-distance animation that "should" have been
  smooth — were only caught by rendering the actual output and looking, not
  by reading the generated HTML/SVG. `CLAUDE.md` documents each one as a
  named gotcha so it isn't re-discovered from scratch.
- **A post's full deliverable is text *and* media, from one source of
  truth.** Caption and hashtags live in the same manifest as the slides,
  calibrated against real post performance data, not bolted on separately.

## Why bun

This repo runs on [bun](https://bun.sh), not npm — a measured decision,
not a default. Before migrating, install speed across npm/pnpm/bun/yarn
was actually benchmarked on this exact `package.json` in this exact
sandbox, then put to Jev as a `choice` question with those real
measurements as `state`. Result: bun, 99% confidence — driven less by the
cold-install number than by in-session *repeat* installs (bun's global
cache: ~0.26s vs. pnpm's ~2.2s), which is what a real dev session actually
does over and over. The full three-stage pipeline (quality-gate → build →
render) was re-run *as bun*, not just installed by it, and the resulting
PNGs pixel-diffed identical against the npm-produced baseline before the
migration was considered done. Full numbers and the one runtime-specific
gotcha it surfaced (D2's missing `dispose()` under bun's event loop) are
in `CLAUDE.md`'s **"Runtime & package manager"** section.

```bash
bun install
bun run build content/<slug>.json          # = bun scripts/build.mjs
bun run render output/<slug>/carousel.html # = bun scripts/render.mjs
bun run quality-gate content/<slug>.json   # = bun scripts/quality-gate.mjs
bun run build-flow-gif content/<slug>.flow.json  # = bun scripts/build-flow-gif.mjs
bun run gif output/<slug>/flow-scene.html output/<slug>/flow.gif  # = bun scripts/gif.mjs
```

## Skills

- **[`cover-art`](.claude/skills/cover-art/SKILL.md)** — build a
  purpose-built static poster/cover image for a flow-GIF post. Ported from
  `video-generator`'s own cover-art skill and made more load-bearing here
  than there: since LinkedIn flattens this repo's GIFs to one static frame
  on publish, the cover isn't a nice-to-have thumbnail — for a flow-GIF
  post it may be the only frame anyone ever sees. Invoke it before
  publishing any `flow-gif` post.

## Contributing a new post

1. **Carousel post**: copy `content/example-rag-guardrails.json`, give it
   a new kebab-case `slug`, write `slides[]` (see
   [Slide types](#slide-types) and `CLAUDE.md`'s full field reference),
   and a `caption`/`hashtags` following the calibrated structure.
   **Flow-GIF post**: copy `content/jev-claude-code.flow.json`'s shape
   instead — `nodes[]`, an optional `branch`, optional `chips`.
2. (Optional but recommended) run the quality gate before building.
3. `bun scripts/build.mjs content/<slug>.json` (or
   `build-flow-gif.mjs ... .flow.json`).
4. `bun scripts/render.mjs output/<slug>/carousel.html` (or
   `gif.mjs output/<slug>/flow-scene.html output/<slug>/flow.gif`).
5. **Verify visually** — open the PDF or a couple of PNGs, or the GIF, and
   actually look. Don't trust the generated markup alone.
6. Every post gets its own `slug` and therefore its own `output/<slug>/`
   folder — never overwrite a previous, genuinely different post's
   manifest in place.

Full architecture notes, every field's exact semantics, and the complete
gotcha log (Mermaid font-metric clipping, D2's missing `dispose()`,
gradient-text-shadow inheritance, flow-GIF connector geometry, and more)
live in [`CLAUDE.md`](CLAUDE.md) — read it before making a structural
change to either template.
