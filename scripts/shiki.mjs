// Server-side syntax highlighting, run entirely in Node during build.mjs —
// the rendered slide HTML that render.mjs later opens contains plain
// pre-styled <span> markup, no highlighter JS shipped into the page.
import { codeToHtml } from 'shiki';

/**
 * @param {string} code
 * @param {string} lang - shiki/TextMate grammar id, e.g. "typescript", "python", "bash"
 * @param {string} [theme]
 * @returns {Promise<string>} a self-contained <pre class="shiki">...</pre> block
 */
export async function highlight(code, lang, theme = 'github-dark-default') {
  return codeToHtml(code, { lang, theme });
}
