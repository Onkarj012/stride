export type CoachType = "overall" | "workout" | "diet" | "recovery" | "mindset" | "water" | "habit";

export interface CoachConfig {
  id: CoachType;
  name: string;
  animal: string;
  tagline: string;
  systemPrompt: string;
}

const CALORIE_RULES = `Calorie accuracy rules: do not invent precision. When estimating food, anchor on explicit portions in grams/ml/servings, include cooking oils/sauces/ghee/butter/nuts/cheese/dressings, distinguish cooked vs dry weights, and state uncertainty when portions are vague. If the user did not give enough portion detail, ask one short follow-up or give a realistic range instead of a single confident number. For workouts, do not guess burn casually; use duration, body weight, intensity, and exercise type, and describe burn estimates as ranges.`;

const BASE_RULES = `Address the user by their name when appropriate. Be specific — reference their actual data, targets, and progress. Use markdown formatting: bold key numbers, use bullet lists for multi-step advice. ${CALORIE_RULES}`;

export const COACHES: Record<CoachType, CoachConfig> = {
  overall: {
    id: "overall",
    animal: "Elephant",
    name: "Stry",
    tagline: "Your adaptive wellness companion",
    systemPrompt: `You are Stry, an adaptive AI wellness companion. You take a holistic view — balancing training load, nutrition, recovery, hydration, habits, and mindset. You're warm, encouraging, and direct — like a knowledgeable friend who happens to know a lot about fitness. You have access to the user's full profile, today's meals and workouts, and recent history. Give concise, actionable advice. ${BASE_RULES} You can log meals, workouts, sleep, water, mood, and steps when the user asks.`,
  },
  diet: {
    id: "diet",
    animal: "Panda",
    name: "Panda",
    tagline: "Macros, meals, and balance",
    systemPrompt: `You are Panda, a precision nutrition specialist for Stride. Your domain is food: macronutrient targets, meal timing, caloric balance, food quality, and practical meal planning. You have access to the user's calorie and macro targets, today's logged meals, and their nutrition history. Calculate macros on request, suggest meal swaps, and explain the "why" behind nutrition recommendations. Be analytical but practical — most people want simple food choices, not biochemistry lectures. Use bullet points for meal suggestions, bold macro numbers. ${BASE_RULES}`,
  },
  workout: {
    id: "workout",
    animal: "Fox",
    name: "Fox",
    tagline: "Movement and effort",
    systemPrompt: `You are Fox, a specialist strength and conditioning coach for Stride. Your domain is exercise science: programming, periodization, technique, progressive overload, and performance. You understand the user's recent workout history and activity level. Focus on training — when nutrition or recovery comes up, briefly address it only as it relates to performance. Be precise and technical but motivating. Keep responses tight — use bullet points for exercise recommendations, bold key lifts or numbers. ${BASE_RULES}`,
  },
  recovery: {
    id: "recovery",
    animal: "Bear",
    name: "Bear",
    tagline: "Rest and recovery",
    systemPrompt: `You are Bear, a recovery and longevity specialist for Stride. Your domain is everything between workouts: sleep quality, stress management, mobility, active recovery, deload planning, and injury prevention. You look at the user's recent training volume and frequency to flag overtraining risk and prescribe appropriate rest. Be calm, measured, and science-backed — recovery is often neglected and you make the case for it without shaming hard training. Use bullet points for recovery protocols. ${BASE_RULES}`,
  },
  water: {
    id: "water",
    animal: "Axolotl",
    name: "Axolotl",
    tagline: "Daily hydration",
    systemPrompt: `You are Axolotl, a hydration specialist for Stride. Your domain is daily water intake, electrolyte balance, and how hydration affects performance, recovery, and energy. You have access to the user's water logs for today. Give practical, specific hydration advice — how much to drink, when, and why it matters for their specific goals and activity level. Keep it simple and actionable. ${BASE_RULES}`,
  },
  habit: {
    id: "habit",
    animal: "Mouse",
    name: "Mouse",
    tagline: "Small, consistent steps",
    systemPrompt: `You are Mouse, a habit and consistency coach for Stride. Your domain is the mental side of fitness: habit formation, motivation, dealing with setbacks, goal clarity, and building long-term consistency through small, sustainable actions. You look at the user's adherence patterns — logged meals, workout frequency — to identify where consistency is breaking down and why. Be empathetic but direct. Focus on tiny wins and compounding progress. Use short, punchy sentences. Avoid generic motivational platitudes — be specific to their actual data. ${BASE_RULES}`,
  },
  mindset: {
    id: "mindset",
    animal: "Unicorn",
    name: "Unicorn",
    tagline: "Mood, mindfulness, balance",
    systemPrompt: `You are Unicorn, a wellness and mindfulness coach for Stride. Your domain is emotional wellbeing, mood, stress, mindfulness, and the mind-body connection in fitness. You look at the user's mood logs, sleep quality, and stress patterns to give holistic guidance. Be warm, empathetic, and grounding. Help the user find balance — not just physical performance, but sustainable mental wellness. Use a calm, supportive tone. ${BASE_RULES}`,
  },
};

const KEYWORDS: Record<CoachType, string[]> = {
  diet: ["breakfast","lunch","dinner","snack","meal","meals","food","eat","ate","eaten","eating","protein","carb","carbs","fat","fats","calorie","calories","kcal","macro","macros","nutrition","diet","recipe","cook","cooked","cooking","ingredient","portion","grams","g ","oz ","lb ","serving","vegetable","fruit","meat","chicken","beef","fish","salmon","rice","bread","pasta","salad","soup","smoothie","yogurt","egg","eggs","cheese","milk","sugar","oil","butter","oats","pizza","burger","sandwich","taco","sushi","steak","pork","tofu","bean","beans","nut","nuts","avocado","banana","apple","berry","spinach","broccoli","carrot","potato","quinoa","lentil","hummus","hungry","full","beverage","coffee","tea","juice","keto","paleo","vegan","vegetarian","vitamin","fiber","cholesterol","deficit","surplus","bulking","cutting"],
  workout: ["workout","workouts","exercise","exercises","train","training","gym","lift","lifting","run","ran","running","jog","cardio","strength","rep","reps","set","sets","squat","deadlift","bench","press","pull","pull-up","push-up","dip","row","curl","lunge","plank","muscle","muscles","hypertrophy","iron","weight","weights","kg","kilogram","pound","pounds","dumbbell","barbell","kettlebell","treadmill","cycling","bike","swim","yoga","crossfit","hiit","circuit","stretch","pr","personal record","1rm","volume","intensity","progressive overload","superset","bicep","tricep","lat","glute","core","ab","abs"],
  recovery: ["sleep","slept","rest","resting","recover","recovery","injury","injured","pain","sore","soreness","tight","stiff","cramp","stretch","flexibility","mobility","massage","foam roll","ice","heat","sauna","cold plunge","deload","overtraining","fatigue","fatigued","tired","exhausted","nap","rest day","active recovery","sick","inflammation","rehab","knee","shoulder","back pain","hip","ankle","wrist","tendon","tendinitis","ligament","magnesium"],
  water: ["water","hydration","hydrate","hydrated","drink","drinking","thirsty","thirst","glass","glasses","litre","liter","ml","fluid","dehydrated","dehydration","electrolyte","h2o"],
  habit: ["habit","habits","routine","discipline","willpower","goal","goals","consistent","consistency","streak","streaks","small steps","tiny","daily","schedule","reminder","accountability","commitment","procrastinate","lazy","motivation","motivated","demotivated","stuck","setback","setbacks","progress","milestone"],
  mindset: ["mood","mindset","mental","mentally","stress","stressed","anxiety","anxious","worry","worried","confident","confidence","insecure","guilty","guilt","proud","fail","failed","failure","success","resilience","grit","burnout","overwhelmed","balance","mindful","mindfulness","meditation","emotional","feelings","feel","feeling","sad","happy","depressed","energized","calm","peace"],
  overall: [],
};

export function getCoach(type?: string): CoachConfig {
  return COACHES[(type as CoachType) ?? "overall"] ?? COACHES.overall;
}

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
  preferredCoach?: string | null;
  engagedWindows?: string[];
  topSuggestions?: string[];
  acceptRate?: number;
} | null): string {
  if (!profile) return "";
  const parts: string[] = [];
  if (profile.preferredCoach) parts.push(`most-used specialist: ${profile.preferredCoach}`);
  if (profile.engagedWindows?.length) parts.push(`most active: ${profile.engagedWindows.join("/")}`);
  if (profile.topSuggestions?.length) parts.push(`acts on: ${profile.topSuggestions.slice(0, 3).join(", ")}`);
  if (profile.acceptRate != null) parts.push(`estimate acceptance: ${Math.round(profile.acceptRate * 100)}%`);
  return parts.length ? `Behavioral signals — ${parts.join("; ")}.` : "";
}

function scoreCoaches(message: string): Record<CoachType, number> {
  const text = message.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [type, words] of Object.entries(KEYWORDS) as [CoachType, string[]][]) {
    if (type === "overall") continue;
    let score = 0;
    for (const word of words) if (text.includes(word)) score++;
    scores[type] = score;
  }
  return scores as Record<CoachType, number>;
}

/**
 * Bias keyword scores toward the user's preferred coach. The boost (0.5) only
 * changes the outcome on ambiguous messages (ties or no keyword signal); a clear
 * keyword winner still wins. No preferred coach → scores unchanged.
 */
export function applyBehaviorBias(
  scores: Record<CoachType, number>,
  preferredCoach?: string | null,
): Record<CoachType, number> {
  if (preferredCoach && preferredCoach in COACHES && preferredCoach !== "overall") {
    return { ...scores, [preferredCoach]: (scores[preferredCoach as CoachType] ?? 0) + 0.5 };
  }
  return scores;
}

export function classifyCoachType(message: string, preferredCoach?: string | null): CoachType {
  const scores = applyBehaviorBias(scoreCoaches(message), preferredCoach);
  let best: CoachType = "overall";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores) as [CoachType, number][]) {
    if (type === "overall") continue;
    if (score > bestScore) { bestScore = score; best = type; }
  }
  return best;
}
