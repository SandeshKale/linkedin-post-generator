// Structural guardrail against this repo's single most-repeated mistake:
// shipping a new carousel post with the exact same visual identity as the
// one immediately before it. This exists because prose alone didn't work —
// CLAUDE.md's "every post's media needs its own identity" rule was already
// written, already reinforced by a whole theme-system build, and got
// violated on the very next post anyway (see CLAUDE.md "Visual identity"
// for the incident). A rule that only lives in a doc depends on it being
// reread closely every single time; a check that runs in the pipeline and
// fails the build does not. Mirrors this repo's existing "guardrails live
// in build.mjs/manifest-schema.mjs, judgment calls live in
// quality-gate.mjs" split — theme reuse is a mechanical fact about two
// JSON files, not a call that needs an LLM.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content');

function lastCommitTime(file) {
  try {
    const out = execSync(`git log -1 --format=%at -- ${JSON.stringify(file)}`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out ? parseInt(out, 10) : 0;
  } catch {
    return 0;
  }
}

// Named preset string -> itself; full custom object -> a stable fingerprint
// of its content, so two different one-off inline themes never collide
// just because both are "custom", but the exact same object copy-pasted
// twice in a row still gets caught.
function themeFingerprint(theme) {
  if (theme === undefined || theme === null) return 'blueprint';
  if (typeof theme === 'string') return theme;
  return `custom:${JSON.stringify(theme)}`;
}

function diagramEngines(manifest) {
  return (manifest.slides || []).filter((s) => s.type === 'diagram').map((s) => s.engine || 'mermaid');
}

/**
 * @param {object} manifest - the already-parsed (post-parseManifest) manifest
 * @param {string} currentSlug
 * @throws {Error} if the theme is identical to the immediately preceding
 *   carousel post's theme — this is a hard stop, not advisory, because a
 *   theme match is exactly the failure mode that already shipped once.
 */
export function checkVariety(manifest, currentSlug) {
  if (process.env.SKIP_VARIETY_CHECK) {
    console.warn('⚠ SKIP_VARIETY_CHECK set — skipping the theme/engine-reuse guardrail.');
    return;
  }

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.flow.json'));
  const others = files
    .map((f) => join(CONTENT_DIR, f))
    .filter((f) => basename(f) !== `${currentSlug}.json`)
    .map((f) => ({ file: f, t: lastCommitTime(f) }))
    .filter((x) => x.t > 0)
    .sort((a, b) => b.t - a.t);

  if (others.length === 0) return; // nothing committed yet to compare against

  const prev = JSON.parse(readFileSync(others[0].file, 'utf8'));
  const prevSlug = prev.slug || basename(others[0].file, '.json');

  const currentTheme = themeFingerprint(manifest.theme);
  const prevTheme = themeFingerprint(prev.theme);

  if (currentTheme === prevTheme) {
    throw new Error(
      `Theme reuse blocked: this manifest's theme (${JSON.stringify(currentTheme)}) is identical to the ` +
        `immediately preceding carousel post ("${prevSlug}"). Per CLAUDE.md "Visual identity" — reusing the last ` +
        `post's theme is this repo's single most-repeated mistake. Pick a different named preset, add a genuinely ` +
        `new one to CAROUSEL_THEMES (a new CSS branch, not a new color on an existing boolean), or write a ` +
        `one-off inline theme object for this post. If this repeat is actually intentional (e.g. a deliberate ` +
        `two-part series), rerun with SKIP_VARIETY_CHECK=1.`
    );
  }

  const currentEngines = diagramEngines(manifest);
  const prevEngines = diagramEngines(prev);
  if (currentEngines.length && prevEngines.length && currentEngines.every((e) => prevEngines.includes(e))) {
    console.warn(
      `⚠ This post's diagram slide(s) use the same engine (${currentEngines.join(', ')}) as the immediately ` +
        `preceding post ("${prevSlug}"). Not blocked, but see CLAUDE.md "Visual identity" — check whether mermaid ` +
        `vs d2 would read more distinctly here before treating that as settled.`
    );
  }
}

function basename(path, ext = '') {
  const b = path.split('/').pop();
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b;
}
