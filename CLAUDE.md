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
node scripts/build.mjs content/<manifest>.json     # → output/<slug>/carousel.html
node scripts/render.mjs output/<slug>/carousel.html # → carousel.pdf + slide-NN.png
```

`build.mjs` never touches Playwright's *render* path — its own use of
Playwright (via `scripts/mermaid.mjs`) is purely to pre-flatten Mermaid
source into SVG strings, a separate throwaway browser instance, closed
before `build.mjs` exits.

## Repository map

```
linkedin-post-generator/
├── scripts/
│   ├── build.mjs           Manifest → self-contained HTML (the "compiler")
│   ├── render.mjs          HTML → carousel.pdf + slide-NN.png (the "exporter")
│   ├── mermaid.mjs         Diagram source → static <svg> string, pre-render helper
│   └── shiki.mjs           Code string → syntax-highlighted <pre> HTML, pre-render helper
├── templates/
│   └── carousel.mjs        buildHtml({title, author, handle, slides}) — CSS + per-slide-type markup
├── content/
│   └── example-rag-guardrails.json   Sample manifest (all 6 slide types)
├── assets/
│   └── fonts/              Vendored Inter / Space Grotesk / JetBrains Mono (.woff2, OFL) — see "Typography"
├── output/                 Generated, gitignored — carousel.html/.pdf, slide-NN.png per slug
├── package.json            Deps: playwright, mermaid, shiki
└── CLAUDE.md               This file
```

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
  "slides": [ { "type": "hook" | "diagram" | "code" | "stat" | "list" | "cta", ... } ]
}
```

Slide types and their fields, all in `templates/carousel.mjs`'s
`RENDERERS` map:

- **`hook`** — `eyebrow?`, `headline`, `sub?`. Opening slide.
- **`diagram`** — `heading?`, `mermaid` (Mermaid diagram source, any
  supported diagram type), `mermaidTheme?` (defaults `'base'`, themed to
  the palette below in `scripts/mermaid.mjs`).
- **`code`** — `heading?`, `lang` (any Shiki/TextMate grammar id, e.g.
  `typescript`, `python`, `bash`), `code`, `shikiTheme?` (defaults
  `github-dark-default`).
- **`stat`** — `value` (big gradient number/short string), `label`,
  `context?` (supporting sentence).
- **`list`** — `heading?`, `items` (string array, auto-numbered).
- **`cta`** — `headline`, `sub?`. Closing slide.

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

## Typography

Same vendoring rule as `video-generator`: **fonts must be vendored, never
assumed present.** Headless Chromium has no system fonts installed beyond
whatever the container image ships — an unavailable `font-family` falls
back silently, not loudly. `assets/fonts/{inter,space-grotesk,
jetbrains-mono}/*.woff2` were extracted from `@fontsource/*` packages
(`npm install --no-save @fontsource/<name>`, copy the specific weights
from `node_modules/@fontsource/<name>/files/`, then `npm uninstall` — the
repo keeps the extracted `.woff2` files, not the npm dependency) and are
loaded via relative `@font-face` `url()`s in `templates/carousel.mjs`
with `font-display: block`. License: `assets/fonts/LICENSE-OFL.txt`.

- **Space Grotesk** (700/500) — headlines, stat values, "heading" slide titles.
- **Inter** (400/600/700) — body text, footer, list items.
- **JetBrains Mono** (400/600) — eyebrow labels, page-count pill, code blocks.

Adding a new vendored family follows the identical `npm install --no-save`
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

## Mermaid diagram rendering gotcha

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
