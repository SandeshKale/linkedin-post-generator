#!/usr/bin/env bun
/**
 * Exports a self-contained animation HTML "scene" (see
 * templates/flow-gif.mjs) to a real, looping animated GIF.
 *
 * Usage: bun scripts/gif.mjs <scene.html> <out.gif> [--duration=4000] [--fps=20]
 *
 * This is a deliberate, separate sibling to scripts/render.mjs, not a mode
 * of it — render.mjs's whole reason to exist is this repo's static-only
 * render contract (see CLAUDE.md "Core render contract"): no runtime JS, no
 * animation, one page.pdf()/screenshot() per slide. A GIF is the opposite
 * of that by definition, so it gets its own exporter instead of teaching
 * render.mjs an animation mode that would silently violate the guarantee
 * every other slide type depends on.
 *
 * The trick that makes this reproducible rather than a screen recording:
 * every animation in the scene HTML is a real CSS Animation (not a video,
 * not a GIF itself), and the CSS Web Animations spec makes an animation's
 * `currentTime` directly settable — including past one iteration's own
 * duration for an `infinite` animation, which resolves via modulo to the
 * correct phase. So instead of letting animations play in real (wall-clock,
 * non-deterministic) time, every animation on the page is paused once, then
 * `currentTime` is set to each sample instant in turn and a screenshot is
 * taken — the same "pure function of a virtual clock" contract
 * video-generator's `window.__seek(t)` uses, just driven through the
 * browser's own animation engine instead of bespoke page JS.
 */
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , sceneArg, outArg, ...rest] = process.argv;
if (!sceneArg || !outArg) {
  console.error('Usage: bun scripts/gif.mjs <scene.html> <out.gif> [--duration=4000] [--fps=20]');
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

const DURATION_MS = flags.duration ? Number(flags.duration) : 4000;
const FPS = flags.fps ? Number(flags.fps) : 20;
const FRAME_DELAY_MS = 1000 / FPS;
const FRAME_COUNT = Math.round(DURATION_MS / FRAME_DELAY_MS);

const SCENE_PATH = resolve(sceneArg);
const OUT_PATH = resolve(outArg);

async function main() {
  await mkdir(dirname(OUT_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(SCENE_PATH).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const scene = page.locator('.scene');
    const box = await scene.boundingBox();
    if (!box) throw new Error('No .scene element found — is this a flow-gif.mjs scene?');

    // Freeze every CSS Animation on the page so wall-clock time can no
    // longer move them — from here on, only our own currentTime writes do.
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));

    console.log(`Capturing ${FRAME_COUNT} frames (${FPS}fps, ${DURATION_MS}ms loop) from ${SCENE_PATH}`);

    let globalPalette = null;
    const gif = GIFEncoder();

    for (let i = 0; i < FRAME_COUNT; i++) {
      const t = i * FRAME_DELAY_MS;
      await page.evaluate((ct) => {
        document.getAnimations().forEach((a) => {
          a.currentTime = ct;
        });
      }, t);

      const buf = await scene.screenshot();
      const png = PNG.sync.read(buf);
      const rgba = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength);

      if (!globalPalette) {
        globalPalette = quantize(rgba, 220);
      }
      const index = applyPalette(rgba, globalPalette);
      gif.writeFrame(index, png.width, png.height, {
        palette: i === 0 ? globalPalette : undefined,
        delay: FRAME_DELAY_MS,
        repeat: i === 0 ? 0 : undefined, // 0 = loop forever, set once on the first frame
      });

      if ((i + 1) % 10 === 0 || i === FRAME_COUNT - 1) {
        console.log(`  frame ${i + 1}/${FRAME_COUNT}`);
      }
    }

    gif.finish();
    await writeFile(OUT_PATH, gif.bytes());
    console.log(`Wrote ${OUT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
