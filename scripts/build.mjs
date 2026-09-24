#!/usr/bin/env node
/**
 * Hydrates a JSON slide manifest (content/<slug>.json) into a self-contained
 * HTML carousel document (output/<slug>/carousel.html), then closes.
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
import { highlight } from './shiki.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const [, , manifestArg] = process.argv;
if (!manifestArg) {
  console.error('Usage: node scripts/build.mjs <content/manifest.json>');
  process.exit(1);
}

async function hydrateSlide(slide) {
  if (slide.type === 'diagram') {
    const diagramSvg = await renderMermaid(slide.mermaid, { theme: slide.mermaidTheme || 'base' });
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
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (!manifest.slug) manifest.slug = basename(manifestPath, extname(manifestPath));
  if (!Array.isArray(manifest.slides) || manifest.slides.length === 0) {
    throw new Error(`Manifest ${manifestPath} has no slides[]`);
  }

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
  console.log(`Next: node scripts/render.mjs ${outPath.replace(ROOT + '/', '')}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeMermaidBrowser);
