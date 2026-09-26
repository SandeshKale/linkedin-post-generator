<div align="center">

# 📄 linkedin-post-generator

**Deterministic LinkedIn content, generated from JSON, rendered pixel-for-pixel by headless Chromium.**

No design tool · No manual export · No drift between runs

![format](https://img.shields.io/badge/carousel-1080%C3%971350%20(4%3A5)-blueviolet)
![output](https://img.shields.io/badge/output-PDF%20%2B%20PNG%20%2B%20GIF-informational)
![renderer](https://img.shields.io/badge/renderer-Playwright%20%2B%20Chromium-2ea44f)
![judge](https://img.shields.io/badge/quality%20gate-Jev-9146FF)
![runtime](https://img.shields.io/badge/runtime-Bun-fbf0df?logo=bun&logoColor=black)

</div>

---

## Contents

- [✨ How it works](#-how-it-works)
- [🚀 Quick start](#-quick-start)
- [🗂 Repository layout](#-repository-layout)
- [🎠 The carousel pipeline](#-the-carousel-pipeline)
- [🌀 The flow-GIF pipeline](#-the-flow-gif-pipeline)
- [⚖️ The Jev quality gate](#️-the-jev-quality-gate)
- [🎨 Visual identity — "Blueprint"](#-visual-identity--blueprint)
- [📦 Vendored assets](#-vendored-assets)
- [🧭 Design principles this repo enforces](#-design-principles-this-repo-enforces)
- [🥟 Why Bun](#-why-bun)
- [📚 Further reading](#-further-reading)

---

## ✨ How it works

Every post starts life as a JSON manifest — a slide list for a carousel,
or a node/edge list for a flow diagram. A build script hydrates it (runs
Mermaid, D2, and Shiki *before* anything touches a renderer) into a
self-contained HTML document with **zero runtime JS left to execute**,
then a second script drives headless Chromium to export the final
PDF/PNG/GIF. Nothing about the output depends on wall-clock time, network
calls, or "whatever font happened to load" — the same manifest always
produces the same bytes.

```
   content/<slug>.json              scripts/build.mjs              scripts/render.mjs
┌─────────────────────┐       ┌─────────────────────────┐       ┌───────────────────────┐
│  slides[] / nodes[]   │  ──▶  │  Zod validate            │  ──▶  │  page.pdf()             │
│  caption, hashtags     │       │  Mermaid/D2 → <svg>      │       │  {preferCSSPageSize}     │
│  alt text               │       │  Shiki → <pre>            │       │  elementHandle          │
└─────────────────────┘       │  → carousel.html          │       │    .screenshot()         │
      hand-written JSON        └─────────────────────────┘       └───────────────────────┘
                                  fully static HTML                 carousel.pdf + slide-NN.png
```

> [!IMPORTANT]
> This is the **document-pipeline sibling** of
> [`video-generator`](https://github.com/SandeshKale/video-generator).
> Same "decouple rendering from anything non-deterministic" philosophy —
> that repo enforces it by making `window.__seek(t)` a pure function of
> *time*; this one enforces it by leaving **nothing** for `render.mjs` to
> compute at all. A still document has no time axis to be a pure function
> of, so the only way to guarantee determinism is to resolve everything —
> diagrams, syntax highlighting, fonts — before Chromium ever opens the page.
>
> See **[`CLAUDE.md`](./CLAUDE.md)** for the full technical contract and
> every gotcha learned building this repo's posts — worth re-reading after
> time away.

---

## 🚀 Quick start

```bash
bun install
bunx playwright install chromium   # first run only, if not already cached

# 1. (optional) run the manifest past an AI content judge before building
bun scripts/quality-gate.mjs content/example-rag-guardrails.json

# 2. manifest → self-contained HTML
bun scripts/build.mjs content/example-rag-guardrails.json

# 3. HTML → PDF + per-slide PNGs
bun scripts/render.mjs output/rag-guardrails/carousel.html
```

Everything lands in `output/rag-guardrails/`:

| File | What it's for |
|---|---|
| `carousel.pdf` | LinkedIn **Document** post — upload as-is |
| `slide-01.png` … `slide-NN.png` | Image-carousel post, or one slide pulled as a standalone infographic/OG image |
| `caption.md` | Post text, ready to paste into LinkedIn's composer |
| `alt-text.md` | Per-slide accessibility descriptions |

> [!TIP]
> `bun run build`, `bun run render`, `bun run quality-gate`,
> `bun run build-flow-gif`, and `bun run gif` are the same scripts via
> `package.json` aliases, if you prefer that spelling.

---

## 🗂 Repository layout

```
linkedin-post-generator/
├── .claude/skills/
│   └── cover-art/            Purpose-built poster/thumbnail design pattern for flow-GIF posts
│
├── scripts/
│   ├── build.mjs               Manifest → self-contained HTML (the "compiler")
│   ├── render.mjs               HTML → carousel.pdf + slide-NN.png (the "exporter")
│   ├── mermaid.mjs               Mermaid diagram engine → static <svg>
│   ├── d2.mjs                     D2 diagram engine (WASM, no browser) → static <svg>
│   ├── shiki.mjs                   Code string → syntax-highlighted <pre> HTML
│   ├── manifest-schema.mjs          Zod schema + parseManifest() — the shape guardrail
│   ├── icons.mjs                     Vendored icon/logo loaders — icon(), brandIcon(), logoIcon()
│   ├── jev.mjs                        Jev/TypeSafe AI client wrapper
│   ├── quality-gate.mjs                Manifest → Jev content-quality judgment, pre-build only
│   ├── build-flow-gif.mjs               Flow manifest → animated-scene HTML
│   └── gif.mjs                           Animated scene HTML → looping .gif
│
├── templates/
│   ├── carousel.mjs           buildHtml({title, author, handle, slides}) — the carousel template
│   └── flow-gif.mjs            buildFlowGifHtml({nodes, edges, ...}) — the flow-diagram scene template
│
├── content/                  JSON manifests — *.json carousels, *.flow.json flow-GIFs
├── assets/                   Vendored fonts, icons, illustrations, logos, photos — see below
├── output/                   Generated, gitignored — fully reproducible from content/*.json
│
├── package.json / bun.lock   Bun-managed deps + script aliases
└── README.md / CLAUDE.md     This file / the full agent-facing technical guide
```

---

## 🎠 The carousel pipeline

Six slide types ship out of the box, each with its own renderer in
`templates/carousel.mjs`'s `RENDERERS` map:

| Type | Purpose | Key fields |
|---|---|---|
| 🎣 `hook` | Opening slide | `icon?`, `eyebrow?`, `headline`, `sub?` |
| 📊 `diagram` | A Mermaid or D2 diagram | `icon?`, `heading?`, `engine?` (`mermaid`\|`d2`) + engine source |
| 💻 `code` | Syntax-highlighted code block | `heading?`, `lang`, `code`, `shikiTheme?` |
| 🔢 `stat` | A hero number, optionally with a before/after bar chart | `icon?`, `value`, `label`, `context?`, `compare?` |
| 📋 `list` | Numbered or icon-badged list | `heading?`, `items[]` |
| 📣 `cta` | Closing slide | `icon?`, `headline`, `sub?` |

```bash
bun scripts/render.mjs output/<slug>/carousel.html [--scale=2] [--format=pdf,png]
```

- `page.pdf({ preferCSSPageSize: true })` respects each slide's `@page`
  CSS box (`1080×1350`) for the combined Document-post PDF.
- `elementHandle.screenshot()` per `.slide` produces standalone PNGs, at
  `--scale=2` (2160×2700, retina-crisp, default) or `--scale=1` (native).

> [!NOTE]
> **Caption and hashtags live in the manifest too** — never rendered on a
> slide, written out to `output/<slug>/caption.md` instead. The structure
> isn't guessed: a sample of real posts (2,830 / 1,279 / 911 / 213 likes)
> showed the *lowest* performer was the one that read most like generic
> AI prose. The winners shared a myth-correction or shocking-number
> opening line, an explicit **save-this** trigger, and emoji-sectioned,
> scannable paragraphs — see `content/speculative-decoding.json`'s
> `caption` field for the worked example.

> [!NOTE]
> **`alt` text is hand-written, never auto-derived.** A generated
> "headline: X, icon: bolt" string tells a screen-reader user nothing a
> sighted viewer actually sees — capped at 1,000 characters (LinkedIn's
> own limit), written out to `output/<slug>/alt-text.md`.

**Diagram engines** — a `diagram` slide picks `engine: 'mermaid' | 'd2'`:
Mermaid runs in a throwaway Playwright page and supports a `handDrawn`
sketch look (reliable on small diagrams only); D2 runs as **WASM directly
in Node, no browser at all**, and is always rendered `sketch: true` for a
reliably wobbly hand-drawn look even on dense, cyclic diagrams where
Mermaid's own sketch mode degrades. Both emit a plain `<svg>` string
consumed identically downstream.

---

## 🌀 The flow-GIF pipeline

For the post that's better as one animated process diagram than a
multi-slide carousel — a reverse-engineered "gold standard" format for
pipeline explainer posts:

```bash
bun scripts/build-flow-gif.mjs content/<slug>.flow.json    # → output/<slug>/flow-scene.html
bun scripts/gif.mjs output/<slug>/flow-scene.html \
    output/<slug>/flow.gif [--duration=4000] [--fps=20]     # → output/<slug>/flow.gif
```

This is a **deliberately separate sibling pipeline**, not a mode of
`render.mjs` — genuine motion is the literal opposite of the "nothing
left to compute" contract the carousel pipeline enforces. Determinism
here comes from a different trick, borrowed in spirit from
`video-generator`'s `__seek(t)`: every CSS `Animation` on the page is
paused once via the Web Animations API, then scrubbed to each sample
instant with `animation.currentTime` before a screenshot — never real
wall-clock playback.

Scenes show a labeled pipeline as icon/logo-badged step cards, connected
by real edge-to-edge connectors with a traveling, eased "packet" dot and
a persistent status panel that ticks on as the dot reaches each step.
Real vendored product logos where factually accurate; plain-language
labels always, since this diagram is often the *first* thing a
non-technical scroller sees — never a filename or internal script name.

> [!WARNING]
> **LinkedIn flattens the GIF to one static frame on publish.** Confirmed
> by actually publishing a flow-GIF post — the platform's post-image
> upload path is a still-image recipe; there is no true motion once it's
> live on the feed. That single frame may be the *only* thing anyone ever
> sees, so **read the [`cover-art` skill](./.claude/skills/cover-art/SKILL.md)
> before publishing** — it should be a deliberately composed poster, not
> whatever `gif.mjs` happens to encode first.

The full gotcha log — icon sizing across two vendored SVG conventions, an
SVG `transform` attribute silently overridden by a CSS `transform`
animation, GIF's 1/100s frame-delay ceiling (true 60fps rounds to
50fps-effective), node-spacing-vs-dot-travel-distance — lives in
`CLAUDE.md`'s **"Animated GIF posts"** section.

---

## ⚖️ The Jev quality gate

`scripts/quality-gate.mjs` runs a manifest's content past
[Jev](https://typesafe.ai) *before* anything gets built — the class of
judgment a Zod schema structurally cannot make: not "is this JSON
well-formed" but **"is this hook actually going to land."**

```bash
export JEV_API_KEY=...                                       # never commit or log this
bun scripts/quality-gate.mjs content/my-post.json             # advisory — prints a report, exits 0
bun scripts/quality-gate.mjs content/my-post.json --strict    # exits 1 on any flagged/uncertain check
```

Four questions, evaluated **in parallel in one `systemOne()` call**:

| Question | Type | Runs when |
|---|---|---|
| `hook_strength` | Score, 4 levels | a `hook` slide exists |
| `cta_is_specific` | Noul (yes/no probability) | a `cta` slide exists |
| `jargon_risk` | Noul | always, over all slide text |
| `diagram_readability_<i>` | Score, 3 levels | once per `diagram` slide |

Every answer resolves to `OK` / `FLAG` / `REVIEW` — never trusted as
ground truth. Below a `0.6` confidence floor, the verdict is always
`REVIEW` regardless of direction, because a low-confidence "good" grade
is exactly as useless as a low-confidence "bad" one.

> [!NOTE]
> This is a **separate, deliberately-invoked stage** — never folded into
> `build.mjs` or `render.mjs` — because a call to an external LLM judge is
> neither deterministic nor offline, and this repo's core render contract
> requires both by the time a slide reaches Chromium. Same discipline as
> running a linter before a build, not inside one.

---

## 🎨 Visual identity — "Blueprint"

Deep slate background · static dot-grid texture · teal/blue accent
gradient · soft top-right glow — the current (and, for now, only) theme,
defined once as CSS custom properties and mirrored across every renderer
so a carousel post and a flow-GIF post from the same account read as the
same brand:

| Family | Weights | Role |
|---|---|---|
| **Space Grotesk** | 700 / 500 | Headlines, stat values, diagram titles |
| **Inter** | 400 / 600 / 700 | Body text, footer, list items |
| **JetBrains Mono** | 400 / 600 | Eyebrow labels, the page-count pill, code blocks |

Fonts are `@font-face`-declared against real vendored `.woff2` files with
`font-display: block` — headless Chromium has no system fonts beyond
whatever the container ships, so an unvendored `font-family` falls back
silently, not loudly.

---

## 📦 Vendored assets

`assets/` carries a curated, additively-merged copy of
[`video-generator`](https://github.com/SandeshKale/video-generator)'s
third-party asset library, so a post has real illustration/photo/logo
material instead of being text-only:

```
assets/
├── fonts/           Space Grotesk, Inter, JetBrains Mono, Poppins (.woff2, OFL)
├── icons/           tabler/ (outline, MIT) · feather/ · simple-icons/ (flat brand marks, CC0)
├── illustrations/   humaaans-react/ (24 poses, MIT) · flowbite/ · bioicons/
├── logos/           gilbarbara/ (full-color marks, CC0) · svg-logos/ (⚠️ reference only) · unilogo/
├── photos/          servicestack/ stock photography
└── animations/      ⚠️ real-time CSS/SMIL packs — NOT usable by this repo's static contract as-is
```

Per-source licenses are in each package's own `LICENSE*` file;
[`assets/VIDEO_GENERATOR_ATTRIBUTION.md`](./assets/VIDEO_GENERATOR_ATTRIBUTION.md)
covers the rest. **`assets/logos/svg-logos/` carries no license grant at
all** — identification only, never redistribute as an owned asset.

---

## 🧭 Design principles this repo enforces

Not just documentation — actively checked by the tooling, or hard-won and
written down so they don't get re-broken:

- 🔒 **Nothing non-deterministic ever reaches the renderer.** Every
  diagram and every highlighted code block is fully resolved in
  `build.mjs`, before Chromium ever opens the page.
- 🚨 **Fail fast, fail with a list.** `manifest-schema.mjs` validates the
  *whole* manifest at once — including every referenced icon name against
  the files actually vendored on disk — instead of surfacing one obscure
  `undefined` at a time.
- ♿ **Never auto-derive accessibility content.** Alt text is hand-written
  or absent, on principle.
- 👀 **Verify visually, not just by reading markup.** Mermaid text
  clipping, flow-GIF node overlap, a 3px animation that "should" have
  looked smooth on paper — every one of these was only caught by
  rendering the actual output and looking. `CLAUDE.md` names each as a
  gotcha so it isn't re-discovered from scratch.
- 📝 **A post's full deliverable is text *and* media, from one source of
  truth.** Caption and hashtags live in the same manifest as the slides,
  calibrated against real post performance, not bolted on separately.

---

## 🥟 Why Bun

Not a default — a **measured** decision. Install speed across
npm/pnpm/bun/yarn was benchmarked on this exact `package.json`, then put
to Jev itself as a `choice` question with the real numbers as `state`.
Result: **bun, 99% confidence** — driven less by the cold-install number
than by in-session *repeat* installs (bun's cache: ~0.26s vs. pnpm's
~2.2s), which is what a real build session actually does over and over.
The full three-stage pipeline was then re-run *as bun*, not just
installed by it, and the resulting PNGs pixel-diffed identical against
the npm-produced baseline before the migration was called done.

```bash
bun install
bun run build content/<slug>.json
bun run render output/<slug>/carousel.html
```

Full numbers — and the one runtime-specific gotcha it surfaced (D2's
missing `dispose()` under bun's event loop) — are in `CLAUDE.md`'s
**"Runtime & package manager"** section.

---

## 📚 Further reading

| Doc | What's in it |
|---|---|
| **[`CLAUDE.md`](./CLAUDE.md)** | The full technical guide — render contract, manifest schema, every gotcha, git conventions |
| **[`assets/VIDEO_GENERATOR_ATTRIBUTION.md`](./assets/VIDEO_GENERATOR_ATTRIBUTION.md)** | License table per asset source |
| **[`.claude/skills/cover-art/SKILL.md`](./.claude/skills/cover-art/SKILL.md)** | Step-by-step pattern for a flow-GIF post's poster image |

<div align="center">

—

Built with 🧩 headless Chromium, 🧜 Mermaid, ✏️ D2, 🎨 Shiki, ⚖️ Jev, and 🥟 Bun — no design tool required.

</div>
