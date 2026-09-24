// Loads vendored Tabler icons (assets/icons/tabler/*.svg, MIT) as inline SVG
// strings. Outline style, stroke="currentColor" — recolors via CSS `color`
// on the wrapping element, same pattern video-generator's tablerIcon()
// helper uses. Pure sync fs reads of static, vendored, repo-local files —
// no network, no dynamic input — so templates/carousel.mjs (otherwise a
// pure string-builder, see its own module comment) can call this directly
// without compromising the "no non-deterministic work" spirit of this
// repo's render contract; it's equivalent to the CSS `url()` font loads
// already happening in the same template, just read a layer earlier.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'assets', 'icons', 'tabler');
const cache = new Map();

/**
 * @param {string} name - file name (without .svg) under assets/icons/tabler/
 * @returns {string} raw <svg>...</svg> markup, stroke="currentColor"
 */
export function icon(name) {
  if (!cache.has(name)) {
    cache.set(name, readFileSync(join(ICONS_DIR, `${name}.svg`), 'utf8'));
  }
  return cache.get(name);
}
