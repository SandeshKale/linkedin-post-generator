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

// Named carousel visual-identity presets — the static-carousel sibling of
// templates/flow-gif.mjs's own `THEMES` object (same reasoning: this repo's
// "every post's media needs its own identity" rule applies to carousels
// just as hard as flow-GIF posts, and reusing the exact same theme on every
// post — which every carousel in this repo did until now — is exactly the
// violation that rule exists to prevent). `blueprint` is the original,
// unchanged default; every other key is a genuinely different component
// language (card shape, icon-badge treatment, background texture, display
// font), not just a recolor — the same "remix the palette AND the shape
// language" discipline the flow-GIF THEMES already document.
const CAROUSEL_THEMES = {
  blueprint: {
    colors: {
      bg: '#0b1220', bg2: '#101a2c', accent: '#3fd0c9', accent2: '#6c8bff',
      text: '#eef2f8', muted: '#93a1bb', border: 'rgba(148, 172, 214, 0.22)', card: 'rgba(255, 255, 255, 0.04)',
    },
    sceneBg: '#05070c',
    displayFont: 'Space Grotesk',
    cardStyle: 'glass',
    iconStyle: 'gradient-glow',
    bgTexture: 'dots-glow',
    statValueStyle: 'gradient-text',
    // Mermaid diagrams don't inherit page CSS (see CLAUDE.md "Visual
    // identity") — scripts/build.mjs reads this and passes it straight to
    // scripts/mermaid.mjs::renderMermaid()'s `themeVariables` so a diagram
    // slide's palette actually matches the rest of the theme instead of
    // silently staying Blueprint-teal on every other theme.
    mermaidVariables: {
      background: 'transparent', primaryColor: '#132038', primaryTextColor: '#eef2f8',
      primaryBorderColor: '#3fd0c9', lineColor: '#6c8bff', secondaryColor: '#101a2c', tertiaryColor: '#101a2c',
    },
  },
  // A second reference point, deliberately as far from Blueprint's "dark
  // tech UI" register as the flow-GIF side's own "dossier" theme was from
  // its "blueprint" — light instead of dark, flat/opaque instead of
  // glassy-translucent, hard corners instead of rounded, a bold ink
  // border instead of a soft glow. Poppins (already vendored for the
  // flow-GIF "audit" theme, see "Typography") reused here for the same
  // reason it was picked there: a genuinely different display face, not
  // just a different color on the same face.
  daylight: {
    colors: {
      bg: '#faf3e6', bg2: '#f2e6d0', accent: '#d94f2b', accent2: '#0d6e5c',
      text: '#241c14', muted: '#6b5c48', border: '#241c14', card: '#fffbf2',
    },
    sceneBg: '#f2e6d0',
    displayFont: 'Poppins',
    cardStyle: 'solid',
    iconStyle: 'flat-solid',
    bgTexture: 'grid',
    gridLineColor: 'rgba(36, 28, 20, 0.12)',
    statValueStyle: 'solid-underline',
    mermaidVariables: {
      background: 'transparent', primaryColor: '#fffbf2', primaryTextColor: '#241c14',
      primaryBorderColor: '#241c14', lineColor: '#241c14', secondaryColor: '#f2e6d0', tertiaryColor: '#f2e6d0',
    },
  },
};
const DISPLAY_FONT_WEIGHTS = { 'Space Grotesk': 700, Poppins: 800 };

/**
 * Resolves a manifest's `theme` field (a named preset string, a full
 * custom object, or `{ extends: '<preset>', ...overrides }`) to a
 * complete theme object merged over `blueprint`'s defaults — same
 * resolution logic (and the same `extends` escape hatch) as
 * `templates/flow-gif.mjs`'s exported `resolveTheme()`, kept as a
 * parallel implementation rather than a shared import since the two
 * modules' theme shapes are genuinely different (carousel themes don't
 * have `nodeShape`/`connectorStyle`/etc., flow-gif themes don't have
 * `cardStyle`/`iconStyle`) — importing one from the other would just
 * mean ignoring half its fields either direction.
 */
export function resolveCarouselTheme(theme = 'blueprint') {
  const base = CAROUSEL_THEMES.blueprint;
  const named = typeof theme === 'string' ? CAROUSEL_THEMES[theme] : null;
  const custom = typeof theme === 'object' && theme ? theme : null;
  const extended = custom && typeof custom.extends === 'string' ? CAROUSEL_THEMES[custom.extends] : null;
  const picked = { ...base, ...(named || extended || {}), ...(custom || {}) };
  return {
    ...base,
    ...picked,
    colors: { ...base.colors, ...((named || extended)?.colors || {}), ...(custom?.colors || {}) },
  };
}

// Reserves space LinkedIn's document viewer draws its own chrome over:
// a page-counter pill (top-right) and swipe affordance (bottom-center) in
// the feed preview, plus generous body margins so nothing hugs the edge.
const SAFE_TOP = 96;
const SAFE_BOTTOM = 140;
const SAFE_SIDE = 72;

function baseStyles(T) {
  const isGlass = T.cardStyle === 'glass';
  const isFlatIcon = T.iconStyle === 'flat-solid';
  const isGridTexture = T.bgTexture === 'grid';
  const isUnderlineStat = T.statValueStyle === 'solid-underline';
  const displayWeight = DISPLAY_FONT_WEIGHTS[T.displayFont] || 700;

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
      font-family: 'Poppins';
      src: url('../../assets/fonts/poppins/poppins-latin-800-normal.woff2') format('woff2');
      font-weight: 800; font-display: block;
    }
    @font-face {
      font-family: 'Poppins';
      src: url('../../assets/fonts/poppins/poppins-latin-900-normal.woff2') format('woff2');
      font-weight: 900; font-display: block;
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
      --bg: ${T.colors.bg};
      --bg-2: ${T.colors.bg2};
      --accent: ${T.colors.accent};
      --accent-2: ${T.colors.accent2};
      --text: ${T.colors.text};
      --muted: ${T.colors.muted};
      --border: ${T.colors.border};
      --card: ${T.colors.card};
    }

    body { background: ${T.sceneBg}; font-family: 'Inter', sans-serif; }

    .slide {
      position: relative;
      width: ${PAGE_W}px;
      height: ${PAGE_H}px;
      overflow: hidden;
      background: ${isGlass ? 'radial-gradient(circle at 18% 8%, var(--bg-2), var(--bg) 60%)' : 'var(--bg)'};
      page-break-after: always;
      color: var(--text);
    }
    .slide:last-child { page-break-after: auto; }

    /* Background texture: Blueprint's dot-grid + top-right glow (a "dark
       tech UI" read) vs. Daylight's flat ruled-grid (a "graph paper" read)
       — genuinely different texture language, not a recolored dot.

       Gotcha: the grid line reused --border (Daylight's bold, near-opaque
       ink color, the same one the card outlines use) and at 0.35 opacity
       it was strong enough that wherever a line happened to fall inside
       a letter's own counter/gap (a headline word wraps to an
       unpredictable position depending on its text, so this isn't
       something a fixed grid offset can dodge), it read as a stray mark
       cutting through the glyph — caught only by rendering a real
       headline and looking, not by reading the CSS, since the bug only
       shows up wherever a line and a letter gap happen to coincide.
       Fixed with a dedicated, much softer gridLineColor separate from
       the bold --border card-outline color, the same "a shared color
       needs checking against every surface it touches" lesson this file
       already documents for the flow-GIF dossier theme's connector. */
    .bg-dots {
      position: absolute; inset: 0; z-index: 0;
      ${
        isGridTexture
          ? `background-image:
          repeating-linear-gradient(0deg, ${T.gridLineColor} 0px, ${T.gridLineColor} 1px, transparent 1px, transparent 64px),
          repeating-linear-gradient(90deg, ${T.gridLineColor} 0px, ${T.gridLineColor} 1px, transparent 1px, transparent 64px);
        opacity: 1;`
          : `background-image: radial-gradient(circle, rgba(148,172,214,0.14) 1.6px, transparent 1.6px);
        background-size: 28px 28px;
        opacity: 0.55;`
      }
    }
    .bg-glow {
      position: absolute; z-index: 0; width: 640px; height: 640px; border-radius: 50%;
      top: -220px; right: -220px;
      background: ${isGlass ? 'radial-gradient(circle, rgba(63,208,201,0.20), transparent 70%)' : 'transparent'};
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
      font-family: '${T.displayFont}', sans-serif;
      font-weight: ${displayWeight}; font-size: 72px; line-height: 1.12; letter-spacing: -0.02em;
      margin: 0 0 24px;
      text-shadow: ${isGlass ? '0 4px 14px rgba(0,0,0,0.5)' : 'none'};
    }
    .heading {
      font-family: '${T.displayFont}', sans-serif;
      font-weight: ${displayWeight}; font-size: 48px; line-height: 1.18; letter-spacing: -0.015em;
      margin: 0 0 28px;
    }
    .sub {
      font-family: 'Inter', sans-serif; font-weight: 400; font-size: 32px; line-height: 1.45;
      color: var(--muted); margin: 0;
    }

    /* Card shape: Blueprint's translucent glass card (soft border-radius,
       barely-there fill) vs. Daylight's opaque solid card (hard corners,
       a bold 3px ink border) — a real silhouette/material difference, the
       same "don't just recolor the same rectangle" discipline
       templates/flow-gif.mjs's own nodeShape gotcha already documents. */
    .card {
      background: var(--card);
      border: ${isGlass ? '1px solid var(--border)' : '3px solid var(--border)'};
      border-radius: ${isGlass ? '20px' : '0px'};
      padding: 36px;
      box-shadow: ${isGlass ? 'none' : '10px 10px 0 0 var(--border)'};
    }

    .page-pill {
      position: absolute; top: 32px; right: ${SAFE_SIDE}px; z-index: 2;
      font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 600;
      color: ${isGlass ? 'var(--muted)' : 'var(--text)'};
      background: ${isGlass ? 'rgba(255,255,255,0.06)' : 'var(--card)'};
      border: 1px solid var(--border);
      border-radius: ${isGlass ? '999px' : '0px'};
      padding: 8px 20px;
    }

    .footer {
      position: absolute; left: ${SAFE_SIDE}px; bottom: 44px; z-index: 2;
      display: flex; align-items: center; gap: 16px;
    }
    .footer-avatar {
      width: 56px; height: 56px; border-radius: ${isGlass ? '50%' : '0px'};
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      border: 2px solid ${isGlass ? 'rgba(255,255,255,0.35)' : 'var(--border)'};
      box-shadow: ${isGlass ? '0 2px 10px rgba(0,0,0,0.4)' : 'none'};
      flex: none;
    }
    .footer-text { font-family: 'Inter', sans-serif; }
    .footer-name { font-size: 24px; font-weight: 700; margin: 0; }
    .footer-handle { font-size: 20px; color: var(--muted); margin: 0; }

    /* ---- slide-type specific ---- */
    .slide-hook .safe { justify-content: center; }
    .slide-cta .safe { justify-content: center; align-items: flex-start; }

    /* min-height: 0 is load-bearing, not defensive: a flex item's default
       min-height is 'auto', which lets it grow to its content's intrinsic
       size regardless of flex: 1 — so a diagram whose own SVG is
       intrinsically taller than the card (a tall vertical D2 flowchart,
       unlike this repo's existing wide/short Mermaid diagrams, which
       never happened to trigger this) silently overflowed straight past
       the card and off the bottom of the slide, with max-height: 100%
       below never even getting a bounded ancestor height to resolve
       against. Caught by measuring the actual rendered getBoundingClientRect
       of .diagram-wrap (2256px tall inside a 1350px slide) in a real
       Playwright page, not by reading this CSS — the generated SVG
       markup and even its width/height attributes looked completely
       correct in isolation. */
    .diagram-wrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .diagram-wrap svg { max-width: 100%; max-height: 100%; }

    .code-card { flex: 1; overflow: hidden; }
    .code-card pre.shiki {
      margin: 0; padding: 32px; border-radius: ${isGlass ? '16px' : '0px'};
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

    /* Stat value: Blueprint's gradient-clip text (a glowing "hero number"
       read) vs. Daylight's flat solid ink with a bold accent underline
       bar (a "stamped headline" read) — see the gradient-text gotcha
       documented elsewhere in this repo (text-shadow must be explicitly
       'none' on a background-clip:text span, or an inherited shadow
       renders as a solid dark silhouette instead of the gradient); this
       branch sidesteps that entirely for the underline variant since it
       never uses background-clip in the first place. */
    .stat-value {
      font-family: '${T.displayFont}', sans-serif; font-weight: ${displayWeight};
      font-size: 168px; line-height: 1; letter-spacing: -0.03em;
      margin: 0 0 20px;
      ${
        isUnderlineStat
          ? `color: var(--text); text-shadow: none;
        border-bottom: 10px solid var(--accent); display: inline-block; padding-bottom: 8px;`
          : `background: linear-gradient(135deg, var(--accent), var(--accent-2));
        -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none;
        filter: drop-shadow(0 6px 18px rgba(63,208,201,0.25));`
      }
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
      color: ${isFlatIcon ? '#fff' : 'var(--accent)'};
      background: ${isFlatIcon ? 'var(--accent)' : 'transparent'};
      flex: none; width: 52px; height: ${isFlatIcon ? '52px' : 'auto'};
      display: flex; align-items: center; justify-content: center;
      border-radius: ${isFlatIcon ? '0px' : '0'};
      text-align: center;
    }

    /* ---- icon badges (assets/icons/tabler/*.svg via scripts/icons.mjs) ----
       Blueprint: soft gradient fill + glow shadow, rounded corners — reads
       as a glass UI chip. Daylight: opaque flat accent fill, hard corners,
       no shadow at all — reads as a printed rubber-stamp icon instead of
       a glowing UI element, matching the rest of its flat-design card
       language. */
    .icon-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 92px; height: 92px; border-radius: ${isFlatIcon ? '0px' : '24px'}; flex: none;
      background: ${isFlatIcon ? 'var(--accent)' : 'linear-gradient(135deg, rgba(63,208,201,0.20), rgba(108,139,255,0.12))'};
      border: ${isFlatIcon ? '3px solid var(--border)' : '1px solid var(--border)'};
      color: ${isFlatIcon ? '#fffbf2' : 'var(--accent)'};
      box-shadow: ${isFlatIcon ? 'none' : '0 10px 28px rgba(63,208,201,0.18)'};
      margin-bottom: 32px;
    }
    .icon-badge svg { width: 46px; height: 46px; stroke-width: 1.75; }
    .icon-badge-sm {
      width: 56px; height: 56px; border-radius: ${isFlatIcon ? '0px' : '16px'}; margin-bottom: 0;
      box-shadow: ${isFlatIcon ? 'none' : '0 6px 16px rgba(63,208,201,0.15)'};
    }
    .icon-badge-sm svg { width: 28px; height: 28px; }
    .list-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 52px; height: 52px; border-radius: ${isFlatIcon ? '0px' : '14px'}; flex: none;
      background: ${isFlatIcon ? 'var(--accent)' : 'rgba(63,208,201,0.12)'};
      border: ${isFlatIcon ? '2px solid var(--border)' : '1px solid var(--border)'};
      color: ${isFlatIcon ? '#fffbf2' : 'var(--accent)'};
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
      height: 30px; border-radius: ${isGlass ? '15px' : '0px'}; overflow: hidden;
      background: ${isGlass ? 'rgba(255,255,255,0.05)' : 'var(--card)'};
      border: 1px solid var(--border);
    }
    /* The non-highlighted bar's own fill was a hardcoded cool blue-gray
       (rgba(147,161,187,...)) regardless of theme — barely noticeable
       against Blueprint's own navy/teal palette, but visibly off-hue
       against Daylight's warm cream/coral one. Themed via --muted
       instead, at reduced opacity through color-mix (Chromium supports
       it; this repo's render path is always headless Chromium, see
       CLAUDE.md's core render contract). */
    .compare-fill { height: 100%; border-radius: ${isGlass ? '15px' : '0px'}; background: color-mix(in srgb, var(--muted) 55%, transparent); }
    .compare-fill.highlight {
      background: ${isGlass ? 'linear-gradient(90deg, var(--accent), var(--accent-2))' : 'var(--accent)'};
      box-shadow: ${isGlass ? '0 0 18px rgba(63,208,201,0.35)' : 'none'};
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

export function buildHtml({ title, author, handle, slides, theme }) {
  const T = resolveCarouselTheme(theme);
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
<style>${baseStyles(T)}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export const CAROUSEL_PAGE_WIDTH = PAGE_W;
export const CAROUSEL_PAGE_HEIGHT = PAGE_H;
