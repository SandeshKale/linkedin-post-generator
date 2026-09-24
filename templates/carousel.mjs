// Builds the self-contained carousel HTML document from an already-hydrated
// slide list (Mermaid diagrams pre-rendered to SVG strings, code pre-
// highlighted to Shiki HTML — see scripts/build.mjs). Aside from reading
// vendored icon SVGs (see scripts/icons.mjs's own comment on why that's
// fine), this module does no I/O and is a pure string template, mirroring
// video-generator's build.mjs::buildHtml() pattern but emitting
// CSS-paginated <section class="slide"> elements instead of a
// __seek()-scrubbed timeline.
import { icon } from '../scripts/icons.mjs';

const PAGE_W = 1080;
const PAGE_H = 1350;

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Reserves space LinkedIn's document viewer draws its own chrome over:
// a page-counter pill (top-right) and swipe affordance (bottom-center) in
// the feed preview, plus generous body margins so nothing hugs the edge.
const SAFE_TOP = 96;
const SAFE_BOTTOM = 140;
const SAFE_SIDE = 72;

function baseStyles() {
  return `
    @page { size: ${PAGE_W}px ${PAGE_H}px; margin: 0; }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }

    @font-face {
      font-family: 'Space Grotesk';
      src: url('../../assets/fonts/space-grotesk/space-grotesk-latin-700-normal.woff2') format('woff2');
      font-weight: 700; font-display: block;
    }
    @font-face {
      font-family: 'Space Grotesk';
      src: url('../../assets/fonts/space-grotesk/space-grotesk-latin-500-normal.woff2') format('woff2');
      font-weight: 500; font-display: block;
    }
    @font-face {
      font-family: 'Inter';
      src: url('../../assets/fonts/inter/inter-latin-400-normal.woff2') format('woff2');
      font-weight: 400; font-display: block;
    }
    @font-face {
      font-family: 'Inter';
      src: url('../../assets/fonts/inter/inter-latin-600-normal.woff2') format('woff2');
      font-weight: 600; font-display: block;
    }
    @font-face {
      font-family: 'Inter';
      src: url('../../assets/fonts/inter/inter-latin-700-normal.woff2') format('woff2');
      font-weight: 700; font-display: block;
    }
    @font-face {
      font-family: 'JetBrains Mono';
      src: url('../../assets/fonts/jetbrains-mono/jetbrains-mono-latin-400-normal.woff2') format('woff2');
      font-weight: 400; font-display: block;
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
      --text: #eef2f8;
      --muted: #93a1bb;
      --border: rgba(148, 172, 214, 0.22);
      --card: rgba(255, 255, 255, 0.04);
    }

    body { background: #05070c; font-family: 'Inter', sans-serif; }

    .slide {
      position: relative;
      width: ${PAGE_W}px;
      height: ${PAGE_H}px;
      overflow: hidden;
      background: radial-gradient(circle at 18% 8%, var(--bg-2), var(--bg) 60%);
      page-break-after: always;
      color: var(--text);
    }
    .slide:last-child { page-break-after: auto; }

    /* Static dot-grid texture — no @keyframes/JS, this is a still document. */
    .bg-dots {
      position: absolute; inset: 0; z-index: 0;
      background-image: radial-gradient(circle, rgba(148,172,214,0.14) 1.6px, transparent 1.6px);
      background-size: 28px 28px;
      opacity: 0.55;
    }
    .bg-glow {
      position: absolute; z-index: 0; width: 640px; height: 640px; border-radius: 50%;
      top: -220px; right: -220px;
      background: radial-gradient(circle, rgba(63,208,201,0.20), transparent 70%);
    }

    .safe {
      position: relative; z-index: 1;
      padding: ${SAFE_TOP}px ${SAFE_SIDE}px ${SAFE_BOTTOM}px;
      height: 100%;
      display: flex; flex-direction: column;
    }

    .eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px; font-weight: 600; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--accent);
      margin: 0 0 18px;
    }

    .headline {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700; font-size: 72px; line-height: 1.12; letter-spacing: -0.02em;
      margin: 0 0 24px;
      text-shadow: 0 4px 14px rgba(0,0,0,0.5);
    }
    .heading {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700; font-size: 48px; line-height: 1.18; letter-spacing: -0.015em;
      margin: 0 0 28px;
    }
    .sub {
      font-family: 'Inter', sans-serif; font-weight: 400; font-size: 32px; line-height: 1.45;
      color: var(--muted); margin: 0;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 36px;
    }

    .page-pill {
      position: absolute; top: 32px; right: ${SAFE_SIDE}px; z-index: 2;
      font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 600;
      color: var(--muted);
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 8px 20px;
    }

    .footer {
      position: absolute; left: ${SAFE_SIDE}px; bottom: 44px; z-index: 2;
      display: flex; align-items: center; gap: 16px;
    }
    .footer-avatar {
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      border: 2px solid rgba(255,255,255,0.35);
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      flex: none;
    }
    .footer-text { font-family: 'Inter', sans-serif; }
    .footer-name { font-size: 24px; font-weight: 700; margin: 0; }
    .footer-handle { font-size: 20px; color: var(--muted); margin: 0; }

    /* ---- slide-type specific ---- */
    .slide-hook .safe { justify-content: center; }
    .slide-cta .safe { justify-content: center; align-items: flex-start; }

    .diagram-wrap { flex: 1; display: flex; align-items: center; justify-content: center; }
    .diagram-wrap svg { max-width: 100%; max-height: 100%; }

    .code-card { flex: 1; overflow: hidden; }
    .code-card pre.shiki {
      margin: 0; padding: 32px; border-radius: 16px;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 22px !important; line-height: 1.5 !important;
      overflow: hidden;
      /* A code line longer than the card is a static image, not a
         terminal — there's no horizontal scroll to fall back on, so wrap
         instead of clipping. Found by rendering a real slide and looking
         at it (see CLAUDE.md "Verify visually"): a >70-char Python line
         silently ran off the right edge of the card. */
      white-space: pre-wrap !important;
      overflow-wrap: anywhere;
    }

    .stat-value {
      font-family: 'Space Grotesk', sans-serif; font-weight: 700;
      font-size: 168px; line-height: 1; letter-spacing: -0.03em;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      -webkit-background-clip: text; background-clip: text; color: transparent;
      filter: drop-shadow(0 6px 18px rgba(63,208,201,0.25));
      margin: 0 0 20px;
    }
    .stat-label { font-size: 34px; font-weight: 600; margin: 0 0 16px; }
    .stat-context { font-size: 28px; color: var(--muted); line-height: 1.5; margin: 0; }

    .list-items { list-style: none; margin: 0; padding: 0; flex: 1; }
    .list-items li {
      display: flex; gap: 24px; align-items: center;
      font-size: 32px; line-height: 1.4; padding: 22px 0;
      border-bottom: 1px solid var(--border);
    }
    .list-items li:last-child { border-bottom: none; }
    .list-index {
      font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 26px;
      color: var(--accent); flex: none; width: 52px; text-align: center;
    }

    /* ---- icon badges (assets/icons/tabler/*.svg via scripts/icons.mjs) ---- */
    .icon-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 92px; height: 92px; border-radius: 24px; flex: none;
      background: linear-gradient(135deg, rgba(63,208,201,0.20), rgba(108,139,255,0.12));
      border: 1px solid var(--border);
      color: var(--accent);
      box-shadow: 0 10px 28px rgba(63,208,201,0.18);
      margin-bottom: 32px;
    }
    .icon-badge svg { width: 46px; height: 46px; stroke-width: 1.75; }
    .icon-badge-sm {
      width: 56px; height: 56px; border-radius: 16px; margin-bottom: 0;
      box-shadow: 0 6px 16px rgba(63,208,201,0.15);
    }
    .icon-badge-sm svg { width: 28px; height: 28px; }
    .list-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 52px; height: 52px; border-radius: 14px; flex: none;
      background: rgba(63,208,201,0.12); border: 1px solid var(--border);
      color: var(--accent);
    }
    .list-icon svg { width: 26px; height: 26px; stroke-width: 1.75; }

    .heading-row { display: flex; align-items: center; gap: 22px; margin-bottom: 28px; }
    .heading-row .heading { margin: 0; }

    /* ---- stat comparison bars — an optional visual instead of a number
       floating alone; see the "compare" field on a stat slide. ---- */
    .compare-chart { margin-top: 44px; }
    .compare-row { margin-bottom: 26px; }
    .compare-row:last-child { margin-bottom: 0; }
    .compare-row-label {
      font-family: 'JetBrains Mono', monospace; font-size: 24px;
      color: var(--muted); margin: 0 0 10px;
    }
    .compare-track {
      height: 30px; border-radius: 15px; overflow: hidden;
      background: rgba(255,255,255,0.05); border: 1px solid var(--border);
    }
    .compare-fill { height: 100%; border-radius: 15px; background: rgba(147,161,187,0.4); }
    .compare-fill.highlight {
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      box-shadow: 0 0 18px rgba(63,208,201,0.35);
    }
  `;
}

function pagePill(index, total) {
  return `<div class="page-pill">${index + 1} / ${total}</div>`;
}

function footer(author, handle) {
  if (!author) return '';
  return `
    <div class="footer">
      <div class="footer-avatar"></div>
      <div class="footer-text">
        <p class="footer-name">${esc(author)}</p>
        ${handle ? `<p class="footer-handle">${esc(handle)}</p>` : ''}
      </div>
    </div>`;
}

function renderHook(slide) {
  return `
    <div class="safe">
      ${slide.icon ? `<div class="icon-badge">${icon(slide.icon)}</div>` : ''}
      ${slide.eyebrow ? `<p class="eyebrow">${esc(slide.eyebrow)}</p>` : ''}
      <h1 class="headline">${esc(slide.headline)}</h1>
      ${slide.sub ? `<p class="sub">${esc(slide.sub)}</p>` : ''}
    </div>`;
}

function renderHeadingRow(slide) {
  if (!slide.heading) return '';
  const badge = slide.icon ? `<div class="icon-badge icon-badge-sm">${icon(slide.icon)}</div>` : '';
  return `<div class="heading-row">${badge}<h2 class="heading">${esc(slide.heading)}</h2></div>`;
}

function renderDiagram(slide) {
  return `
    <div class="safe">
      ${renderHeadingRow(slide)}
      <div class="diagram-wrap card">${slide.diagramSvg || ''}</div>
    </div>`;
}

function renderCode(slide) {
  return `
    <div class="safe">
      ${slide.heading ? `<h2 class="heading">${esc(slide.heading)}</h2>` : ''}
      <div class="code-card card">${slide.codeHtml || ''}</div>
    </div>`;
}

function renderCompareChart(compare) {
  if (!compare) return '';
  const rows = compare
    .map(
      (row) => `
      <div class="compare-row">
        <p class="compare-row-label">${esc(row.label)}</p>
        <div class="compare-track"><div class="compare-fill${row.highlight ? ' highlight' : ''}" style="width:${row.value}%"></div></div>
      </div>`
    )
    .join('');
  return `<div class="compare-chart">${rows}</div>`;
}

function renderStat(slide) {
  return `
    <div class="safe">
      ${slide.icon ? `<div class="icon-badge">${icon(slide.icon)}</div>` : ''}
      <p class="stat-value">${esc(slide.value)}</p>
      <p class="stat-label">${esc(slide.label)}</p>
      ${slide.context ? `<p class="stat-context">${esc(slide.context)}</p>` : ''}
      ${renderCompareChart(slide.compare)}
    </div>`;
}

function renderList(slide) {
  const items = (slide.items || [])
    .map((item, i) => {
      const isRich = typeof item === 'object' && item !== null;
      const text = isRich ? item.text : item;
      const marker =
        isRich && item.icon
          ? `<span class="list-icon">${icon(item.icon)}</span>`
          : `<span class="list-index">${String(i + 1).padStart(2, '0')}</span>`;
      return `<li>${marker}<span>${esc(text)}</span></li>`;
    })
    .join('');
  return `
    <div class="safe">
      ${slide.heading ? `<h2 class="heading">${esc(slide.heading)}</h2>` : ''}
      <ul class="list-items">${items}</ul>
    </div>`;
}

function renderCta(slide) {
  return `
    <div class="safe">
      ${slide.icon ? `<div class="icon-badge">${icon(slide.icon)}</div>` : ''}
      <h1 class="headline">${esc(slide.headline)}</h1>
      ${slide.sub ? `<p class="sub">${esc(slide.sub)}</p>` : ''}
    </div>`;
}

const RENDERERS = {
  hook: renderHook,
  diagram: renderDiagram,
  code: renderCode,
  stat: renderStat,
  list: renderList,
  cta: renderCta,
};

export function buildHtml({ title, author, handle, slides }) {
  const total = slides.length;
  const body = slides
    .map((slide, i) => {
      const renderer = RENDERERS[slide.type];
      if (!renderer) throw new Error(`Unknown slide type: ${slide.type}`);
      return `
      <section class="slide slide-${slide.type}">
        <div class="bg-dots"></div>
        <div class="bg-glow"></div>
        ${pagePill(i, total)}
        ${renderer(slide)}
        ${footer(author, handle)}
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${baseStyles()}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export const CAROUSEL_PAGE_WIDTH = PAGE_W;
export const CAROUSEL_PAGE_HEIGHT = PAGE_H;
