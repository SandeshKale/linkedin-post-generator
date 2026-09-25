// Pre-renders Mermaid diagram source to a static <svg>...</svg> string at
// build time, using a throwaway headless Chromium page loaded with the
// vendored mermaid UMD bundle. This keeps the final render step (render.mjs)
// completely free of runtime JS/diagram layout — by the time render.mjs
// opens a slide's HTML, every diagram is already a plain inlined SVG, same
// spirit as running Shiki server-side for code highlighting instead of
// shipping a syntax highlighter into the rendered page.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MERMAID_JS_PATH = join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

let browserPromise;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, args: ['--no-sandbox'] });
  }
  return browserPromise;
}

let mermaidSource;
async function getMermaidSource() {
  if (!mermaidSource) {
    mermaidSource = await readFile(MERMAID_JS_PATH, 'utf8');
  }
  return mermaidSource;
}

/**
 * @param {string} definition - Mermaid diagram source (e.g. "graph TD; A-->B;")
 * @param {{theme?: string, look?: 'classic'|'handDrawn'}} [opts] - `look:
 *   'handDrawn'` switches Mermaid's own built-in rough.js-backed renderer on
 *   (a real, zero-extra-dependency alternative visual language already
 *   shipped in the vendored mermaid package — see CLAUDE.md "Diagram
 *   engines"). Left at Mermaid's default ('classic') unless requested.
 * @returns {Promise<string>} raw <svg>...</svg> markup, ids namespaced per call
 */
export async function renderMermaid(definition, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent('<!DOCTYPE html><html><head></head><body></body></html>');
    await page.addScriptTag({ content: await getMermaidSource() });
    const id = `mmd-${Math.random().toString(36).slice(2)}`;
    const svg = await page.evaluate(
      async ({ definition, id, theme, look }) => {
        // eslint-disable-next-line no-undef
        mermaid.initialize({
          startOnLoad: false,
          theme: theme || 'base',
          look: look || 'classic',
          securityLevel: 'loose',
          themeVariables: {
            background: 'transparent',
            primaryColor: '#132038',
            primaryTextColor: '#eef2f8',
            primaryBorderColor: '#3fd0c9',
            lineColor: '#6c8bff',
            secondaryColor: '#101a2c',
            tertiaryColor: '#101a2c',
          },
        });
        // eslint-disable-next-line no-undef
        const { svg } = await mermaid.render(id, definition);
        return svg;
      },
      { definition, id, theme: opts.theme, look: opts.look }
    );
    return svg;
  } finally {
    await page.close();
  }
}

export async function closeMermaidBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = undefined;
  }
}
