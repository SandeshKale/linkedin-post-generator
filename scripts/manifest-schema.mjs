// Guardrail layer for content/*.json manifests, validated with Zod before
// scripts/build.mjs does anything with them. Mirrors what a future LLM
// "Planner" step (see README's roadmap) would need to enforce on generated
// output — a manifest that fails this check never reaches templates/carousel.mjs,
// so an unknown slide type or a missing required field surfaces as one clear
// Zod error instead of a cryptic failure deep inside buildHtml().
import { z } from 'zod';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_NAMES = readdirSync(join(__dirname, '..', 'assets', 'icons', 'tabler'))
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.replace(/\.svg$/, ''));

// Validated against the actual vendored set (scripts/icons.mjs reads the
// same directory) so a typo'd icon name fails manifest validation with a
// clear message, instead of a missing-file crash mid-build.
const iconName = z.enum(ICON_NAMES, {
  errorMap: () => ({ message: `must be one of the vendored icons: ${ICON_NAMES.join(', ')}` }),
});

// Optional on every slide type — LinkedIn's own image alt-text field caps
// at 1,000 characters, so that's enforced here rather than discovered at
// upload time. Never auto-derived from other fields (a generated
// "headline, sub, icon name" string is worse than nothing for a screen
// reader) — write it by hand describing what's actually on the slide.
const alt = z.string().min(1).max(1000, 'LinkedIn alt text is capped at 1000 characters').optional();

const baseSlide = z.object({ type: z.string(), alt });

const hookSlide = baseSlide.extend({
  type: z.literal('hook'),
  icon: iconName.optional(),
  eyebrow: z.string().optional(),
  headline: z.string().min(1),
  sub: z.string().optional(),
});

// Two diagram engines — see CLAUDE.md "Diagram engines" for the full
// rationale. `mermaid` is required when engine is 'mermaid' (the default,
// and the only engine every existing manifest uses); `d2` is required when
// engine is 'd2'. Enforced below via superRefine rather than a nested
// discriminated union, to avoid restructuring every existing diagram slide.
const diagramSlideBase = baseSlide.extend({
  type: z.literal('diagram'),
  icon: iconName.optional(),
  heading: z.string().optional(),
  engine: z.enum(['mermaid', 'd2']).default('mermaid'),
  mermaid: z.string().min(1).optional(),
  mermaidTheme: z.string().optional(),
  // 'handDrawn' switches on Mermaid's own built-in rough.js renderer —
  // no new dependency, a real alternative look already in the box.
  look: z.enum(['classic', 'handDrawn']).optional(),
  d2: z.string().min(1).optional(),
  d2ThemeId: z.number().optional(),
});
// discriminatedUnion needs a plain ZodObject per member, so the
// engine/mermaid/d2 cross-check lives on manifestSchema's own superRefine
// below instead of wrapping diagramSlideBase in .superRefine() here.
const diagramSlide = diagramSlideBase;

const codeSlide = baseSlide.extend({
  type: z.literal('code'),
  heading: z.string().optional(),
  lang: z.string().optional(),
  code: z.string().min(1),
  shikiTheme: z.string().optional(),
});

const statSlide = baseSlide.extend({
  type: z.literal('stat'),
  icon: iconName.optional(),
  value: z.string().min(1),
  label: z.string().min(1),
  context: z.string().optional(),
  // Optional visual comparison bar (e.g. baseline vs. this post's number) —
  // renders as a small labeled bar chart instead of leaving the stat as a
  // number floating alone on the slide. Both 0-100; `highlight` marks which
  // bar gets the accent-gradient fill.
  compare: z
    .array(z.object({ label: z.string().min(1), value: z.number().min(0).max(100), highlight: z.boolean().optional() }))
    .min(2)
    .max(2)
    .optional(),
});

// A list item is either a plain string (numbered badge, existing behavior —
// content/example-rag-guardrails.json still uses this) or {icon, text} for
// a per-item icon badge instead of a number. Mixing both in one list is
// fine; renderList() falls back to the index number for plain strings.
const listItem = z.union([z.string().min(1), z.object({ icon: iconName.optional(), text: z.string().min(1) })]);

const listSlide = baseSlide.extend({
  type: z.literal('list'),
  heading: z.string().optional(),
  items: z.array(listItem).min(1),
});

const ctaSlide = baseSlide.extend({
  type: z.literal('cta'),
  icon: iconName.optional(),
  headline: z.string().min(1),
  sub: z.string().optional(),
});

const slideSchema = z.discriminatedUnion('type', [
  hookSlide,
  diagramSlide,
  codeSlide,
  statSlide,
  listSlide,
  ctaSlide,
]);

export const manifestSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case').optional(),
    title: z.string().min(1),
    author: z.string().optional(),
    handle: z.string().optional(),
    slides: z.array(slideSchema).min(1, 'manifest needs at least one slide'),
    // Not rendered on any slide — the post's own text, kept in the same
    // manifest as its media so one JSON file is the single source of truth
    // for a post instead of a caption drifting in a separate untracked doc.
    caption: z.string().optional(),
    hashtags: z.array(z.string().min(1)).optional(),
  })
  .superRefine((manifest, ctx) => {
    manifest.slides.forEach((slide, i) => {
      if (slide.type !== 'diagram') return;
      if (slide.engine === 'd2' && !slide.d2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slides', i, 'd2'], message: "required when engine is 'd2'" });
      }
      if (slide.engine === 'mermaid' && !slide.mermaid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slides', i, 'mermaid'],
          message: "required when engine is 'mermaid' (the default)",
        });
      }
    });
  });

/**
 * @param {unknown} manifest - parsed JSON, not yet trusted
 * @returns {z.infer<typeof manifestSchema>}
 * @throws {Error} with every validation failure listed, one per line
 */
export function parseManifest(manifest) {
  const result = manifestSchema.safeParse(manifest);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid manifest:\n${issues}`);
  }
  return result.data;
}
