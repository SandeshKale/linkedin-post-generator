#!/usr/bin/env bun
/**
 * Manifest -> standalone cover/poster image for a flow-GIF post — the
 * scripts/build-flow-gif.mjs sibling this repo's own `cover-art` skill
 * (.claude/skills/cover-art/SKILL.md) calls for. Ported from
 * video-generator's per-reel `cover-build.mjs` pattern, generalized into
 * one script every post's manifest can drive instead of a bespoke file
 * per post, since this repo (unlike video-generator) already has a
 * single shared flow-gif template to pull real theme/icon data from.
 *
 * Why this exists at all, not just scripts/gif.mjs's frame 0: LinkedIn's
 * post-image upload path flattens an animated GIF to ONE static frame
 * the instant it's posted (confirmed publishing jev-claude-code's flow
 * GIF) — so the cover may be the only frame anyone ever sees, and a
 * frame lifted from the loop reads as an accidental screenshot, not a
 * deliberate poster. This composes a genuinely different, single-frame
 * layout (an orbiting-icon ring around the post's brand mark) that
 * appears nowhere in the flow-GIF's own node-column/zigzag layout.
 *
 * Usage: bun scripts/build-cover.mjs content/<slug>.flow.json
 *   -> output/<slug>/cover.html, then screenshots it once -> cover.png
 *
 * Reads the SAME flow manifest build-flow-gif.mjs does, plus three
 * cover-only optional fields (never auto-derived from the flow's own
 * node labels — written by hand, same "highest quality input"
 * discipline as everything else in this repo):
 *   - coverEyebrow    small tracked-caps line above the ring
 *   - coverSubtitle   one plain-language sentence stating the hook
 *   - author/handle   footer lockup; defaults match this repo's other
 *                      manifests' own default ("Sandesh Kale" / "GenAI
 *                      Solutions Architect") if omitted
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { chromium } from 'playwright';
import { icon, brandIcon, logoIcon } from './icons.mjs';
import { resolveTheme, hexToRgbTriplet, DISPLAY_FONT_WEIGHTS, DISPLAY_FONT_SIZES } from '../templates/flow-gif.mjs';

const [, , manifestArg] = process.argv;
if (!manifestArg) {
  console.error('Usage: bun scripts/build-cover.mjs content/<slug>.flow.json');
  process.exit(1);
}

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A node's own `logo`/`icon`/`brand` field, in that priority — same
 * precedence templates/flow-gif.mjs's node renderer uses. */
function nodeArt(n) {
  if (n.logo) return { svg: logoIcon(n.logo), tone: 'full-color' };
  if (n.brand) return { svg: brandIcon(n.brand), tone: 'mono' };
  return { svg: icon(n.icon || 'circle'), tone: 'stroke' };
}

async function main() {
  const manifestPath = resolve(manifestArg);
  const flow = JSON.parse(await readFile(manifestPath, 'utf8'));
  const slug = basename(manifestPath).replace(/\.flow\.json$/, '');
  const outDir = resolve(dirname(manifestPath), '..', 'output', slug);
  await mkdir(outDir, { recursive: true });

  const T = resolveTheme(flow.theme);
  const accentRgb = hexToRgbTriplet(T.colors.accent);
  const author = flow.author || 'Sandesh Kale';
  const handle = flow.handle || 'GenAI Solutions Architect';
  const eyebrow = flow.coverEyebrow || 'FLOW BREAKDOWN';
  const subtitle = flow.coverSubtitle || '';

  // This repo's standard 1080x1350 (4:5) canvas — same one
  // templates/carousel.mjs uses — not a 1:1 square. A square canvas was
  // tried first and the title/subtitle/footer text block collided badly
  // (subtitle's second line sat directly under the footer avatar, title
  // ran into the subtitle): caught only by rendering and looking, not by
  // reading the CSS (this repo's own "verify visually" rule, see
  // CLAUDE.md). 1350px of height gives the ring, a 2-line title, a
  // 2-line subtitle, and the footer each real room instead of packing
  // four stacked text blocks into 1080px total.
  const CANVAS_W = 1080;
  const CANVAS_H = 1350;
  const CX = CANVAS_W / 2;
  const CY = 460;
  const R = 260;
  const nodes = flow.nodes || [];
  const N = nodes.length;

  const orbitNodes = nodes
    .map((n, i) => {
      const angle = -90 + i * (360 / N);
      const rad = (angle * Math.PI) / 180;
      const x = CX + R * Math.cos(rad);
      const y = CY + R * Math.sin(rad);
      const { svg, tone } = nodeArt(n);
      const colorStyle = tone === 'full-color' ? '' : `color: var(--accent); ${tone === 'mono' ? 'fill: currentColor;' : ''}`;
      return `
    <div class="orbit-node" style="left:${x.toFixed(1)}px; top:${y.toFixed(1)}px;">
      <div class="orbit-node-icon" style="${colorStyle}">${svg}</div>
    </div>`;
    })
    .join('\n');

  const brandCenter = flow.brandBadge
    ? `<div class="orbit-center-icon" style="color: var(--text); fill: currentColor;">${brandIcon(flow.brandBadge)}</div>`
    : '';

  const titleWords = String(flow.title || '').split(' ');
  const hiCount = Math.min(2, Math.max(1, Math.floor(titleWords.length * 0.25)));
  const plainWords = titleWords.slice(0, titleWords.length - hiCount).join(' ');
  const hiWords = titleWords.slice(titleWords.length - hiCount).join(' ');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(flow.title || slug)} — cover</title>
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
    font-family: 'Inter';
    src: url('../../assets/fonts/inter/inter-latin-700-normal.woff2') format('woff2');
    font-weight: 700; font-display: block;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('../../assets/fonts/jetbrains-mono/jetbrains-mono-latin-600-normal.woff2') format('woff2');
    font-weight: 600; font-display: block;
  }
  :root {
    --bg: ${T.colors.bg};
    --accent: ${T.colors.accent};
    --accent-2: ${T.colors.accent2};
    --text: ${T.colors.text};
    --muted: ${T.colors.muted};
    --border: ${T.colors.border};
    --card: ${T.colors.card};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${CANVAS_W}px; height: ${CANVAS_H}px; background: ${T.sceneBg}; overflow: hidden; }
  .scene { position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; }
  .bg-dots {
    position: absolute; inset: 0;
    background-image: radial-gradient(rgba(${accentRgb}, 0.18) 1.5px, transparent 1.5px);
    background-size: 42px 42px;
  }
  .bg-glow {
    position: absolute; width: 900px; height: 900px; left: 50%; top: 380px;
    margin: -450px 0 0 -450px; border-radius: 50%;
    background: radial-gradient(circle, rgba(${accentRgb}, 0.22), transparent 68%);
  }
  .eyebrow {
    position: absolute; top: 64px; left: 0; right: 0; text-align: center;
    font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 26px;
    letter-spacing: 0.18em; color: var(--accent);
  }
  .orbit-wrap { position: absolute; top: 0; left: 0; width: ${CANVAS_W}px; height: ${CANVAS_H}px; }
  .orbit-ring {
    position: absolute; left: ${CX - R - 60}px; top: ${CY - R - 60}px;
    width: ${(R + 60) * 2}px; height: ${(R + 60) * 2}px; border-radius: 50%;
    border: 3px solid var(--border);
    box-shadow: 0 0 60px rgba(${accentRgb}, 0.18);
  }
  .orbit-ring::before {
    content: ''; position: absolute; inset: 34px; border-radius: 50%;
    border: 1.5px dashed rgba(${accentRgb}, 0.3);
  }
  .orbit-node {
    position: absolute; width: 108px; height: 108px; margin: -54px 0 0 -54px;
    border-radius: 50%; background: var(--card); border: 2px solid var(--border);
    box-shadow: 0 6px 20px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
  }
  .orbit-node-icon { width: 52px; height: 52px; }
  .orbit-node-icon svg { width: 52px; height: 52px; display: block; stroke: currentColor; }
  .orbit-center {
    position: absolute; left: ${CX - 88}px; top: ${CY - 88}px; width: 176px; height: 176px;
    border-radius: 50%; background: var(--bg); border: 3px solid var(--accent);
    box-shadow: 0 0 44px rgba(${accentRgb}, 0.45);
    display: flex; align-items: center; justify-content: center;
  }
  .orbit-center-icon { width: 84px; height: 84px; }
  .orbit-center-icon svg { width: 84px; height: 84px; display: block; }
  /* Title and subtitle share one normal-flow container instead of each
     getting its own hardcoded absolute top offset -- a display font that
     wraps the title to a 3rd line (JetBrains Mono is proportionally
     wider per declared px than Space Grotesk/Poppins, same gotcha
     documented in templates/flow-gif.mjs for the flow-GIF's own h1)
     would otherwise push straight into a subtitle pinned at a fixed
     pixel offset tuned for a 2-line title. Flow layout (margin-top
     between blocks) instead of two independent absolute offsets means
     any line count fits inside the same generous envelope between the
     ring and the footer -- caught by rendering the dossier/JetBrains-
     Mono post specifically (it wraps to 3 lines where the other two
     themes' fonts wrap to 2), not by reading the CSS. */
  .text-block { position: absolute; top: 820px; left: 60px; right: 60px; }
  .title {
    text-align: center; margin: 0;
    font-family: '${T.displayFont}', sans-serif; font-weight: ${DISPLAY_FONT_WEIGHTS[T.displayFont] || 700};
    font-size: ${(DISPLAY_FONT_SIZES[T.displayFont] || 48) + 6}px; line-height: 1.08; color: var(--text);
  }
  .title .hi {
    background: linear-gradient(120deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text; background-clip: text; color: transparent;
    text-shadow: none;
  }
  .subtitle {
    margin: 28px 30px 0; text-align: center;
    font-family: 'Inter', sans-serif; font-weight: 600; font-size: 30px;
    color: var(--muted); line-height: 1.4;
  }
  .brand {
    position: absolute; bottom: 60px; left: 0; right: 0;
    display: flex; align-items: center; justify-content: center; gap: 16px;
  }
  .brand-avatar {
    width: 52px; height: 52px; border-radius: 50%; flex: none;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    border: 2px solid rgba(255,255,255,0.35);
    box-shadow: 0 2px 10px rgba(0,0,0,0.4);
  }
  .brand-text { font-family: 'Inter', sans-serif; text-align: left; }
  .brand-name { font-size: 22px; font-weight: 700; color: var(--text); margin: 0; }
  .brand-handle { font-size: 18px; color: var(--muted); margin: 0; }
</style>
</head>
<body>
<div class="scene">
  <div class="bg-dots"></div>
  <div class="bg-glow"></div>
  <div class="eyebrow">${esc(eyebrow)}</div>
  <div class="orbit-wrap">
    <div class="orbit-ring"></div>
    ${orbitNodes}
    <div class="orbit-center">${brandCenter}</div>
  </div>
  <div class="text-block">
    <h1 class="title">${esc(plainWords)} <span class="hi">${esc(hiWords)}</span></h1>
    ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}
  </div>
  <div class="brand">
    <div class="brand-avatar"></div>
    <div class="brand-text">
      <p class="brand-name">${esc(author)}</p>
      <p class="brand-handle">${esc(handle)}</p>
    </div>
  </div>
</div>
</body>
</html>`;

  const htmlPath = resolve(outDir, 'cover.html');
  await writeFile(htmlPath, html, 'utf8');
  console.log(`Wrote ${htmlPath}`);

  const pngPath = resolve(outDir, 'cover.png');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width: CANVAS_W, height: CANVAS_H }, deviceScaleFactor: 2 });
    await page.goto(`file://${htmlPath}`);
    await page.waitForFunction(() => document.fonts.ready);
    await page.screenshot({ path: pngPath });
  } finally {
    await browser.close();
  }
  console.log(`Wrote ${pngPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
