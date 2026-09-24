// Guardrail layer for content/*.json manifests, validated with Zod before
// scripts/build.mjs does anything with them. Mirrors what a future LLM
// "Planner" step (see README's roadmap) would need to enforce on generated
// output — a manifest that fails this check never reaches templates/carousel.mjs,
// so an unknown slide type or a missing required field surfaces as one clear
// Zod error instead of a cryptic failure deep inside buildHtml().
import { z } from 'zod';

const baseSlide = z.object({ type: z.string() });

const hookSlide = baseSlide.extend({
  type: z.literal('hook'),
  eyebrow: z.string().optional(),
  headline: z.string().min(1),
  sub: z.string().optional(),
});

const diagramSlide = baseSlide.extend({
  type: z.literal('diagram'),
  heading: z.string().optional(),
  mermaid: z.string().min(1),
  mermaidTheme: z.string().optional(),
});

const codeSlide = baseSlide.extend({
  type: z.literal('code'),
  heading: z.string().optional(),
  lang: z.string().optional(),
  code: z.string().min(1),
  shikiTheme: z.string().optional(),
});

const statSlide = baseSlide.extend({
  type: z.literal('stat'),
  value: z.string().min(1),
  label: z.string().min(1),
  context: z.string().optional(),
});

const listSlide = baseSlide.extend({
  type: z.literal('list'),
  heading: z.string().optional(),
  items: z.array(z.string().min(1)).min(1),
});

const ctaSlide = baseSlide.extend({
  type: z.literal('cta'),
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

export const manifestSchema = z.object({
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
