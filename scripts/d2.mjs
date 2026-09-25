// D2 diagram engine — a second, visually distinct alternative to Mermaid
// (scripts/mermaid.mjs) for diagram slides. Runs its compiler/renderer as
// WASM directly in Node — no throwaway Playwright page needed, unlike
// Mermaid, which only runs inside a real browser DOM. Picked over the other
// options researched alongside it (Excalidraw's mermaid-to-excalidraw +
// exportToSvg pipeline) because it works today without a browser-bundling
// step; see CLAUDE.md "Diagram engines" for why Excalidraw was deferred
// rather than forced in.
import { D2 } from '@terrastruct/d2';

let d2Instance;
function getD2() {
  if (!d2Instance) d2Instance = new D2();
  return d2Instance;
}

// D2's own theme catalog, picked for actually being dark — D2 defaults to a
// white canvas, which would sit as a bright rectangle inside this repo's
// near-black "Blueprint" slides. 200 ("Dark Mauve") is the closest built-in
// match to the existing teal/violet accent palette without hand-tuning a
// custom D2 theme.
const DEFAULT_THEME_ID = 200;

/**
 * @param {string} source - D2 diagram source (https://d2lang.com syntax)
 * @param {{themeID?: number}} [opts]
 * @returns {Promise<string>} raw <svg>...</svg> markup, with D2's own
 *   opaque themed background — renders correctly as-is inside this
 *   template's `.diagram-wrap.card`, same as the code slide's inner
 *   `pre.shiki` sits at its own tone inside the outer card.
 */
export async function renderD2(source, opts = {}) {
  const engine = getD2();
  const result = await engine.compile(source, { sketch: true, themeID: opts.themeID ?? DEFAULT_THEME_ID });
  return engine.render(result.diagram, result.renderOptions);
}
