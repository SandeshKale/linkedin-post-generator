# linkedin-post-generator

Generates deterministic LinkedIn **PDF Carousels** (Document posts) and
per-slide images from a JSON content manifest, using headless Chromium.
Sibling pipeline to [`video-generator`](https://github.com/SandeshKale/video-generator):
same "decouple rendering from anything non-deterministic" approach, swapping
that repo's `window.__seek(t)` time contract for CSS `@page` pagination and
`page.pdf()`/`page.screenshot()` export.

## Quick start

```bash
npm install
npx playwright install chromium   # first run only, if not already cached

node scripts/build.mjs content/example-rag-guardrails.json
node scripts/render.mjs output/rag-guardrails/carousel.html
```

Output lands in `output/rag-guardrails/`:
- `carousel.pdf` — the multi-page LinkedIn Document post (upload as-is).
- `slide-01.png` … `slide-06.png` — the same slides as standalone images,
  for an image-carousel post or a one-off infographic/OG image.

## Writing a new post

Copy `content/example-rag-guardrails.json`, give it a new `slug`, and edit
`slides[]`. Six slide types are supported out of the box — `hook`,
`diagram` (Mermaid), `code` (Shiki-highlighted), `stat`, `list`, `cta` —
see `CLAUDE.md`'s "Slide manifest schema" for the full field reference per
type. Then rebuild:

```bash
node scripts/build.mjs content/my-new-post.json
node scripts/render.mjs output/my-new-post/carousel.html
```

## How it works

1. **`scripts/build.mjs`** validates the manifest against a Zod schema
   (`scripts/manifest-schema.mjs` — unknown slide types or missing required
   fields fail immediately with a clear list of what's wrong), then
   hydrates it: Mermaid
   diagram source is pre-rendered to a static `<svg>` (`scripts/mermaid.mjs`,
   via a throwaway headless-Chromium pass) and code blocks are pre-highlighted
   to Shiki HTML (`scripts/shiki.mjs`, pure Node). It hands the fully
   resolved slide list to `templates/carousel.mjs::buildHtml()`, which emits
   one self-contained HTML document — one `<section class="slide">` per
   slide, `1080×1350`px, styled with vendored fonts and the "Blueprint"
   dark theme — to `output/<slug>/carousel.html`.
2. **`scripts/render.mjs`** opens that static HTML in headless Chromium and
   exports it two ways: `page.pdf({ preferCSSPageSize: true })` (respecting
   each slide's `@page` CSS box) for the combined carousel PDF, and
   `elementHandle.screenshot()` per `.slide` for individual PNGs.

No animation, no runtime JS, no wall-clock dependency anywhere in the
render step — every slide is fully resolved before Chromium ever opens the
page, which is what makes the export byte-for-byte reproducible from the
same manifest.

Full architecture notes, the slide-type reference, the safe-zone/typography
rules, and a couple of hard-won rendering gotchas (see: Mermaid text
clipping) live in `CLAUDE.md`.

## Repo layout

```
scripts/     build.mjs (manifest → HTML), render.mjs (HTML → PDF/PNG),
             mermaid.mjs / shiki.mjs (pre-render helpers)
templates/   carousel.mjs — the HTML/CSS template
content/     JSON slide manifests, one per post
assets/      Vendored OFL webfonts
output/      Generated, gitignored — regenerate anytime from content/
```
