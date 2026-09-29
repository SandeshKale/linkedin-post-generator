// Builds a standalone, self-contained HTML "scene" for an animated flow
// diagram — the GIF-post sibling of templates/carousel.mjs's static
// <section class="slide"> pages. Supports two visual systems (see the
// THEMES map below — 'blueprint', the original, teal/navy/rounded-cards
// system carousel.mjs also uses, and 'audit', a genuinely distinct
// amber/violet/clip-corner system for a different post's topic, not just
// a recolor — video-generator's CLAUDE.md is explicit that "every reel
// needs its own visual identity," component language included, not just
// its palette). All vendored fonts either theme might reach for. This
// file's whole reason to exist is the opposite of carousel.mjs's contract:
// everything in here is a real, running CSS
// Animation (marching-ants dashes, a traveling "request" dot, per-node glow
// pulses), driven purely by CSS so scripts/gif.mjs can scrub it
// deterministically via the Web Animations API (`animation.currentTime`) —
// see scripts/gif.mjs's own comment for why that's the load-bearing trick
// that makes a *reproducible* GIF possible instead of a live, non-
// deterministic screen recording.
//
// Nodes/chips are real vendored art, not just colored boxes: `icon` pulls
// a Tabler outline icon (via scripts/icons.mjs::icon()), `brand` pulls a
// flat, single-color brand mark (::brandIcon(), assets/icons/simple-icons,
// CC0), and `logo` pulls a real full-color product logo (::logoIcon(),
// assets/logos/gilbarbara, CC0 — used for developer-tool logos
// simple-icons doesn't carry, e.g. Bun, Playwright). All three come back
// as full `<svg>...</svg>` strings; nested `<svg>` inside a parent `<svg>`
// is valid per spec (it establishes its own viewport), so they're dropped
// in directly rather than re-parsed.
import { icon, brandIcon, logoIcon } from '../scripts/icons.mjs';

const PAGE_W = 1080;
const PAGE_H = 1350;

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Patches only the width/height on a vendored icon's own outer <svg> tag,
 * leaving every other attribute (viewBox, and critically `fill`/`stroke`)
 * untouched. This matters because the two vendored sets disagree on both
 * sizing AND color convention: Tabler icons declare width="24" height="24"
 * *and* fill="none" stroke="currentColor" on their own <svg> root (the
 * paths have no color of their own, they inherit that root's stroke);
 * simple-icons brand marks declare neither width/height nor stroke, just
 * a viewBox and paths with no explicit fill (initial value: black).
 * Discarding the original tag entirely (an earlier version of this
 * function did) silently drops Tabler's fill="none" stroke="currentColor"
 * too, turning every outline icon into a solid black blob — caught only
 * by rendering and looking, not by reading the generated markup. Leaving
 * width/height unset instead (simple-icons' actual bug) makes a nested
 * `<svg>` fall back to the browser's default replaced-element box (300x150
 * CSS px) rather than its viewBox, rendering enormous. Patching just those
 * two attributes in place fixes both without disturbing either set's own
 * color convention.
 */
function sizedIcon(svg, size) {
  return svg.replace(/<svg([^>]*)>/, (_, attrs) => {
    const withoutSize = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${withoutSize} width="${size}" height="${size}">`;
  });
}

/** A vendored icon, sized/positioned via a wrapping <g> (see module comment
 * for why nested transforms have to live one level up from any CSS-animated
 * element). `colorVar` only takes effect on icons that actually reference
 * currentColor (Tabler's stroke, or a logo mark forced via CSS below). */
function iconAt(svg, x, y, size, colorVar) {
  return `<g transform="translate(${x}, ${y})" style="color: ${colorVar};">${sizedIcon(svg, size)}</g>`;
}

/** SVG path `d` for a card with two opposite corners cut at 45°, the
 * angular "clip-corner panel" shape video-generator's loop-method reel
 * uses (there, a CSS `clip-path: polygon(...)` on an HTML div — this is
 * the same shape expressed as an SVG path, since flow-gif's node cards
 * are SVG `<rect>`s, not HTML elements). Used as an alternate to a plain
 * rounded `<rect>` when a post's `theme.nodeShape` asks for it — a
 * genuinely different component language, not just a different color,
 * per video-generator's CLAUDE.md: "the component language should
 * differ, not just its color." */
function clipCornerPath(w, h, c = 20) {
  return `M 0,0 L ${w - c},0 L ${w},${c} L ${w},${h} L ${c},${h} L 0,${h - c} Z`;
}

/** SVG path `d` for an actual manila-folder silhouette — a rectangular
 * body with a trapezoidal tab standing up off its top-left corner, the
 * way a physical case-file folder looks, rather than a rectangle with
 * its corners styled differently. Added after feedback that clip-corner/
 * dashed-border/hexagon-badge variants were all still fundamentally "a
 * rectangle with a different trim" — a real theme-specific *silhouette*,
 * not another rectangle treatment, for a post whose whole visual
 * metaphor is a stack of case files. `tabW` defaults to 42% of the
 * card's own width, `tabH` to a fixed 22px — proportional to the card so
 * it still reads correctly at this repo's one canvas size (1080×1350)
 * without a caller having to tune it per node. The `Z` close at the end
 * draws the tab's own left edge as a straight diagonal for free — no
 * separate path segment needed for it. */
function folderTabPath(w, h, tabW = w * 0.42, tabH = 22) {
  const notch = 10;
  return `M ${notch},0 L ${tabW},0 L ${tabW + tabH},${tabH} L ${w},${tabH} L ${w},${h} L 0,${h} L 0,${tabH} Z`;
}

/** Point string for a diamond (a square rotated 45°) of "radius" `r`
 * (half its own diagonal), centered at the origin — an alternate step
 * badge shape, a wax-seal/official-mark read rather than a circular
 * rubber-stamp read. */
function diamondPoints(r) {
  return `0,${-r} ${r},0 0,${r} ${-r},0`;
}

/** Point string for a flat-side-up regular hexagon of radius `r`, centered
 * at the origin — an alternate step-badge shape ("seal/stamp" impression)
 * for a post whose `theme.stepBadgeShape` is `'hex'`, instead of the
 * default filled circle. */
/** '#rrggbb' -> 'r, g, b', for building an rgba() glow color from a
 * theme's hex accent — box-shadow/drop-shadow can't take a CSS custom
 * property mixed with a literal alpha, so the accent has to be expanded
 * to raw components once here rather than hardcoded per theme. */
function hexToRgbTriplet(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '63, 208, 201';
  return [1, 2, 3].map((i) => parseInt(m[i], 16)).join(', ');
}

const DISPLAY_FONT_WEIGHTS = { 'Space Grotesk': 700, Poppins: 800, 'JetBrains Mono': 600 };

function hexPoints(r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// Named starting points, not a closed set to keep reusing — CLAUDE.md's
// "Visual identity" section is explicit that every post's flow-GIF needs
// its OWN invented-fresh look (video-generator's "every reel needs its
// own visual identity" rule, applied without exception here: a preset
// used verbatim on a second, unrelated post is the same mistake as
// recoloring Blueprint was). `buildFlowGifHtml`'s `theme` param accepts
// either one of these names (a documented reference point, e.g. while
// prototyping) OR — the expected path for an actual new post — a full
// inline theme object in that post's own manifest, merged over
// `blueprint`'s defaults so a one-off theme only has to specify what it
// changes. See the JSDoc below for every field a theme can set.
const THEMES = {
  blueprint: {
    colors: {
      bg: '#0b1220', bg2: '#101a2c', accent: '#3fd0c9', accent2: '#6c8bff',
      warn: '#ffb454', text: '#eef2f8', muted: '#93a1bb',
      border: 'rgba(148, 172, 214, 0.30)', card: 'rgba(255, 255, 255, 0.05)',
    },
    sceneBg: '#05070c',
    displayFont: 'Space Grotesk',
    nodeShape: 'rounded',
    nodeBorderStyle: 'solid',
    stepBadgeShape: 'circle',
    bgTexture: 'dots',
    connectorStyle: 'straight',
    dotStyle: 'glow',
  },
  audit: {
    colors: {
      bg: '#160b06', bg2: '#241206', accent: '#e8a33d', accent2: '#8b6bf0',
      warn: '#ff6b5e', text: '#f8efe3', muted: '#c2a68a',
      border: 'rgba(232, 163, 61, 0.28)', card: 'rgba(255, 255, 255, 0.045)',
    },
    sceneBg: '#0a0504',
    displayFont: 'Poppins',
    nodeShape: 'clip-corner',
    nodeBorderStyle: 'solid',
    stepBadgeShape: 'hex',
    bgTexture: 'scan',
    connectorStyle: 'straight',
    dotStyle: 'glow',
  },
  // A third reference point, deliberately far from the other two's "dark
  // tech UI" register — a redacted classified-dossier look for a post
  // about governance/oversight. Paper instead of a screen, ink instead of
  // glow, a hand-wobbled connector instead of a ruler-straight one, and a
  // rotated stamp watermark. Demonstrates every optional knob a custom
  // per-post theme can reach for; still just a starting point to remix,
  // not a third thing to reuse as-is on an unrelated topic.
  dossier: {
    colors: {
      bg: '#e4d8ba', bg2: '#efe6cc', accent: '#a8281c', accent2: '#5c5138',
      warn: '#a8281c', text: '#2b2620', muted: '#6b5f45',
      border: 'rgba(43, 38, 32, 0.35)', card: 'rgba(255, 252, 240, 0.55)',
    },
    sceneBg: '#d9cba8',
    displayFont: 'JetBrains Mono',
    nodeShape: 'folder-tab',
    nodeBorderStyle: 'dashed',
    stepBadgeShape: 'diamond',
    bgTexture: 'paper',
    connectorStyle: 'wobble',
    dotStyle: 'ink',
    stepBadgeTextColor: '#f3ead2',
    connectorColor: 'rgba(43, 38, 32, 0.55)',
    stamp: { text: 'CONFIDENTIAL', rotate: -18 },
  },
};

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {{id:string, x:number, y:number, w:number, h:number, label:string, icon?:string, logo?:string, note?:string}[]} opts.nodes
 *   Main-path nodes, in travel order — the traveling dot visits them in
 *   array order, evenly spaced across the first 80% of `loopMs`. Each node
 *   is an icon-over-label card, not a filename pill — a general audience
 *   doesn't know what "quality-gate.mjs" is, so `label` should be a plain-
 *   language function name ("Quality Check"), and either `logo` (a real
 *   full-color product mark, assets/logos/gilbarbara/, used large and
 *   central — use this only where it's factually true of that node, e.g.
 *   this repo's `.mjs` scripts really do run under `bun`) or `icon` (a
 *   Tabler outline mark, the fallback when no distinctive product logo
 *   applies) supplies the large primary visual above it. At most one of
 *   `logo`/`icon` renders per node — `logo` wins when both are given.
 *   `x`/`y`/`w`/`h` are always explicit, hand-placed coordinates — this
 *   file has never auto-computed a layout, so a `'zigzag'` post (see
 *   `opts.layout`) alternates each node's own `x` between two lanes by
 *   hand in its manifest, the same way a `'column'` post keeps every
 *   node's `x` identical. `note` (only rendered when `opts.layout` is
 *   `'zigzag'`) is a short annotation revealed beside the node, in
 *   whichever lane that node ISN'T occupying — see "Layout" below.
 * @param {{x:number, y:number, w:number, h:number, label:string, icon?:string}} [opts.branch]
 *   One optional off-path node (e.g. the "rejected" branch), connected from
 *   `branchFrom` with a static, muted, differently-colored dashed line —
 *   never visited by the traveling dot.
 * @param {string} [opts.branchFrom] id of the main-path node the branch leaves from.
 * @param {{label:string, icon?:string}[]} [opts.chips] Extra facts that tick
 *   on as indented sub-rows in the "Live Status" panel, right under the
 *   node at `chipsAt`, at the instant the dot arrives there — used here for
 *   "4 parallel judgments happen at once," which a single traveling dot
 *   can't show on its own. `icon` is accepted but currently unused (the
 *   panel renders every row, main or sub, as a checkmark dot + label for
 *   visual consistency down the whole list).
 * @param {string} [opts.chipsAt] id of the node the chip sub-rows nest under.
 * @param {number} [opts.loopMs] total loop duration in ms.
 * @param {string} [opts.brandBadge] Optional simple-icons name for a small
 *   real-logo badge in the scene header (e.g. 'anthropic' — this post is
 *   literally about Claude Code, so crediting the actual mark beats a
 *   generic robot icon).
 * @param {string} [opts.brandBadgeLabel] Text next to `brandBadge`.
 * @param {string|object} [opts.theme] Which visual system to render with.
 *   Either a name from the `THEMES` map above (a documented reference
 *   point), or — the normal path for a genuinely new post — a full theme
 *   object inline in that post's own manifest, merged over `blueprint`'s
 *   defaults so it only has to specify what it changes. Recognized
 *   fields: `colors` (`bg`, `bg2`, `accent`, `accent2`, `warn`, `text`,
 *   `muted`, `border`, `card`), `sceneBg`, `displayFont` (must be a
 *   family this file `@font-face`-declares — see "Typography" in
 *   CLAUDE.md before reaching for a new one), `nodeShape`
 *   (`'rounded'|'clip-corner'|'folder-tab'` — `'folder-tab'` is an actual
 *   manila-folder silhouette, `folderTabPath()`, not a rectangle with a
 *   different trim), `nodeBorderStyle` (`'solid'|'dashed'`),
 *   `stepBadgeShape` (`'circle'|'hex'|'diamond'`), `bgTexture`
 *   (`'dots'|'scan'|'paper'`), `connectorStyle` (`'straight'|'wobble'` —
 *   `'wobble'` runs the connector through an SVG `feTurbulence`/
 *   `feDisplacementMap` filter for a hand-inked look), `dotStyle`
 *   (`'glow'|'ink'` — `'ink'` swaps the smooth glow pulse for a stamp-like
 *   scale "thwack" at arrival), optional `connectorColor` (a literal CSS
 *   color overriding just the connector stroke — check this against the
 *   actual scene background by rendering, not just against --border's
 *   contrast on a node card; a color with plenty of contrast on --card
 *   can still read as nearly invisible directly on --bg/--bg-2, which is
 *   what the connector actually sits on), optional `stepBadgeTextColor`
 *   (defaults to a dark near-black, for a light-colored badge — override
 *   it for a dark accent badge), and optional `stamp: {text, rotate}` for
 *   a rotated watermark across the whole scene. Defaults to `'blueprint'`
 *   when omitted, so an existing manifest with no `theme` field is
 *   unaffected.
 * @param {'column'|'zigzag'} [opts.layout] `'column'` (the default,
 *   unchanged) is every node stacked at the same `x`, connected by
 *   straight vertical edges, with a single "Live Status" panel in the
 *   fixed dead space beside the column. `'zigzag'` is a structurally
 *   different layout, not a reskin — added after direct feedback that
 *   every flow-GIF post used the same column-plus-side-panel shape
 *   regardless of theme, and real research into flowchart/infographic
 *   layout conventions (S-curve/zigzag connectors between alternating-
 *   side nodes are a standard technique for exactly this "make a linear
 *   sequence use the full canvas width" problem). Nodes alternate
 *   between a left and a right lane (by their own hand-set `x` — this
 *   file still never computes a layout for you); connectors are smooth
 *   S-curve cubic beziers between them instead of straight lines
 *   (`bezierPath()`); each node's `note`/attached `chips` render inline
 *   in the lane it ISN'T using — the same lane its neighbor's card will
 *   occupy one row later — instead of one centralized panel, since a
 *   fixed side column has nothing to be "beside" once nodes stop sharing
 *   one x. See `content/agent-governance.flow.json` for a worked example
 *   and its lane-math comments.
 */
export function buildFlowGifHtml({
  title,
  nodes,
  branch,
  branchFrom,
  chips = [],
  chipsAt,
  loopMs = 4000,
  brandBadge,
  brandBadgeLabel,
  theme = 'blueprint',
  layout = 'column',
}) {
  const isZigzag = layout === 'zigzag';
  const base = THEMES.blueprint;
  const named = typeof theme === 'string' ? THEMES[theme] : null;
  const custom = typeof theme === 'object' && theme ? theme : null;
  const picked = named || custom || base;
  // Shallow-merge over blueprint's defaults, with a one-level-deeper merge
  // for `colors` specifically — a custom theme naming only `accent` and
  // `warn` shouldn't have to restate every other color just to avoid
  // `undefined` falling through into the generated CSS.
  const T = { ...base, ...picked, colors: { ...base.colors, ...(picked.colors || {}) } };
  const accentRgb = hexToRgbTriplet(T.colors.accent);
  const centerX = (n) => n.x + n.w / 2;

  /** A smooth S-curve cubic bezier between two vertically-separated
   * points, used for 'zigzag' layout connectors. Both control points sit
   * at the SAME y (the vertical midpoint) but at each endpoint's own x —
   * that specific choice makes the curve leave the source and arrive at
   * the target moving perfectly vertically (a horizontal tangent at the
   * control point means the path is vertical right at each endpoint),
   * which is exactly what lets the existing fixed-downward arrowhead
   * polygon keep working unmodified even though the curve itself bends
   * sideways in the middle. When x1 === x2 (the 'column' layout's every
   * node sharing one x) the two control points collapse onto the same
   * vertical line as the endpoints, so this degenerates to a visually
   * identical straight line — verified by rendering the unmodified
   * jev-claude-code.flow.json post and comparing against its pre-zigzag
   * screenshot, not assumed from the math alone. */
  function bezierPath(x1, y1, x2, y2) {
    const cy = (y1 + y2) / 2;
    return `M ${x1},${y1} C ${x1},${cy} ${x2},${cy} ${x2},${y2}`;
  }

  // Real connector segments — one per adjacent node pair, each starting a
  // few px below the source node's own bottom edge and ending a few px
  // above the target's top edge. An early version of this file used a
  // single line from the first node's center to the last node's center,
  // which ran straight through every node's body (invisible only because
  // the card fill happened to be opaque) — not how a flow-diagram
  // connector works: an edge connects two node BOUNDARIES, never passes
  // through a node's interior, and shows its direction with an arrowhead
  // at the target end. Each segment below gets exactly that, as either a
  // straight line ('column' layout) or the S-curve bezier above
  // ('zigzag') — `x1`/`x2` are carried separately (not one shared `x`)
  // specifically so 'zigzag' can connect two nodes at different lane x's.
  const EDGE_GAP = 8;
  const segments = nodes.slice(0, -1).map((n, i) => {
    const next = nodes[i + 1];
    const x1 = centerX(n);
    const x2 = centerX(next);
    const y1 = n.y + n.h + EDGE_GAP;
    const y2 = next.y - EDGE_GAP;
    const d = isZigzag ? bezierPath(x1, y1, x2, y2) : `M ${x1},${y1} L ${x2},${y2}`;
    return { x1, y1, x2, y2, d };
  });
  // One combined multi-subpath `d` string purely as the dot's
  // `offset-path` reference — CSS motion-path treats `offset-distance` as
  // continuous total length across subpaths, jumping instantly at each
  // `M`, which is exactly right here: the dot should be visible only
  // while actually traveling a connector, and disappear the instant it
  // would otherwise be "inside" a node (occluded by that node's own
  // card).
  const dotPathD = segments.map((s) => s.d).join(' ');

  // Dot travels the first 80% of the loop, then holds at the last node for
  // the remaining 20% — a deliberate pause so a viewer scrubbing the GIF
  // (or just glancing at a stopped frame) reads "arrived," not "mid-motion."
  const TRAVEL_FRACTION = 0.8;
  // Each node's arrival instant along the shared timeline — reused by the
  // dot's own travel keyframes below, the node glow pulse, and the status
  // panel's row-reveal timing, so all three stay in sync off one source
  // of truth instead of three separately-tuned numbers.
  const arrivalPct = (i) => (i / (nodes.length - 1)) * TRAVEL_FRACTION * 100;

  // Two distinct arrival treatments: the default 'glow' pulse (a soft
  // box-shadow bloom, screen/tech register) or 'ink' (a quick scale
  // "thwack" + border darken, like a rubber stamp hitting paper — no
  // glow at all, since a stamp doesn't emit light). A CSS `transform`
  // animation on an SVG element REPLACES its `transform="translate(...)"`
  // attribute rather than composing with it (this file's own documented
  // gotcha — an earlier version of the chip-positioning code hit exactly
  // this and every chip collapsed to the SVG origin). The fix used
  // elsewhere in this file is to keep the animated element on an inner
  // `<g>` separate from the positioned outer one; here, since each node's
  // translate is a fixed, known `(n.x, n.y)` rather than something
  // computed at scrub time, it's simpler to just restate that same
  // translate as the first function in every keyframe's own `transform`
  // value — the scale then composes correctly with it because both live
  // in the one CSS-driven transform, not attribute-vs-CSS.
  // `transform-box: fill-box` + `transform-origin: center` (see the CSS
  // below) make the scale grow from the card's own center rather than
  // its top-left corner, which `translate(...) scale(...)` alone would do.
  const nodePulseKeyframes = nodes
    .map((n, i) => {
      const centerPct = arrivalPct(i);
      const before = Math.max(0, centerPct - 4).toFixed(2);
      const after = Math.min(100, centerPct + 6).toFixed(2);
      if (T.dotStyle === 'ink') {
        return `
        @keyframes pulse-${n.id} {
          0%, ${before}% { transform: translate(${n.x}px, ${n.y}px) scale(1); border-color: var(--border); }
          ${centerPct.toFixed(2)}% { transform: translate(${n.x}px, ${n.y}px) scale(1.045); border-color: var(--accent); }
          ${after}%, 100% { transform: translate(${n.x}px, ${n.y}px) scale(1); border-color: var(--border); }
        }`;
      }
      return `
        @keyframes pulse-${n.id} {
          0%, ${before}% { box-shadow: 0 0 0 rgba(${accentRgb}, 0); border-color: var(--border); }
          ${centerPct.toFixed(2)}% { box-shadow: 0 0 42px 6px rgba(${accentRgb}, 0.55); border-color: var(--accent); }
          ${after}%, 100% { box-shadow: 0 0 0 rgba(${accentRgb}, 0); border-color: var(--border); }
        }`;
    })
    .join('\n');

  // The dot's own motion, eased per hop rather than one constant-velocity
  // linear stretch across the whole journey — a real flow-diagram "packet"
  // decelerates into a node and accelerates back out, it doesn't glide at
  // a fixed speed the entire way. CSS lets a `@keyframes` stop declare its
  // own `animation-timing-function`, which sets the easing curve for the
  // interval ENDING at that stop — so each node's arrival keyframe below
  // carries an ease-in-out curve for the hop leading into it.
  const travelStops = nodes
    .map((n, i) => {
      const t = arrivalPct(i).toFixed(2);
      const dist = ((i / (nodes.length - 1)) * 100).toFixed(2);
      return `${t}% { offset-distance: ${dist}%; animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1); }`;
    })
    .join('\n    ');

  const chipCount = chips.length;
  const chipNode = nodes.find((n) => n.id === chipsAt);
  const chipWindowStart = chipNode
    ? Math.max(0, arrivalPct(nodes.findIndex((n) => n.id === chipsAt)) - 6)
    : 0;

  // Icon-over-label card, not a horizontal filename pill — a general
  // LinkedIn audience doesn't know what "quality-gate.mjs" is, but a big
  // recognizable logo plus a plain-language caption underneath ("Quality
  // Check") reads the way an app icon with a name under it reads: no
  // technical vocabulary required to follow the flow. A real product
  // `logo` is the primary visual when a node has one — large, full
  // color, on its own white badge so it stays legible over the dark
  // theme regardless of the logo's own palette (the same trick the
  // reference UPI post uses: every bank mark sits on a white chip, not
  // directly on the diagram's own background). A plain `icon` (no logo)
  // is the fallback primary visual, tinted via currentColor since
  // Tabler's outline style already reads fine directly on dark.
  const LOGO_BADGE = 82;
  const LOGO_SIZE = 50;
  const ICON_SIZE = 48;
  const ICON_CENTER_Y = 12 + LOGO_BADGE / 2;
  const STEP_R = 24;

  const nodeEls = nodes
    .map((n, i) => {
      const hasLogo = Boolean(n.logo);
      const cx = n.w / 2;

      const logoEl = hasLogo
        ? `<g class="logo-mark">
            <rect x="${cx - LOGO_BADGE / 2}" y="${ICON_CENTER_Y - LOGO_BADGE / 2}" width="${LOGO_BADGE}" height="${LOGO_BADGE}" rx="20" fill="#fff" />
            ${iconAt(logoIcon(n.logo), cx - LOGO_SIZE / 2, ICON_CENTER_Y - LOGO_SIZE / 2, LOGO_SIZE, '#111')}
          </g>`
        : '';
      const iconEl = !hasLogo
        ? iconAt(icon(n.icon), cx - ICON_SIZE / 2, ICON_CENTER_Y - ICON_SIZE / 2, ICON_SIZE, 'var(--accent)')
        : '';
      // Numbered step badge, overlapping the top-left corner — this
      // pipeline genuinely is an ordered sequence, so a literal step
      // number is real structure, not decoration (see CLAUDE.md
      // artifact-design's "structure is information" principle, applied
      // here too even though this diagram isn't an Artifact page).
      const stepBadgeShape =
        T.stepBadgeShape === 'hex'
          ? `<polygon points="${hexPoints(STEP_R)}" />`
          : T.stepBadgeShape === 'diamond'
            ? `<polygon points="${diamondPoints(STEP_R * 1.15)}" />`
            : `<circle r="${STEP_R}" />`;
      const stepBadge = `
    <g class="step-badge" transform="translate(${-STEP_R * 0.4}, ${-STEP_R * 0.4})">
      ${stepBadgeShape}
      <text text-anchor="middle" dominant-baseline="middle" dy="1">${i + 1}</text>
    </g>`;
      // 'folder-tab' pushes real card content (icon/logo/label) down
      // clear of the tab silhouette at the top of the shape, otherwise
      // the icon badge's own top-left corner pokes through the tab's
      // short diagonal edge — checked by rendering, not assumed from the
      // path math alone.
      const contentYOffset = T.nodeShape === 'folder-tab' ? 14 : 0;
      const nodeShapeEl =
        T.nodeShape === 'clip-corner'
          ? `<path d="${clipCornerPath(n.w, n.h, 22)}" />`
          : T.nodeShape === 'folder-tab'
            ? `<path d="${folderTabPath(n.w, n.h)}" />`
            : `<rect width="${n.w}" height="${n.h}" rx="20" />`;
      const labelY = contentYOffset + ICON_CENTER_Y + LOGO_BADGE / 2 + (n.h - contentYOffset - (ICON_CENTER_Y + LOGO_BADGE / 2)) / 2;
      return `
    <g class="node" style="animation: pulse-${n.id} ${loopMs}ms ease infinite;"
       transform="translate(${n.x}, ${n.y})">
      ${nodeShapeEl}
      <g transform="translate(0, ${contentYOffset})">
        ${logoEl}
        ${iconEl}
      </g>
      <text x="${cx}" y="${labelY}" text-anchor="middle" dominant-baseline="middle">${esc(n.label)}</text>
      ${stepBadge}
    </g>`;
    })
    .join('\n');

  let statusKeyframes = '';
  let statusPanelEl = '';

  if (!isZigzag) {
    // 'column' layout: the original persistent "Live Status" panel — fills
    // the dead space beside the node column with content actually tied to
    // pipeline progress, not decoration: one row per node label, ticking
    // on (checkmark dot + label, popping in with a spring-like ease then
    // staying lit — same "persist once shown" rule as everything else in
    // this scene) at the exact instant the dot arrives at that step, plus
    // the four Jev judgment checks nested as indented sub-rows right under
    // the node they belong to, instead of floating separately mid-canvas
    // competing for the same space.
    const PANEL_X = 560;
    const PANEL_W = 420;
    const PANEL_Y = nodes[0].y;
    const ROW_H = 58;
    const SUB_ROW_H = 42;
    const PANEL_PAD_TOP = 70;

    let cursorY = 0;
    const statusRows = [];
    nodes.forEach((n, i) => {
      statusRows.push({ y: cursorY, label: n.label, pct: arrivalPct(i), sub: false });
      cursorY += ROW_H;
      if (n.id === chipsAt) {
        chips.forEach((c, j) => {
          const stagger = chipCount > 1 ? (6 * j) / chipCount : 0;
          statusRows.push({ y: cursorY, label: c.label, pct: chipWindowStart + stagger + 5, sub: true });
          cursorY += SUB_ROW_H;
        });
      }
    });
    const PANEL_H = cursorY + PANEL_PAD_TOP + 26;

    statusKeyframes = statusRows
      .map((row, idx) => {
        const before = Math.max(0, row.pct - 3).toFixed(2);
        const at = row.pct.toFixed(2);
        return `
        @keyframes statusRow-${idx} {
          0%, ${before}% { opacity: 0; transform: scale(0.7); }
          ${at}%, 100% { opacity: 1; transform: scale(1); }
        }`;
      })
      .join('\n');

    const statusRowEls = statusRows
      .map((row, idx) => {
        const indent = row.sub ? 30 : 0;
        const dotR = row.sub ? 5 : 7;
        const fontSize = row.sub ? 16 : 19;
        const textFill = row.sub ? 'var(--accent)' : 'var(--text)';
        return `
    <g transform="translate(${indent}, ${row.y})">
      <g class="status-row" style="animation: statusRow-${idx} ${loopMs}ms cubic-bezier(0.34, 1.56, 0.64, 1) infinite; transform-origin: 8px 0px;">
        <circle class="status-dot" cx="8" cy="0" r="${dotR}" />
        <text x="26" y="1" dominant-baseline="middle" font-size="${fontSize}" fill="${textFill}">${esc(row.label)}</text>
      </g>
    </g>`;
      })
      .join('\n');

    statusPanelEl = `
    <g transform="translate(${PANEL_X}, ${PANEL_Y})">
      <rect class="status-panel" width="${PANEL_W}" height="${PANEL_H}" rx="22" />
      <text class="status-panel-title" x="28" y="38">Live Status</text>
      <line class="status-panel-rule" x1="28" y1="54" x2="${PANEL_W - 28}" y2="54" />
      <g transform="translate(28, ${PANEL_PAD_TOP})">
        ${statusRowEls}
      </g>
    </g>`;
  } else {
    // 'zigzag' layout has no single fixed "beside the column" space — a
    // node's OWN dead space this row is the lane its NEXT-but-one neighbor
    // will occupy, so each node's annotation renders inline in that lane
    // rather than in one shared panel (see `opts.layout`'s JSDoc). Two
    // lanes only, inferred from the actual x values in use — a manifest
    // with more than two distinct node x's is a layout this file doesn't
    // know how to annotate automatically and falls back to no lane offset
    // (still renders, just without the alternating-side effect).
    const laneXs = [...new Set(nodes.map((n) => n.x))];
    const otherLaneX = (x) => (laneXs.length === 2 ? laneXs.find((lx) => lx !== x) : x);
    const NOTE_FONT = 19;
    const CHIP_ROW_H = 34;
    const NOTE_TO_CHIPS_GAP = 34;

    const rows = [];
    nodes.forEach((n, i) => {
      const laneX = otherLaneX(n.x);
      let y = n.y;
      if (n.note) {
        rows.push({ x: laneX, y, label: n.note, pct: arrivalPct(i), sub: false });
        y += NOTE_TO_CHIPS_GAP;
      }
      if (n.id === chipsAt) {
        chips.forEach((c, j) => {
          const stagger = chipCount > 1 ? (6 * j) / chipCount : 0;
          rows.push({ x: laneX, y: y + j * CHIP_ROW_H, label: c.label, pct: chipWindowStart + stagger + 5, sub: true });
        });
      }
    });

    statusKeyframes = rows
      .map((row, idx) => {
        const before = Math.max(0, row.pct - 3).toFixed(2);
        const at = row.pct.toFixed(2);
        return `
        @keyframes statusRow-${idx} {
          0%, ${before}% { opacity: 0; transform: scale(0.7); }
          ${at}%, 100% { opacity: 1; transform: scale(1); }
        }`;
      })
      .join('\n');

    statusPanelEl = rows
      .map((row, idx) => {
        const dotR = row.sub ? 5 : 7;
        const fontSize = row.sub ? 16 : NOTE_FONT;
        const textFill = row.sub ? 'var(--accent)' : 'var(--text)';
        return `
    <g transform="translate(${row.x}, ${row.y})">
      <g class="status-row" style="animation: statusRow-${idx} ${loopMs}ms cubic-bezier(0.34, 1.56, 0.64, 1) infinite; transform-origin: 8px 0px;">
        <circle class="status-dot" cx="8" cy="0" r="${dotR}" />
        <text x="26" y="1" dominant-baseline="middle" font-size="${fontSize}" fill="${textFill}">${esc(row.label)}</text>
      </g>
    </g>`;
      })
      .join('\n');
  }

  const branchPath =
    branch && branchFrom
      ? (() => {
          const from = nodes.find((n) => n.id === branchFrom);
          // 'column' layout puts the branch off to the side, so the line
          // leaves from the source node's right edge (as it always has).
          // 'zigzag' has no fixed "side" — this file's own zigzag posts
          // place the branch directly below its source in the SAME lane
          // (see content/agent-governance.flow.json's coordinate-planning
          // comment), so the line reads better leaving from the bottom
          // edge, the same edge every main-path connector already uses.
          const fx = isZigzag ? from.x + from.w / 2 : from.x + from.w;
          const fy = isZigzag ? from.y + from.h : from.y + from.h / 2;
          const bx = branch.x + (isZigzag ? branch.w / 2 : 0);
          const by = branch.y + (isZigzag ? 0 : branch.h / 2);
          // Arrowhead at the branch end, oriented along the actual line
          // direction (this connector is diagonal, unlike the vertical
          // main-path segments, so the triangle needs real rotation math
          // rather than a fixed downward shape).
          const dx = bx - fx;
          const dy = by - fy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const ARROW_LEN = 14;
          const ARROW_W = 8;
          const tipX = bx;
          const tipY = by;
          const baseX = tipX - ux * ARROW_LEN;
          const baseY = tipY - uy * ARROW_LEN;
          const perpX = -uy * ARROW_W;
          const perpY = ux * ARROW_W;
          const branchArrow = `<polygon class="branch-arrow" points="${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}" />`;
          const hasIcon = Boolean(branch.icon);
          const BRANCH_ICON = 34;
          const BRANCH_PAD = 22;
          const textX = hasIcon ? BRANCH_PAD * 2 + BRANCH_ICON : branch.w / 2;
          const textAnchor = hasIcon ? 'start' : 'middle';
          const iconEl = hasIcon
            ? iconAt(icon(branch.icon), BRANCH_PAD, branch.h / 2 - BRANCH_ICON / 2, BRANCH_ICON, 'var(--warn)')
            : '';
          const branchShapeEl =
            T.nodeShape === 'clip-corner'
              ? `<path d="${clipCornerPath(branch.w, branch.h, 16)}" />`
              : `<rect width="${branch.w}" height="${branch.h}" rx="16" />`;
          return `
    <path class="branch-line" d="M ${fx},${fy} L ${bx},${by}" />
    ${branchArrow}
    <g class="branch-node" transform="translate(${branch.x}, ${branch.y})">
      ${branchShapeEl}
      ${iconEl}
      <text x="${textX}" y="${branch.h / 2}" text-anchor="${textAnchor}" dominant-baseline="middle">${esc(branch.label)}</text>
    </g>`;
        })()
      : '';

  const brandBadgeEl = brandBadge
    ? `<div class="brand-badge">
        <span class="brand-badge-icon">${brandIcon(brandBadge)}</span>
        ${brandBadgeLabel ? `<span>${esc(brandBadgeLabel)}</span>` : ''}
      </div>`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @font-face {
    font-family: 'Space Grotesk';
    src: url('../../assets/fonts/space-grotesk/space-grotesk-latin-700-normal.woff2') format('woff2');
    font-weight: 700; font-display: block;
  }
  @font-face {
    font-family: 'Poppins';
    src: url('../../assets/fonts/poppins/poppins-latin-800-normal.woff2') format('woff2');
    font-weight: 800; font-display: block;
  }
  @font-face {
    font-family: 'Inter';
    src: url('../../assets/fonts/inter/inter-latin-600-normal.woff2') format('woff2');
    font-weight: 600; font-display: block;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('../../assets/fonts/jetbrains-mono/jetbrains-mono-latin-600-normal.woff2') format('woff2');
    font-weight: 600; font-display: block;
  }

  :root {
    --bg: ${T.colors.bg};
    --bg-2: ${T.colors.bg2};
    --accent: ${T.colors.accent};
    --accent-2: ${T.colors.accent2};
    --warn: ${T.colors.warn};
    --text: ${T.colors.text};
    --muted: ${T.colors.muted};
    --border: ${T.colors.border};
    --card: ${T.colors.card};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${T.sceneBg}; }
  .scene {
    position: relative;
    width: ${PAGE_W}px;
    height: ${PAGE_H}px;
    overflow: hidden;
    background: radial-gradient(circle at 18% 8%, var(--bg-2), var(--bg) 60%);
    font-family: 'Inter', sans-serif;
    color: var(--text);
  }
  .bg-dots {
    position: absolute; inset: 0; z-index: 0;
    background-image: radial-gradient(circle, rgba(148,172,214,0.14) 1.6px, transparent 1.6px);
    background-size: 28px 28px;
    opacity: 0.5;
  }
  /* "Audit" theme's background texture: a fine amber grid (evokes a
     control-panel/checkpoint readout, distinct from Blueprint's soft
     dot-grid) plus a slow radar-sweep wedge — a genuinely different
     motion language, not just a recolor, per video-generator's "the kind
     of background motion should differ, not just its color" rule. Real
     motion driven purely by a CSS @keyframes rotation, so it scrubs
     deterministically via the same Web Animations API trick as every
     other animated element in this scene. */
  .bg-scan-grid {
    position: absolute; inset: 0; z-index: 0;
    background-image:
      linear-gradient(rgba(232,163,61,0.10) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,163,61,0.10) 1px, transparent 1px);
    background-size: 54px 54px;
    opacity: 0.6;
  }
  .bg-scan-sweep {
    position: absolute; z-index: 0;
    width: 1900px; height: 1900px;
    top: 50%; left: 50%;
    margin: -950px 0 0 -950px;
    background: conic-gradient(from 0deg, rgba(232,163,61,0.16), transparent 22%, transparent 100%);
    animation: sweep 6000ms linear infinite;
    opacity: 0.7;
  }
  @keyframes sweep { to { transform: rotate(360deg); } }
  /* "Dossier" theme's background: a coarse diagonal fiber hatch (fake
     paper grain) plus a vignette darkening the edges, the way a
     photocopied or aged document actually looks. Fully static — a paper
     texture has no reason to move, unlike the other two themes'
     backgrounds.
     Gotcha: the first version of this hatch used a 3-4px repeat (a real
     fine-paper-fiber look on a still PNG) and produced a genuinely huge
     GIF — 63MB at 30fps, still 38MB even dropped to 18fps — because a
     near-continuous few-pixels-apart pattern across the WHOLE 1080x1350
     canvas defeats a palette-based GIF encoder's frame compression on
     literally every frame, dwarfing frame-count as the size driver
     entirely (a fps drop barely moved the number). Not a bug in
     scripts/gif.mjs — the same "flat, low-contrast regions compress
     better" lesson CLAUDE.md already documents for MP4 palette choice in
     video-generator, just far more extreme for GIF's 256-color LZW
     encoding. Fix: widen the repeat to the same order of magnitude as
     Blueprint's own dot-grid texture (28px, which never had this
     problem) — still reads as "paper" at this resolution, and the actual
     shipped file dropped to a normal size once widened. Caught only by
     rendering the real GIF and checking its file size, not by looking at
     a single still frame, which can't show a compression problem at all. */
  .bg-paper {
    position: absolute; inset: 0; z-index: 0;
    /* No hatch layer at all, in the end — even a single 40px-spaced
       repeating-gradient still measured ~10MB heavier than a plain
       vignette on this scene (23MB vs 12.8MB at identical 30fps/duration,
       isolated by re-rendering with the hatch layer stripped out via a
       throwaway test HTML). A vignette alone is one smooth radial
       gradient — cheap for a palette-based GIF encoder — and still reads
       as "aged paper" at this resolution; the fiber-hatch realism wasn't
       worth 10MB of file size for a LinkedIn upload. */
    background-image:
      radial-gradient(ellipse 900px 1300px at 50% 45%, transparent 55%, rgba(43,38,32,0.22) 100%);
  }
  /* A rotated watermark stamp across the whole scene — pointer-events:
     none, low opacity, sitting above the diagram but never blocking
     legibility of anything under it. Only rendered when a theme sets
     the stamp field. */
  .stamp {
    position: absolute; z-index: 3; pointer-events: none;
    top: 46%; left: 50%;
    transform: translate(-50%, -50%) rotate(${T.stamp ? T.stamp.rotate : 0}deg);
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700; font-size: 96px; letter-spacing: 0.12em;
    color: var(--accent);
    opacity: 0.16;
    border: 6px double var(--accent);
    padding: 18px 40px;
    white-space: nowrap;
  }
  h1 {
    position: relative; z-index: 2;
    font-family: '${T.displayFont}', sans-serif;
    font-size: 44px; font-weight: ${DISPLAY_FONT_WEIGHTS[T.displayFont] || 700}; line-height: 1.15;
    margin: 20px 72px 0 72px;
  }
  /* In normal flow, above the title, not absolutely positioned beside
     it — an overlay badge collided with the title text once the title
     wrapped to two lines; height varies with title length, so sizing an
     absolute badge to dodge it reliably isn't worth it when flow does
     it for free. */
  .brand-badge {
    position: relative; z-index: 2;
    display: inline-flex; align-items: center; gap: 10px;
    margin: 56px 0 0 72px;
    padding: 12px 20px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 17px; font-weight: 600;
    color: var(--muted);
  }
  .brand-badge-icon { width: 26px; height: 26px; display: block; color: var(--text); }
  .brand-badge-icon svg { width: 26px; height: 26px; display: block; fill: currentColor; }

  /* Absolutely positioned, not flowed after <h1> — otherwise the title's
     own flow height pushes every node coordinate down by that much,
     silently clipping the last node off the bottom of the canvas. */
  svg.diagram { position: absolute; top: 0; left: 0; z-index: 1; display: block; }

  .spine {
    /* Connector color defaults to --border, which is fine sitting on a
       node card's own (brighter, more opaque) --card fill, but reads as
       nearly invisible on a raw, already-textured scene background — a
       real contrast bug found only by rendering, not by reading this
       rule (the "dossier" theme's paper background + a 35%-opacity
       ink-brown border color combine to almost nothing). connectorColor
       lets a theme override just this stroke without touching --border
       everywhere else it's used (node/panel borders, which DID have
       enough contrast against their own card fill). */
    fill: none; stroke: ${T.connectorColor || 'var(--border)'}; stroke-width: 4;
    stroke-dasharray: 10 10;
    animation: march 1400ms linear infinite;
    ${T.connectorStyle === 'wobble' ? "filter: url('#inkWobble');" : ''}
  }
  @keyframes march { to { stroke-dashoffset: -400; } }
  .spine-arrow { fill: ${T.connectorColor || 'var(--border)'}; }

  .dot {
    fill: var(--accent);
    filter: ${T.dotStyle === 'ink' ? 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))' : `drop-shadow(0 0 10px rgba(${accentRgb}, 0.9))`};
    offset-path: path('${dotPathD}');
    animation: travel ${loopMs}ms linear infinite;
  }
  /* Eased per hop (see travelStops above), not one constant-velocity
     linear stretch across the whole journey — decelerating into each
     node and accelerating back out, the way an actual flow-diagram
     "packet" moves rather than gliding at a fixed speed throughout. */
  @keyframes travel {
    ${travelStops}
    100% { offset-distance: 100%; }
  }

  .node { transform-box: fill-box; transform-origin: center; }
  .node rect, .node > path {
    fill: var(--card);
    stroke: var(--border);
    stroke-width: 2;
    stroke-dasharray: ${T.nodeBorderStyle === 'dashed' ? '7 5' : 'none'};
    transition: none;
  }
  .node text {
    fill: var(--text);
    font-family: 'Inter', sans-serif;
    font-size: 26px;
    font-weight: 600;
  }
  /* Real, full-color product logos (Bun, Playwright) are the node's
     PRIMARY visual, large and central — full opacity, on their own
     white badge (matching the reference post: every bank mark there
     sits on a white chip so it stays legible regardless of the
     diagram's own background color). */
  .node .logo-mark { opacity: 1; }
  .node .logo-mark rect { filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35)); }
  .step-badge circle, .step-badge polygon { fill: var(--accent); }
  .step-badge text {
    fill: ${T.stepBadgeTextColor || '#04231f'};
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 700;
  }
  ${nodePulseKeyframes}

  .status-panel { fill: var(--card); stroke: var(--border); stroke-width: 2; }
  .status-panel-title {
    fill: var(--text); font-family: 'Space Grotesk', sans-serif;
    font-size: 20px; font-weight: 700;
  }
  .status-panel-rule { stroke: var(--border); stroke-width: 1; }
  .status-row text { font-family: 'Inter', sans-serif; font-weight: 600; }
  .status-dot { fill: var(--accent); }
  ${statusKeyframes}

  .branch-line {
    fill: none; stroke: var(--warn); stroke-width: 3;
    stroke-dasharray: 8 8; opacity: 0.55;
    animation: march-branch 2200ms linear infinite;
  }
  @keyframes march-branch { to { stroke-dashoffset: -320; } }
  .branch-arrow { fill: var(--warn); opacity: 0.7; }
  .branch-node rect, .branch-node > path { fill: rgba(255, 180, 84, 0.08); stroke: var(--warn); stroke-width: 2; stroke-dasharray: 5 5; }
  .branch-node text { fill: var(--warn); font-family: 'Inter', sans-serif; font-size: 19px; font-weight: 600; }
</style>
</head>
<body>
  <div class="scene">
    ${T.bgTexture === 'scan' ? '<div class="bg-scan-grid"></div><div class="bg-scan-sweep"></div>' : T.bgTexture === 'paper' ? '<div class="bg-paper"></div>' : '<div class="bg-dots"></div>'}
    ${T.stamp ? `<div class="stamp">${esc(T.stamp.text)}</div>` : ''}
    ${brandBadgeEl}
    <h1>${esc(title)}</h1>
    <svg class="diagram" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">
      <defs>
        <!-- x/y/width/height are huge percentages, not the usual small
             pad, because each connector segment's own bounding box is
             tiny (a few px wide, since it's a near-vertical line) — the
             default filter region (a modest percentage OF THAT tiny
             bbox) clipped almost the entire displaced/turbulent stroke
             out of the rendered output, making the wobbled line nearly
             invisible. Caught by rendering and looking, not by reading
             the filter markup — see CLAUDE.md's "Verify visually" rule. -->
        <filter id="inkWobble" x="-300%" y="-100%" width="700%" height="300%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      ${segments
        .map(
          (s) => `
      <path class="spine" d="${s.d}" />
      <polygon class="spine-arrow" points="${s.x2 - 8},${s.y2 - 12} ${s.x2 + 8},${s.y2 - 12} ${s.x2},${s.y2}" />`
        )
        .join('\n')}
      ${branchPath}
      <circle class="dot" r="14" />
      ${nodeEls}
      ${statusPanelEl}
    </svg>
  </div>
</body>
</html>`;
}
