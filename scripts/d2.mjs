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
  const svg = await engine.render(result.diagram, result.renderOptions);
  // D2's own root <svg> carries a viewBox but no width/height at all —
  // unlike Mermaid's output, which sets width="100%" on its root (see
  // scripts/mermaid.mjs). Patch the same attribute onto D2's root <svg>
  // tag in place (regex, same "patch only the size attrs, never discard
  // the rest of the tag" pattern templates/flow-gif.mjs's sizedIcon()
  // already uses for vendored icons) so both engines' output behaves
  // identically here. This alone does NOT fix a tall diagram overflowing
  // its card, though — that turned out to be a flexbox bug in
  // .diagram-wrap itself (see templates/carousel.mjs), not a missing
  // attribute on the SVG; this width="100%" is just parity with Mermaid,
  // not the actual overflow fix.
  //
  // D2 also hardcodes preserveAspectRatio="xMinYMin meet" on its root
  // <svg> — once the overflow bug above is fixed and the diagram
  // actually scales down to fit the card, "xMin YMin" anchors the
  // scaled content to the box's top-left corner instead of centering
  // it, so a diagram whose own aspect ratio is narrower than the card
  // (a short, few-node vertical chain) sits flush left with a large
  // empty gap on the right rather than centered — still visibly wrong
  // even after the real overflow fix, caught the same way, by rendering
  // and looking. Force "xMidYMid meet" (center, not corner-anchor) to
  // match how a centered `.diagram-wrap` is expected to look.
  return svg
    .replace(/<svg /, '<svg width="100%" ')
    .replace('preserveAspectRatio="xMinYMin meet"', 'preserveAspectRatio="xMidYMid meet"');
}
