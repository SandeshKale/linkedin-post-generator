#!/usr/bin/env bun
/**
 * Manifest -> scene HTML, for an animated flow-diagram GIF post — the
 * scripts/build.mjs sibling for templates/flow-gif.mjs (see its own header
 * comment for why this is a wholly separate path from the static carousel).
 *
 * Usage: bun scripts/build-flow-gif.mjs content/<slug>.flow.json
 *   -> output/<slug>/flow-scene.html
 *
 * Next: bun scripts/gif.mjs output/<slug>/flow-scene.html output/<slug>/flow.gif
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { buildFlowGifHtml } from '../templates/flow-gif.mjs';

const [, , manifestArg] = process.argv;
if (!manifestArg) {
  console.error('Usage: bun scripts/build-flow-gif.mjs content/<slug>.flow.json');
  process.exit(1);
}

async function main() {
  const manifestPath = resolve(manifestArg);
  const flow = JSON.parse(await readFile(manifestPath, 'utf8'));

  const slug = basename(manifestPath).replace(/\.flow\.json$/, '');
  const outDir = resolve(dirname(manifestPath), '..', 'output', slug);
  await mkdir(outDir, { recursive: true });

  const html = buildFlowGifHtml(flow);
  const outPath = resolve(outDir, 'flow-scene.html');
  await writeFile(outPath, html, 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`Next: bun scripts/gif.mjs output/${slug}/flow-scene.html output/${slug}/flow.gif --duration=${flow.loopMs ?? 4000}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
