#!/usr/bin/env node
/**
 * Hydrates a JSON slide manifest (content/<slug>.json) into a self-contained
 * HTML carousel document (output/<slug>/carousel.html), then closes. Also
 * emits output/<slug>/caption.md from the manifest's optional `caption`/
 * `hashtags` fields, if present — the post's own text lives in the same
 * manifest as its media instead of drifting in a separate untracked doc.
 *
 * Usage: node scripts/build.mjs <content/manifest.json>
 *
 * "Hydration" here means resolving every slide's async/server-side content
 * ahead of time so render.mjs's later page.pdf()/screenshot() pass is a pure,
 * static export with no runtime JS: Mermaid diagram source is pre-rendered
 * to a static <svg> string (scripts/mermaid.mjs), and code blocks are
 * pre-highlighted to Shiki HTML (scripts/shiki.mjs). This is the document
 * pipeline's equivalent of video-generator's window.__seek(t) purity rule —
 * instead of "no wall-clock side effects inside __seek", it's "no
 * browser-side layout work left for the render step".
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHtml } from '../templates/carousel.mjs';
import { renderMermaid, closeMermaidBrowser } from './mermaid.mjs';
import { renderD2 } from './d2.mjs';
import { highlight } from './shiki.mjs';
import { parseManifest } from './manifest-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const [, , manifestArg] = process.argv;
if (!manifestArg) {
  console.error('Usage: node scripts/build.mjs <content/manifest.json>');
  process.exit(1);
}

async function hydrateSlide(slide) {
  if (slide.type === 'diagram') {
    const diagramSvg =
      slide.engine === 'd2'
        ? await renderD2(slide.d2, { themeID: slide.d2ThemeId })
        : await renderMermaid(slide.mermaid, { theme: slide.mermaidTheme || 'base', look: slide.look });
    return { ...slide, diagramSvg };
  }
  if (slide.type === 'code') {
    const codeHtml = await highlight(slide.code, slide.lang || 'text', slide.shikiTheme);
    return { ...slide, codeHtml };
  }
  return slide;
}

async function main() {
  const manifestPath = resolve(manifestArg);
  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (!raw.slug) raw.slug = basename(manifestPath, extname(manifestPath));
  const manifest = parseManifest(raw);

  console.log(`Building "${manifest.title}" (${manifest.slides.length} slides)...`);
  const slides = await Promise.all(manifest.slides.map(hydrateSlide));

  const html = buildHtml({
    title: manifest.title,
    author: manifest.author,
    handle: manifest.handle,
    slides,
  });

  const outDir = resolve(ROOT, 'output', manifest.slug);
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, 'carousel.html');
  await writeFile(outPath, html, 'utf8');
  console.log(`Wrote ${outPath}`);

  if (manifest.caption) {
    const captionPath = resolve(outDir, 'caption.md');
    const hashtagLine = (manifest.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    const captionDoc = hashtagLine ? `${manifest.caption}\n\n${hashtagLine}\n` : `${manifest.caption}\n`;
    await writeFile(captionPath, captionDoc, 'utf8');
    console.log(`Wrote ${captionPath}`);
  }

  if (manifest.slides.some((s) => s.alt)) {
    const altPath = resolve(outDir, 'alt-text.md');
    const altDoc = manifest.slides
      .map((s, i) => `Slide ${i + 1} (${s.type}):\n${s.alt || '(no alt text written for this slide)'}`)
      .join('\n\n');
    await writeFile(altPath, `${altDoc}\n`, 'utf8');
    console.log(`Wrote ${altPath}`);
  }

  console.log(`Next: node scripts/render.mjs ${outPath.replace(ROOT + '/', '')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeMermaidBrowser)
  // @terrastruct/d2 (scripts/d2.mjs) spins up a persistent WASM worker with
  // no exposed dispose()/terminate() API — once a diagram slide uses the
  // 'd2' engine, the process never exits on its own (confirmed: it sat
  // alive, near-0% CPU, indefinitely after finishing all real work). Every
  // other async resource here is already explicitly closed above, so a
  // forced exit here only ever cuts off that one dangling D2 handle, never
  // in-flight work.
  .finally(() => process.exit(process.exitCode || 0));
