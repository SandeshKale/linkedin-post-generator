#!/usr/bin/env bun
/**
 * Content-quality gate for a manifest, using Jev (TypeSafe AI) System One
 * judgments — run BEFORE scripts/build.mjs, never as part of it.
 *
 * Usage: bun scripts/quality-gate.mjs <content/manifest.json> [--strict]
 *
 * Why this is a separate stage and not folded into build.mjs: this repo's
 * core render contract (see CLAUDE.md "Core render contract") requires
 * build.mjs/render.mjs to be fully deterministic and offline by the time a
 * slide reaches Chromium. An LLM-judge network call is neither — it can
 * disagree with itself between runs and depends on an external API being
 * up. So it lives here, upstream of that boundary, as an advisory (or,
 * with --strict, blocking) step a human or CI runs deliberately, the same
 * way you'd run a linter before a build rather than inside it.
 *
 * Every decision below is phrased as a Jev primitive (Score or Noul) rather
 * than left to ad hoc string checks, and all of them are evaluated in one
 * `systemOne` call (Jev's "speculative fan-out" pattern — many questions,
 * one state, evaluated in parallel) against a single richly-structured
 * `state` object. That `state` object *is* "highest quality input data" in
 * concrete terms, per Jev's own guidance (docs.typesafe.ai/concepts/state):
 * named fields instead of a flattened string, the full slide content
 * grouped by purpose, and explicit audience/brand context so the model
 * judges against the actual bar this account is aiming for instead of a
 * generic one.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { score, noul } from '@typesafe-ai/sdk';
import { getJevClient } from './jev.mjs';
import { parseManifest } from './manifest-schema.mjs';

const [, , manifestArg, ...flags] = process.argv;
if (!manifestArg) {
  console.error('Usage: bun scripts/quality-gate.mjs <content/manifest.json> [--strict]');
  process.exit(1);
}
const STRICT = flags.includes('--strict');

// Below this, Jev itself is telling us the read is uncertain — per Jev's
// confidence guidance, that means "route to a human," not "trust the
// answer." Kept as a named, conservative default (Jev's own docs recommend
// starting conservative and tuning against your own data) rather than
// inlined at each call site.
const CONFIDENCE_FLOOR = 0.6;

const AUDIENCE =
  'LinkedIn readers who are technical GenAI / software-architecture practitioners and hiring ' +
  'managers. The account brand is deterministic, technically substantive GenAI systems content — ' +
  'proof-of-work architecture breakdowns, not generic engagement bait or motivational content.';

/** Pulls the fields worth jargon-checking out of a slide, skipping raw code/mermaid source. */
function slideText(slide) {
  switch (slide.type) {
    case 'hook':
      return { eyebrow: slide.eyebrow ?? null, headline: slide.headline, sub: slide.sub ?? null };
    case 'cta':
      return { headline: slide.headline, sub: slide.sub ?? null };
    case 'stat':
      return { value: slide.value, label: slide.label, context: slide.context ?? null };
    case 'list':
      return { heading: slide.heading ?? null, items: slide.items };
    case 'diagram':
    case 'code':
      return { heading: slide.heading ?? null };
    default:
      return {};
  }
}

function buildState(manifest) {
  const hookSlide = manifest.slides.find((s) => s.type === 'hook');
  const ctaSlide = manifest.slides.find((s) => s.type === 'cta');
  const diagramSlides = manifest.slides.filter((s) => s.type === 'diagram');

  return {
    post_title: manifest.title,
    audience: AUDIENCE,
    slide_count: manifest.slides.length,
    hook_slide: hookSlide
      ? { eyebrow: hookSlide.eyebrow ?? null, headline: hookSlide.headline, sub: hookSlide.sub ?? null }
      : null,
    cta_slide: ctaSlide ? { headline: ctaSlide.headline, sub: ctaSlide.sub ?? null } : null,
    all_slide_text: manifest.slides.map((s, i) => ({ slide_index: i, type: s.type, ...slideText(s) })),
    diagrams: diagramSlides.map((d, i) => ({
      diagram_index: i,
      heading: d.heading ?? null,
      mermaid_source: d.mermaid,
    })),
  };
}

function buildQuestions(state) {
  const questions = {};

  if (state.hook_slide) {
    questions.hook_strength = score(
      "How likely is this post's hook slide (state.hook_slide) to stop the stated audience " +
        '(state.audience) mid-scroll on LinkedIn?',
      [
        'Would bounce immediately — vague, generic, or not obviously relevant to the audience',
        'Mildly interesting but easy to scroll past',
        'Stops the scroll and prompts a click into the rest of the post',
        'Strong enough to plausibly drive saves or shares',
      ]
    );
  }

  if (state.cta_slide) {
    questions.cta_is_specific = noul(
      "Is the closing CTA (state.cta_slide) specific to this post's actual topic/claim (state.post_title, " +
        "state.hook_slide), rather than generic engagement-bait boilerplate that could be pasted onto any post?",
      {
        true: "References the post's specific topic, claim, or takeaway",
        false: 'Generic follow/engage phrasing with no connection to this post\'s actual content',
      }
    );
  }

  questions.jargon_risk = noul(
    'Does the combined slide text (state.all_slide_text) rely on unexplained acronyms or jargon that ' +
      'would make a member of the stated audience (state.audience) bounce, with none of it defined on-slide? ' +
      'Jargon that is common knowledge for that specific audience does not count.',
    {
      true: 'Uses undefined jargon/acronyms the stated audience would not recognize',
      false: 'Jargon used is either standard knowledge for the stated audience or defined on-slide',
    }
  );

  state.diagrams.forEach((d, i) => {
    questions[`diagram_readability_${i}`] = score(
      `How readable will the diagram at state.diagrams[${i}] be once rendered as a small static image ` +
        'on a 1080x1350px LinkedIn slide (viewed at feed-thumbnail size on a phone, not full-screen)?',
      [
        'Too dense — too many nodes/edges to read at a glance',
        'Readable but tight — legible with effort',
        'Clean and legible at a glance',
      ]
    );
  });

  return questions;
}

// One row per check: how to read its answer, and when it counts as a
// problem worth flagging. `kind` selects how confidence is derived — Score
// answers carry it directly; Noul answers don't, so confidence is derived
// from distance-from-0.5 (per Jev's own interpretation guidance: "a value
// near 0.5 means the model gives yes and no similar probability" — i.e.
// low confidence).
function evaluateChecks(state, answers) {
  const rows = [];

  if (answers.hook_strength) {
    const a = answers.hook_strength;
    rows.push({
      label: 'Hook strength',
      confidence: a.confidence,
      bad: a.score < 1.5,
      detail: `score ${a.score.toFixed(2)}/3 (${a.legend[Math.min(3, Math.round(a.score))]})`,
    });
  }

  if (answers.cta_is_specific) {
    const a = answers.cta_is_specific;
    rows.push({
      label: 'CTA specificity',
      confidence: Math.abs(a.noul - 0.5) * 2,
      bad: a.noul < 0.4,
      detail: `specific-to-post probability ${a.noul.toFixed(2)}`,
    });
  }

  {
    const a = answers.jargon_risk;
    rows.push({
      label: 'Jargon risk',
      confidence: Math.abs(a.noul - 0.5) * 2,
      bad: a.noul > 0.6,
      detail: `undefined-jargon probability ${a.noul.toFixed(2)}`,
    });
  }

  state.diagrams.forEach((d, i) => {
    const a = answers[`diagram_readability_${i}`];
    if (!a) return;
    rows.push({
      label: `Diagram ${i} readability`,
      confidence: a.confidence,
      bad: a.score < 1,
      detail: `score ${a.score.toFixed(2)}/2 (${a.legend[Math.min(2, Math.round(a.score))]})`,
    });
  });

  return rows.map((row) => {
    const verdict = row.confidence < CONFIDENCE_FLOOR ? 'REVIEW' : row.bad ? 'FLAG' : 'OK';
    return { ...row, verdict };
  });
}

async function main() {
  const manifestPath = resolve(manifestArg);
  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifest = parseManifest(raw); // same Zod guardrail build.mjs uses — never judge an invalid manifest

  const state = buildState(manifest);
  const questions = buildQuestions(state);

  console.log(`Running Jev quality gate on "${manifest.title}" (${Object.keys(questions).length} questions)...`);
  const client = getJevClient();
  const { answers, usage } = await client.systemOne({ state, questions });

  const rows = evaluateChecks(state, answers);

  const ICON = { OK: '✓', FLAG: '✗', REVIEW: '?' };
  for (const row of rows) {
    console.log(`  ${ICON[row.verdict]} [${row.verdict}] ${row.label} — ${row.detail} (confidence ${row.confidence.toFixed(2)})`);
  }
  console.log(`Tokens used: ${usage.input_tokens} in / ${usage.output_tokens} out`);

  const blocking = rows.filter((r) => r.verdict !== 'OK');
  if (blocking.length === 0) {
    console.log('All checks passed with high confidence.');
    return;
  }

  console.log(
    `\n${blocking.length} check(s) need attention before this ships as-is: ` +
      `${blocking.map((r) => r.label).join(', ')}.`
  );
  if (STRICT) {
    console.error('--strict: failing the gate.');
    process.exitCode = 1;
  } else {
    console.log('(Advisory only — rerun with --strict to make these block the pipeline.)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
