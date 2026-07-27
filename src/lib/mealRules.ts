import type { Preferences } from '../types/preferences'

// Turn the household preferences + recent-meal history into explicit prompt
// constraints for the recipe generator. Pure + testable so the rules are
// independent of the LLM call (the edge function just joins these lines).

export function buildRecipeConstraints(
  prefs: Preferences,
  recentMealTitles: string[] = [],
): string[] {
  const lines: string[] = []

  if (prefs.dietary_restrictions.length) {
    lines.push(`Must comply with these dietary restrictions: ${prefs.dietary_restrictions.join(', ')}.`)
  }
  if (prefs.hard_nos.length) {
    lines.push(`NEVER include these ingredients (hard no): ${prefs.hard_nos.join(', ')}.`)
  }
  if (prefs.max_cook_minutes != null) {
    lines.push(`Total prep + cook time must be at most ${prefs.max_cook_minutes} minutes.`)
  }

  const t = prefs.macro_targets
  const targetParts: string[] = []
  if (t.calories) targetParts.push(`~${t.calories} cal`)
  if (t.protein_g) targetParts.push(`~${t.protein_g}g protein`)
  if (t.fiber_g) targetParts.push(`~${t.fiber_g}g fiber`)
  if (targetParts.length) {
    lines.push(`Aim per serving for approximately ${targetParts.join(', ')} (a guide, not a hard gate).`)
  }

  // Fiber-first + 4-pillar build are always-on (Harvest's core quality rules).
  lines.push('Fiber is a priority macro — favor legumes, whole grains, vegetables, and fruit.')
  lines.push('Build the meal on four pillars: a protein, a complex-carb base, a vegetable, and a signature flavor "engine" (a sauce/seasoning/dressing).')

  if (prefs.cuisine_variety) {
    lines.push('Vary the cuisine and the main protein; avoid repeating a single cuisine profile.')
  }
  if (recentMealTitles.length && prefs.recency_weeks > 0) {
    lines.push(`Do NOT reproduce any of these recently-made meals: ${recentMealTitles.join('; ')}.`)
  }

  lines.push('Include realistic per-serving macros: calories, protein_g, carbs_g, fat_g, fiber_g.')
  return lines
}
