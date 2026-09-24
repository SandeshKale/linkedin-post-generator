#!/usr/bin/env node
/**
 * Exports a built carousel HTML document (output/<slug>/carousel.html, see
 * scripts/build.mjs) to a multi-page PDF and/or one PNG per slide.
 *
 * Usage: node scripts/render.mjs <carousel.html> [--scale=2] [--format=pdf,png]
 *
 * This is the document-pipeline sibling of video-generator's
 * scripts/render.mjs: instead of driving window.__seek(t) at 60 fixed
 * virtual-time steps and piping PNGs to ffmpeg, it exports each already-
 * static <section class="slide"> once — via page.pdf() with
 * preferCSSPageSize (so Chromium respects the @page { size: 1080px 1350px }
 * rule in templates/carousel.mjs) for the LinkedIn "Document" post, and via
 * per-element screenshot() for standalone slide images (infographic posts,
 * OG/code-snippet images, or an image-carousel post instead of a PDF).
 */
import { chromium } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , sourceArg, ...rest] = process.argv;

if (!sourceArg) {
  console.error('Usage: node scripts/render.mjs <carousel.html> [--scale=2] [--format=pdf,png]');
  process.exit(1);
}

const flags = Object.fromEntries(
  rest
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const SCALE = flags.scale ? Number(flags.scale) : 2;
const FORMATS = new Set((flags.format || 'pdf,png').split(','));

const SOURCE_PATH = resolve(sourceArg);
const OUT_DIR = dirname(SOURCE_PATH);

async function main() {
  await stat(SOURCE_PATH); // throws with a clear ENOENT if the build step wasn't run yet
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ deviceScaleFactor: SCALE });
    await page.goto(pathToFileURL(SOURCE_PATH).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const slideCount = await page.locator('.slide').count();
    if (slideCount === 0) throw new Error('No .slide elements found — is this a built carousel.html?');
    console.log(`Found ${slideCount} slides in ${SOURCE_PATH}`);

    if (FORMATS.has('pdf')) {
      const pdfPath = join(OUT_DIR, 'carousel.pdf');
      await page.pdf({
        path: pdfPath,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
      console.log(`Wrote ${pdfPath}`);
    }

    if (FORMATS.has('png')) {
      for (let i = 0; i < slideCount; i++) {
        const slidePath = join(OUT_DIR, `slide-${String(i + 1).padStart(2, '0')}.png`);
        await page.locator('.slide').nth(i).screenshot({ path: slidePath });
        console.log(`Wrote ${slidePath}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
