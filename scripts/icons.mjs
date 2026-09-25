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
const BRAND_ICONS_DIR = join(__dirname, '..', 'assets', 'icons', 'simple-icons');
const LOGOS_DIR = join(__dirname, '..', 'assets', 'logos', 'gilbarbara');
const cache = new Map();
const brandCache = new Map();
const logoCache = new Map();

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

/**
 * Vendored real brand marks (assets/icons/simple-icons/*.svg, CC0 —
 * see that directory's own LICENSE.md, no attribution required). Unlike
 * `icon()`'s Tabler outline set, these ship as a single filled `<path>`
 * with no `fill`/`stroke` attribute of their own (so they default to
 * black) — callers must force `fill: currentColor` via CSS on the
 * embedding element rather than relying on the file itself, same as this
 * repo already does for every other vendored SVG asset (see "Typography"/
 * icon vendoring notes in CLAUDE.md for the general pattern).
 * @param {string} name - file name (without .svg) under assets/icons/simple-icons/
 * @returns {string} raw <svg>...</svg> markup, fill defaults to black
 */
export function brandIcon(name) {
  if (!brandCache.has(name)) {
    brandCache.set(name, readFileSync(join(BRAND_ICONS_DIR, `${name}.svg`), 'utf8'));
  }
  return brandCache.get(name);
}

/**
 * Vendored real, full-color product logos (assets/logos/gilbarbara/*.svg,
 * CC0 — see that directory's own LICENSE, no attribution required),
 * merged into this repo from video-generator's asset library (see
 * CLAUDE.md "Asset library"). Unlike `brandIcon()`'s simple-icons set
 * (single flat brand color, meant to be recolored via `fill:
 * currentColor`), these ship as multi-path, multi-color artwork with
 * each path's own real brand-accurate `fill` already set — never
 * override their color, that's the actual point of reaching for this set
 * instead of a monochrome brand mark. Covers developer-tool logos
 * simple-icons doesn't have (this repo vendors `bun.svg` and
 * `playwright.svg` from here for exactly that reason).
 * @param {string} name - file name (without .svg) under assets/logos/gilbarbara/
 * @returns {string} raw <svg>...</svg> markup, full original colors
 */
export function logoIcon(name) {
  if (!logoCache.has(name)) {
    logoCache.set(name, readFileSync(join(LOGOS_DIR, `${name}.svg`), 'utf8'));
  }
  return logoCache.get(name);
}
