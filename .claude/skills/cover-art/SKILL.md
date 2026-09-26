---
name: cover-art
description: Build a purpose-built static cover/poster image for a flow-GIF post (or a standalone thumbnail for any post) in this repo. Use whenever a GIF post needs a poster frame — never grab a mid-animation frame from the rendered GIF, and never assume the platform preserves the animation.
---

# Cover art for a post

Ported from the sibling repo `video-generator` (`.claude/skills/cover-art/`),
where the same rule was established for Instagram Reels: **a cover/poster
image is a standalone design, not a frame pulled from the finished
render.** It applies here with extra force, not just by analogy — this
repo's own `flow-gif` posts hit the reason why firsthand: LinkedIn's post
media pipeline uploads through its still-image (`STILLIMAGE` /
`feedshare-image`) recipe, which flattens an animated GIF to a single
frame the instant it's posted (confirmed empirically publishing
`jev-claude-code`'s flow GIF — the feed only ever shows one static frame,
never the loop). That means **the "cover" isn't just a thumbnail shown
before a click — for a flow-GIF post, on LinkedIn it may be the *only*
frame anyone ever sees.** Treat every flow-GIF post as needing a
deliberately composed poster frame, not a `sample from the timeline`.

## When to reach for this

- Before publishing (or re-publishing) any `flow-gif` post — see
  `templates/flow-gif.mjs` / `scripts/build-flow-gif.mjs` /
  `scripts/gif.mjs`. Don't just grab `scripts/gif.mjs`'s frame 0 or a
  mid-loop frame as the thing that gets uploaded.
- If a carousel post (`templates/carousel.mjs`) ever needs a standalone
  square/OG thumbnail distinct from its `hook` slide (the hook slide
  itself already serves as the carousel's de-facto cover in LinkedIn's
  Document-post UI, so this is usually *not* needed for carousels — only
  reach for a dedicated cover script there if a specific non-carousel
  surface, e.g. a link preview image, needs its own asset).

## The pattern

Write a small standalone `scripts/build-cover.mjs` (or a per-post
`cover-build.mjs` next to the flow manifest, mirroring
`scripts/build-flow-gif.mjs`'s shape) that produces a single static
`cover.html` and screenshots it once — it does not touch `gif.mjs`'s
Web-Animations scrubbing loop at all, because a cover has no timeline to
scrub.

1. **Reuse this repo's real asset-extraction helpers** — `icon()`,
   `brandIcon()`, `logoIcon()` from `scripts/icons.mjs` — exactly as
   `templates/flow-gif.mjs` already does. Never hand-copy an SVG path
   into the cover script.
2. **Reuse the post's finished visual system verbatim** — same
   `--bg`/`--accent`/`--accent-2`/`--text`/`--muted`/`--border`/`--card`
   custom properties from `templates/carousel.mjs::baseStyles()` (the
   "Blueprint" theme; `templates/flow-gif.mjs` already shares these
   tokens — see CLAUDE.md's "Visual identity" section), same vendored
   `@font-face` declarations (Space Grotesk / Inter / JetBrains Mono),
   same dot-grid/glow background language. The cover must look like it
   belongs to that specific post, not a generic template — this repo
   currently has exactly one theme, so "matching" mostly means reusing
   the same CSS custom properties and fonts rather than re-deriving a
   whole new palette per post (contrast with `video-generator`, where
   every reel invents its own palette — this repo's "Visual identity"
   section is explicit that a second theme is opt-in, not the default).
3. **Invent a genuinely new composition that appears nowhere in the
   flow-GIF's own node/connector layout.** A cover that reuses the exact
   node-column-plus-connectors layout reads as a frame grab even if it's
   technically a fresh render. Ideas to adapt (see
   `video-generator/CLAUDE.md`'s "Composing the hero graphic" for the
   full list this was drawn from):
   - **Orbiting ring** — N step icons evenly spaced around a circle
     (`angle = -90 + i * (360/N)`, `x = cx + R*cos(angle), y = cy +
     R*sin(angle)`) around the post's `brandBadge`/`brandBadgeLabel`
     logo centered inside.
   - **Condensed path** — the same node sequence as the flow-GIF, but
     laid out horizontally in one row with short connector arrows
     instead of the GIF's tall vertical column — different enough
     geometry that it doesn't read as a lifted frame, while still being
     honestly derived from the same `nodes` array in the flow manifest.
   - **Radial burst** — step icons fanning out from a center brand mark
     along straight spokes.
4. **Standard content lockup**, top to bottom — mirrors
   `video-generator`'s cover lockup, adapted to this repo's fields:
   - A short eyebrow line in JetBrains Mono, tracked caps (e.g. `// AI
     JUDGMENT PIPELINE`).
   - The hero graphic (step 3).
   - The flow manifest's own `title` as a large Space Grotesk headline,
     with one or two words picked out via the same
     `background-clip: text` accent-gradient treatment
     `templates/carousel.mjs` already uses for stat values — remember
     the gradient-text gotcha below.
   - A one-line subtitle stating the post's core hook in plain language.
   - The same author footer treatment (avatar + name + handle) as
     `templates/carousel.mjs`'s `.safe` footer, for brand consistency
     across a carousel post and a flow-GIF post from the same account.
5. **Render with a plain one-off Playwright screenshot, not
   `scripts/gif.mjs`'s scrubbing loop.** See "Rendering" below.

## Rules carried over from this repo's own house style

Non-negotiable, already established in this repo's `CLAUDE.md` — a cover
doesn't get an exemption from any of these:

- **Vendored fonts only** — an explicit `@font-face` pointing at
  `assets/fonts/<family>/*.woff2`, `font-display: block`, never a bare
  `font-family: 'Space Grotesk'` assumed present (see CLAUDE.md
  "Typography").
- **No pure `#fff`** for headline/body text — use this repo's `--text`
  custom property (a tinted off-white), not a literal white.
- **Gradient-text gotcha** (already fixed once in
  `templates/carousel.mjs`'s `.stat-value`, see CLAUDE.md's Blueprint
  theme code) — a `background-clip: text; color: transparent;` span
  must have `text-shadow: none` set explicitly and use `filter:
  drop-shadow(...)` instead if it needs a glow; an inherited
  `text-shadow` on a transparent fill renders as a solid dark
  silhouette, not the gradient.
- **Small brand elements need deliberate contrast** — the `brandBadge`
  logo or author avatar needs a real border/glow to separate it from
  the dot-grid/glow background behind it, checked at its real on-screen
  size (a LinkedIn feed thumbnail is small), not just in the full-size
  render.
- **Verify visually** — screenshot the actual `cover.png`, don't trust
  the generated markup; this repo's own CLAUDE.md has multiple gotchas
  (icon sizing, node overlap, connector geometry) that were only caught
  this way.

## Rendering

```js
// at the end of scripts/build-cover.mjs, after writing cover.html
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  await page.goto(`file://${coverHtmlPath}`);
  await page.waitForFunction(() => document.fonts.ready);
  await page.screenshot({ path: coverPngPath });
} finally {
  await browser.close();
}
```

Use the carousel's own 1080×1350 (4:5) canvas for a cover meant to sit
next to a carousel post, or 1080×1080 (1:1, LinkedIn's safest universal
image aspect) for a cover meant to stand alone as a flow-GIF post's
poster — pick based on what the cover is replacing.

## Checklist before calling a cover done

- [ ] Does the hero graphic reuse the flow-GIF's exact node/connector
      layout? If yes, redesign it — geometry must differ, even if it's
      honestly built from the same manifest data.
- [ ] Do the colors/fonts match this repo's Blueprint theme tokens, not
      hardcoded one-off values?
- [ ] Is every font `@font-face`-declared against a real vendored
      `.woff2`?
- [ ] Is all headline/body text using `--text`/`--muted`, not pure
      white?
- [ ] If any text uses a gradient-clip span, is `text-shadow: none` set
      on it explicitly?
- [ ] Does the brand badge / avatar have real border+glow contrast, and
      does it still read at real LinkedIn-thumbnail size?
- [ ] Since LinkedIn flattens this repo's GIFs to a still frame on
      publish (confirmed, not theoretical): would a viewer who only ever
      sees this one static image still understand the post's point? If
      not, the cover needs more of the "why," not just the "what."

No reference implementation exists yet in this repo (first post to need
one should write `scripts/build-cover.mjs` and update this note to point
at it) — until then, read `video-generator`'s
`reel-openai-loop-method/cover-build.mjs` end to end as the pattern to
adapt, not copy verbatim (it's built for a 1080×1920 reel and GSAP-free
static CSS, not this repo's 1080×1350/1080×1080 canvases or its
`icons.mjs` helpers).
