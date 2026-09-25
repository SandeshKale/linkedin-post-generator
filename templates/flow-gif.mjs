// Builds a standalone, self-contained HTML "scene" for an animated flow
// diagram — the GIF-post sibling of templates/carousel.mjs's static
// <section class="slide"> pages. Reuses the same Blueprint theme tokens and
// vendored fonts so a GIF post and a carousel post from this repo read as
// the same brand, but this file's whole reason to exist is the opposite of
// carousel.mjs's contract: everything in here is a real, running CSS
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
 * currentColor (Tabler's stroke, or a brand mark forced via the
 * `.brand-mark svg { fill: currentColor }` rule below). */
function iconAt(svg, x, y, size, colorVar) {
  return `<g transform="translate(${x}, ${y})" style="color: ${colorVar};">${sizedIcon(svg, size)}</g>`;
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {{id:string, x:number, y:number, w:number, h:number, label:string, icon?:string, brand?:string, logo?:string}[]} opts.nodes
 *   Main-path nodes, in travel order — the traveling dot visits them in
 *   array order, evenly spaced across the first 80% of `loopMs`. `icon` is
 *   a Tabler name (assets/icons/tabler/), rendered as a left-aligned badge
 *   inside the node. `brand` (assets/icons/simple-icons/, flat single
 *   color) or `logo` (assets/logos/gilbarbara/, real full color — use this
 *   one when the exact tool has a distinctive multi-color mark, e.g. Bun
 *   or Playwright) render small in the node's bottom-right corner — use
 *   either only where it's factually true of that node (e.g. this repo's
 *   `.mjs` scripts really do run under `bun`, and `render.mjs` really does
 *   drive Playwright), never as decoration. At most one of `brand`/`logo`
 *   per node.
 * @param {{x:number, y:number, w:number, h:number, label:string, icon?:string}} [opts.branch]
 *   One optional off-path node (e.g. the "rejected" branch), connected from
 *   `branchFrom` with a static, muted, differently-colored dashed line —
 *   never visited by the traveling dot.
 * @param {string} [opts.branchFrom] id of the main-path node the branch leaves from.
 * @param {{label:string, icon?:string}[]} [opts.chips] Small labels that fade
 *   in/out around the node at `chipsAt` while the dot dwells there — used
 *   here for "4 parallel judgments happen at once," which a single
 *   traveling dot can't show on its own.
 * @param {string} [opts.chipsAt] id of the node the chips cluster around.
 * @param {number} [opts.loopMs] total loop duration in ms.
 * @param {string} [opts.brandBadge] Optional simple-icons name for a small
 *   real-logo badge in the scene header (e.g. 'anthropic' — this post is
 *   literally about Claude Code, so crediting the actual mark beats a
 *   generic robot icon).
 * @param {string} [opts.brandBadgeLabel] Text next to `brandBadge`.
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
}) {
  const centerX = (n) => n.x + n.w / 2;
  const lineX = centerX(nodes[0]);

  // Real connector segments — one per adjacent node pair, each starting a
  // few px below the source node's own bottom edge and ending a few px
  // above the target's top edge. The earlier version used a single line
  // from the first node's center to the last node's center, which ran
  // straight through every node's body (invisible only because the card
  // fill happened to be opaque) — not how a flow-diagram connector works:
  // an edge connects two node BOUNDARIES, never passes through a node's
  // interior, and shows its direction with an arrowhead at the target
  // end. Each segment below gets exactly that.
  const EDGE_GAP = 10;
  const segments = nodes.slice(0, -1).map((n, i) => {
    const next = nodes[i + 1];
    return { x: lineX, y1: n.y + n.h + EDGE_GAP, y2: next.y - EDGE_GAP };
  });
  // One combined multi-subpath `d` string ("M x,y1 L x,y2 M x,y1 L x,y2 …")
  // purely as the dot's `offset-path` reference — CSS motion-path treats
  // `offset-distance` as continuous total length across subpaths, jumping
  // instantly at each `M`, which is exactly right here: the dot should be
  // visible only while actually traveling a connector, and disappear the
  // instant it would otherwise be "inside" a node (occluded by that
  // node's own card, same as before, just geometrically honest now).
  const dotPathD = segments.map((s) => `M ${s.x},${s.y1} L ${s.x},${s.y2}`).join(' ');

  // Dot travels the first 80% of the loop, then holds at the last node for
  // the remaining 20% — a deliberate pause so a viewer scrubbing the GIF
  // (or just glancing at a stopped frame) reads "arrived," not "mid-motion."
  const TRAVEL_FRACTION = 0.8;
  const nodePulseKeyframes = nodes
    .map((n, i) => {
      const centerPct = (i / (nodes.length - 1)) * TRAVEL_FRACTION * 100;
      const before = Math.max(0, centerPct - 4).toFixed(2);
      const after = Math.min(100, centerPct + 6).toFixed(2);
      return `
        @keyframes pulse-${n.id} {
          0%, ${before}% { box-shadow: 0 0 0 rgba(63, 208, 201, 0); border-color: var(--border); }
          ${centerPct.toFixed(2)}% { box-shadow: 0 0 42px 6px rgba(63, 208, 201, 0.55); border-color: var(--accent); }
          ${after}%, 100% { box-shadow: 0 0 0 rgba(63, 208, 201, 0); border-color: var(--border); }
        }`;
    })
    .join('\n');

  const chipCount = chips.length;
  const chipNode = nodes.find((n) => n.id === chipsAt);
  const chipCenterPct = chipNode
    ? (nodes.findIndex((n) => n.id === chipsAt) / (nodes.length - 1)) * TRAVEL_FRACTION * 100
    : 0;
  const chipWindowStart = Math.max(0, chipCenterPct - 6);
  const CHIP_W = 250;
  const CHIP_H = 40;
  // Chips enter once, staggered, then STAY on screen for the rest of the
  // loop instead of fading back out — they represent the four judgments
  // Jev actually returns, which remain true for the rest of the pipeline
  // run, not just the instant the dot passes through. "Stay but keep
  // moving" is a gentle continuous bob after the entrance settles, each
  // chip on its own phase/period so they don't move in lockstep — cheap
  // motion via `sin()` in the keyframe math below, real per-chip
  // keyframes since CSS animations can't compute this at runtime.
  const chipKeyframes = chips
    .map((_, i) => {
      const stagger = chipCount > 1 ? (6 * i) / chipCount : 0;
      const inAt = (chipWindowStart + stagger).toFixed(2);
      const settleAt = (chipWindowStart + stagger + 5).toFixed(2);
      // Idle bob: 5 evenly-spaced stops from settle to loop end, each
      // chip's phase offset by its index so the row doesn't bob in unison.
      const bobStops = 6;
      const phase = (i / Math.max(1, chipCount)) * Math.PI * 2;
      const idle = Array.from({ length: bobStops }, (_, s) => {
        const t = Number(settleAt) + ((100 - Number(settleAt)) * (s + 1)) / bobStops;
        const y = Math.sin(phase + (s + 1) * 1.1) * 3.5;
        return `${t.toFixed(2)}% { opacity: 1; transform: translateY(${y.toFixed(2)}px) scale(1); }`;
      }).join('\n          ');
      return `
        @keyframes chip-${i} {
          0%, ${inAt}% { opacity: 0; transform: translateY(6px) scale(0.9); }
          ${settleAt}% { opacity: 1; transform: translateY(0) scale(1); }
          ${idle}
        }`;
    })
    .join('\n');

  // A real product `logo` is the PRIMARY visual on a node that has one —
  // large, full color, on its own white badge so it stays legible over
  // the dark theme regardless of the logo's own palette (the same trick
  // the reference UPI post uses: every bank mark sits on a white chip,
  // not directly on the diagram's own background). A plain `icon` (no
  // logo) is the fallback primary visual, smaller, tinted via
  // currentColor since Tabler's outline style already reads fine
  // directly on dark. `brand` stays a small secondary corner credit for
  // cases that don't warrant the full badge treatment.
  const LOGO_BADGE = 72;
  const LOGO_SIZE = 46;
  const ICON_SIZE = 38;
  const PAD = 22;
  const BRAND_SIZE = 20;
  const STEP_R = 22;

  const nodeEls = nodes
    .map((n, i) => {
      const hasLogo = Boolean(n.logo);
      const hasIcon = Boolean(n.icon) && !hasLogo;
      const textX = hasLogo ? PAD * 2 + LOGO_BADGE : hasIcon ? PAD * 2 + ICON_SIZE : n.w / 2;
      const textAnchor = hasLogo || hasIcon ? 'start' : 'middle';

      const logoEl = hasLogo
        ? `<g class="logo-mark">
            <rect x="${PAD}" y="${n.h / 2 - LOGO_BADGE / 2}" width="${LOGO_BADGE}" height="${LOGO_BADGE}" rx="16" fill="#fff" />
            ${iconAt(logoIcon(n.logo), PAD + (LOGO_BADGE - LOGO_SIZE) / 2, n.h / 2 - LOGO_SIZE / 2, LOGO_SIZE, '#111')}
          </g>`
        : '';
      const iconEl = hasIcon ? iconAt(icon(n.icon), PAD, n.h / 2 - ICON_SIZE / 2, ICON_SIZE, 'var(--accent)') : '';
      const brandEl = n.brand
        ? `<g class="brand-mark">${iconAt(
            brandIcon(n.brand),
            n.w - BRAND_SIZE - 16,
            n.h - BRAND_SIZE - 14,
            BRAND_SIZE,
            'var(--muted)'
          )}</g>`
        : '';
      // Numbered step badge, overlapping the top-left corner — this
      // pipeline genuinely is an ordered sequence, so a literal step
      // number is real structure, not decoration (see CLAUDE.md
      // artifact-design's "structure is information" principle, applied
      // here too even though this diagram isn't an Artifact page).
      const stepBadge = `
    <g class="step-badge" transform="translate(${-STEP_R * 0.4}, ${-STEP_R * 0.4})">
      <circle r="${STEP_R}" />
      <text text-anchor="middle" dominant-baseline="middle" dy="1">${i + 1}</text>
    </g>`;
      return `
    <g class="node" style="animation: pulse-${n.id} ${loopMs}ms linear infinite;"
       transform="translate(${n.x}, ${n.y})">
      <rect width="${n.w}" height="${n.h}" rx="18" />
      ${logoEl}
      ${iconEl}
      <text x="${textX}" y="${n.h / 2}" text-anchor="${textAnchor}" dominant-baseline="middle">${esc(n.label)}</text>
      ${brandEl}
      ${stepBadge}
    </g>`;
    })
    .join('\n');

  const chipEls = chips
    .map((c, i) => {
      const cx = chipNode ? chipNode.x + chipNode.w + 36 : 0;
      const cy = chipNode ? chipNode.y + i * 50 - ((chipCount - 1) * 50) / 2 + chipNode.h / 2 - CHIP_H / 2 : 0;
      const hasIcon = Boolean(c.icon);
      const chipIconSize = 18;
      const textX = hasIcon ? chipIconSize + 20 : 16;
      const chipIconEl = hasIcon ? iconAt(icon(c.icon), 12, CHIP_H / 2 - chipIconSize / 2, chipIconSize, 'var(--accent)') : '';
      // Two nested groups on purpose: a CSS `transform` animation (below)
      // completely replaces an element's SVG transform attribute rather than
      // composing with it, so the position translate lives on an outer,
      // unanimated <g> and only the inner one gets the fade/scale keyframes.
      return `
    <g transform="translate(${cx}, ${cy})">
      <g class="chip" style="animation: chip-${i} ${loopMs}ms linear infinite;">
        <rect width="${CHIP_W}" height="${CHIP_H}" rx="${CHIP_H / 2}" />
        ${chipIconEl}
        <text x="${textX}" y="${CHIP_H / 2}" dominant-baseline="middle">${esc(c.label)}</text>
      </g>
    </g>`;
    })
    .join('\n');

  const branchPath =
    branch && branchFrom
      ? (() => {
          const from = nodes.find((n) => n.id === branchFrom);
          const fx = from.x + from.w;
          const fy = from.y + from.h / 2;
          const bx = branch.x;
          const by = branch.y + branch.h / 2;
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
          return `
    <path class="branch-line" d="M ${fx},${fy} L ${bx},${by}" />
    ${branchArrow}
    <g class="branch-node" transform="translate(${branch.x}, ${branch.y})">
      <rect width="${branch.w}" height="${branch.h}" rx="16" />
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
    --bg: #0b1220;
    --bg-2: #101a2c;
    --accent: #3fd0c9;
    --accent-2: #6c8bff;
    --warn: #ffb454;
    --text: #eef2f8;
    --muted: #93a1bb;
    --border: rgba(148, 172, 214, 0.30);
    --card: rgba(255, 255, 255, 0.05);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #05070c; }
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
  h1 {
    position: relative; z-index: 2;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 44px; font-weight: 700; line-height: 1.15;
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
    fill: none; stroke: var(--border); stroke-width: 4;
    stroke-dasharray: 10 10;
    animation: march 1400ms linear infinite;
  }
  @keyframes march { to { stroke-dashoffset: -400; } }
  .spine-arrow { fill: var(--border); }

  .dot {
    fill: var(--accent);
    filter: drop-shadow(0 0 10px rgba(63, 208, 201, 0.9));
    offset-path: path('${dotPathD}');
    animation: travel ${loopMs}ms linear infinite;
  }
  @keyframes travel {
    0% { offset-distance: 0%; }
    ${(TRAVEL_FRACTION * 100).toFixed(2)}% { offset-distance: 100%; }
    100% { offset-distance: 100%; }
  }

  .node rect {
    fill: var(--card);
    stroke: var(--border);
    stroke-width: 2;
    transition: none;
  }
  .node text {
    fill: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 27px;
    font-weight: 600;
  }
  .node .brand-mark { opacity: 0.5; }
  .node .brand-mark svg { fill: currentColor; }
  /* Real, full-color product logos (Bun, Playwright) are the node's
     PRIMARY visual, not a corner accent — full opacity, on their own
     white badge (matching the reference post: every bank mark there
     sits on a white chip so it stays legible regardless of the
     diagram's own background color). */
  .node .logo-mark { opacity: 1; }
  .node .logo-mark rect { filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35)); }
  .step-badge circle { fill: var(--accent); }
  .step-badge text {
    fill: #04231f;
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 700;
  }
  ${nodePulseKeyframes}

  .chip rect { fill: rgba(63, 208, 201, 0.12); stroke: var(--accent); stroke-width: 1.5; }
  .chip text { fill: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 600; }
  ${chipKeyframes}

  .branch-line {
    fill: none; stroke: var(--warn); stroke-width: 3;
    stroke-dasharray: 8 8; opacity: 0.55;
    animation: march-branch 2200ms linear infinite;
  }
  @keyframes march-branch { to { stroke-dashoffset: -320; } }
  .branch-arrow { fill: var(--warn); opacity: 0.7; }
  .branch-node rect { fill: rgba(255, 180, 84, 0.08); stroke: var(--warn); stroke-width: 2; stroke-dasharray: 5 5; }
  .branch-node text { fill: var(--warn); font-family: 'JetBrains Mono', monospace; font-size: 19px; font-weight: 600; }
</style>
</head>
<body>
  <div class="scene">
    <div class="bg-dots"></div>
    ${brandBadgeEl}
    <h1>${esc(title)}</h1>
    <svg class="diagram" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">
      ${segments
        .map(
          (s) => `
      <path class="spine" d="M ${s.x},${s.y1} L ${s.x},${s.y2}" />
      <polygon class="spine-arrow" points="${s.x - 8},${s.y2 - 12} ${s.x + 8},${s.y2 - 12} ${s.x},${s.y2}" />`
        )
        .join('\n')}
      ${branchPath}
      <circle class="dot" r="14" />
      ${nodeEls}
      ${chipEls}
    </svg>
  </div>
</body>
</html>`;
}
