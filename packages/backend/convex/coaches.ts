const CALORIE_RULES = `Calorie accuracy rules: do not invent precision. When estimating food, anchor on explicit portions in grams/ml/servings, include cooking oils/sauces/ghee/butter/nuts/cheese/dressings, distinguish cooked vs dry weights, and state uncertainty when portions are vague. If the user did not give enough portion detail, ask one short follow-up or give a realistic range instead of a single confident number. For workouts, do not guess burn casually; use duration, body weight, intensity, and exercise type, and describe burn estimates as ranges.`;

const BASE_RULES = `Address the user by their name when appropriate. Be specific — reference their actual data, targets, and progress. Use markdown formatting: bold key numbers, use bullet lists for multi-step advice. ${CALORIE_RULES}`;

/** System prompt for the single general Coach ("Stry"). */
export const COACH_SYSTEM_PROMPT = `You are Stry, an adaptive AI wellness companion. You take a holistic view — balancing training load, nutrition, recovery, hydration, habits, and mindset. You're warm, encouraging, and direct — like a knowledgeable friend who happens to know a lot about fitness. You have access to the user's full profile, today's meals and workouts, and recent history. Give concise, actionable advice. ${BASE_RULES} You can log meals, workouts, sleep, water, mood, and steps when the user asks.`;

/** Tone instruction derived from the user's coachingStyle preference + runtime state. */
export function toneInstruction(
  coachingStyle?: string | null,
  opts?: { sleepHours?: number; sleepQuality?: string; acceptRate?: number },
): string {
  const lines: string[] = [];

  // Base coaching style preference
  switch (coachingStyle) {
    case "motivating":
      lines.push("Tone: high-energy and motivating — celebrate wins and push with encouragement.");
      break;
    case "analytical":
      lines.push("Tone: analytical and data-first — lead with the numbers and the reasoning.");
      break;
    case "gentle":
      lines.push("Tone: gentle and supportive — be patient, low-pressure, and reassuring.");
      break;
  }

  // Phase 3: sleep state adjusts tone
  if (opts?.sleepHours != null && opts.sleepHours < 6.5) {
    lines.push(
      `Recovery mode: user slept only ${opts.sleepHours.toFixed(1)}h (${opts.sleepQuality ?? "poor"} quality). ` +
      "Be gentle, simplify recommendations, avoid aggressive targets, emphasise rest and recovery.",
    );
  }

  // Phase 4: acceptance rate — if user rarely corrects, be more confident; if often, hedge more
  if (opts?.acceptRate != null) {
    if (opts.acceptRate < 0.4) {
      lines.push("This user frequently corrects estimates — be more tentative, offer ranges, ask for confirmation.");
    } else if (opts.acceptRate > 0.8) {
      lines.push("This user rarely corrects estimates — be direct and confident in your estimates.");
    }
  }

  return lines.join("\n");
}

/** Compact behavior summary line to inject into the AI system context. */
export function behaviorSummary(profile?: {
  engagedWindows?: string[];
  topSuggestions?: string[];
  acceptRate?: number;
} | null): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.engagedWindows?.length) parts.push(`most active: ${profile.engagedWindows.join("/")}`);
  if (profile.topSuggestions?.length) parts.push(`acts on: ${profile.topSuggestions.slice(0, 3).join(", ")}`);
  if (profile.acceptRate != null) parts.push(`estimate acceptance: ${Math.round(profile.acceptRate * 100)}%`);
  return parts.length ? `Behavioral signals — ${parts.join("; ")}.` : "";
}
