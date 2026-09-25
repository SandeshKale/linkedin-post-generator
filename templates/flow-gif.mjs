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
const PAGE_W = 1080;
const PAGE_H = 1350;

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {{id:string, x:number, y:number, w:number, h:number, label:string}[]} opts.nodes
 *   Main-path nodes, in travel order — the traveling dot visits them in
 *   array order, evenly spaced across the first 80% of `loopMs`.
 * @param {{x:number, y:number, w:number, h:number, label:string}} [opts.branch]
 *   One optional off-path node (e.g. the "rejected" branch), connected from
 *   `branchFrom` with a static, muted, differently-colored dashed line —
 *   never visited by the traveling dot.
 * @param {string} [opts.branchFrom] id of the main-path node the branch leaves from.
 * @param {{label:string}[]} [opts.chips] Small labels that fade in/out around
 *   the node at `chipsAt` while the dot dwells there — used here for "4
 *   parallel judgments happen at once," which a single traveling dot can't
 *   show on its own.
 * @param {string} [opts.chipsAt] id of the node the chips cluster around.
 * @param {number} [opts.loopMs] total loop duration in ms.
 */
export function buildFlowGifHtml({ title, nodes, branch, branchFrom, chips = [], chipsAt, loopMs = 4000 }) {
  const centerX = (n) => n.x + n.w / 2;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const lineX = centerX(first);
  const lineTop = first.y + first.h / 2;
  const lineBottom = last.y + last.h / 2;

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
  const chipWindowEnd = Math.min(100, chipCenterPct + 10);
  const chipKeyframes = chips
    .map((_, i) => {
      const span = chipWindowEnd - chipWindowStart;
      const stagger = chipCount > 1 ? (span * 0.5 * i) / chipCount : 0;
      const inAt = (chipWindowStart + stagger).toFixed(2);
      const peakAt = (chipWindowStart + stagger + span * 0.22).toFixed(2);
      const outAt = Math.min(100, chipWindowEnd + stagger).toFixed(2);
      return `
        @keyframes chip-${i} {
          0%, ${inAt}% { opacity: 0; transform: translateY(6px) scale(0.9); }
          ${peakAt}% { opacity: 1; transform: translateY(0) scale(1); }
          ${outAt}%, 100% { opacity: 0; transform: translateY(-4px) scale(0.9); }
        }`;
    })
    .join('\n');

  const nodeEls = nodes
    .map(
      (n) => `
    <g class="node" style="animation: pulse-${n.id} ${loopMs}ms linear infinite;"
       transform="translate(${n.x}, ${n.y})">
      <rect width="${n.w}" height="${n.h}" rx="18" />
      <text x="${n.w / 2}" y="${n.h / 2}" text-anchor="middle" dominant-baseline="middle">${esc(n.label)}</text>
    </g>`
    )
    .join('\n');

  const chipEls = chips
    .map((c, i) => {
      const cx = chipNode ? chipNode.x + chipNode.w + 36 : 0;
      const cy = chipNode ? chipNode.y + i * 46 - (chipCount - 1) * 23 + chipNode.h / 2 : 0;
      // Two nested groups on purpose: a CSS \`transform\` animation (below)
      // completely replaces an element's SVG transform attribute rather than
      // composing with it, so the position translate lives on an outer,
      // unanimated <g> and only the inner one gets the fade/scale keyframes.
      return `
    <g transform="translate(${cx}, ${cy})">
      <g class="chip" style="animation: chip-${i} ${loopMs}ms linear infinite;">
        <rect width="220" height="36" rx="18" />
        <text x="16" y="18" dominant-baseline="middle">${esc(c.label)}</text>
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
          return `
    <path class="branch-line" d="M ${fx},${fy} L ${bx},${by}" />
    <g class="branch-node" transform="translate(${branch.x}, ${branch.y})">
      <rect width="${branch.w}" height="${branch.h}" rx="16" />
      <text x="${branch.w / 2}" y="${branch.h / 2}" text-anchor="middle" dominant-baseline="middle">${esc(branch.label)}</text>
    </g>`;
        })()
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
    margin: 72px 72px 0 72px;
  }

  /* Absolutely positioned, not flowed after <h1> — otherwise the title's
     own flow height pushes every node coordinate down by that much,
     silently clipping the last node off the bottom of the canvas. */
  svg { position: absolute; top: 0; left: 0; z-index: 1; display: block; }

  .spine {
    fill: none; stroke: var(--border); stroke-width: 4;
    stroke-dasharray: 10 10;
    animation: march 1400ms linear infinite;
  }
  @keyframes march { to { stroke-dashoffset: -400; } }

  .dot {
    fill: var(--accent);
    filter: drop-shadow(0 0 10px rgba(63, 208, 201, 0.9));
    offset-path: path('M ${lineX},${lineTop} L ${lineX},${lineBottom}');
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
    font-size: 22px;
    font-weight: 600;
  }
  ${nodePulseKeyframes}

  .chip rect { fill: rgba(63, 208, 201, 0.12); stroke: var(--accent); stroke-width: 1.5; }
  .chip text { fill: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 600; }
  ${chipKeyframes}

  .branch-line {
    fill: none; stroke: var(--warn); stroke-width: 3;
    stroke-dasharray: 8 8; opacity: 0.55;
    animation: march-branch 2200ms linear infinite;
  }
  @keyframes march-branch { to { stroke-dashoffset: -320; } }
  .branch-node rect { fill: rgba(255, 180, 84, 0.08); stroke: var(--warn); stroke-width: 2; stroke-dasharray: 5 5; }
  .branch-node text { fill: var(--warn); font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 600; }
</style>
</head>
<body>
  <div class="scene">
    <div class="bg-dots"></div>
    <h1>${esc(title)}</h1>
    <svg viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">
      <path class="spine" d="M ${lineX},${lineTop} L ${lineX},${lineBottom}" />
      ${branchPath}
      <circle class="dot" r="14" />
      ${nodeEls}
      ${chipEls}
    </svg>
  </div>
</body>
</html>`;
}
