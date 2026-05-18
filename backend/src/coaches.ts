export type CoachType = "overall" | "workout" | "diet" | "recovery" | "mindset";

export interface CoachConfig {
  id: CoachType;
  name: string;
  tagline: string;
  systemPrompt: string;
}

const BASE_RULES = `Address the user by their name when appropriate. Be specific — reference their actual data, targets, and progress. Use markdown formatting: bold key numbers, use bullet lists for multi-step advice.`;

export const COACHES: Record<CoachType, CoachConfig> = {
  overall: {
    id: "overall",
    name: "StrideCoach",
    tagline: "Your all-in-one fitness & nutrition coach",
    systemPrompt: `You are StrideCoach, an elite AI fitness and nutrition coach for Stride. You take a holistic view — balancing training load, nutrition, recovery, and mindset. You're direct, motivating, and use a bold, confident tone. You have access to the user's full profile, today's meals and workouts, and recent history. Give concise, actionable advice. ${BASE_RULES} You can log meals and workouts when the user asks.`,
  },

  workout: {
    id: "workout",
    name: "IronCoach",
    tagline: "Training, programming, and performance",
    systemPrompt: `You are IronCoach, a specialist strength and conditioning coach for Stride. Your domain is exercise science: programming, periodization, technique, progressive overload, and performance. You understand the user's recent workout history and activity level. Focus exclusively on training — when nutrition or recovery comes up, briefly address it only as it relates to performance and defer deeper nutrition questions to the Diet Coach. Be precise and technical but motivating. Keep responses tight — use bullet points for exercise recommendations, bold key lifts or numbers. ${BASE_RULES}`,
  },

  diet: {
    id: "diet",
    name: "MacroCoach",
    tagline: "Nutrition, macros, and meal planning",
    systemPrompt: `You are MacroCoach, a precision nutrition coach for Stride. Your domain is food: macronutrient targets, meal timing, caloric balance, food quality, and practical meal planning. You have access to the user's calorie and macro targets, today's logged meals, and their nutrition history. Calculate macros on request, suggest meal swaps, and explain the "why" behind nutrition recommendations. Be analytical but practical — most people want simple food choices, not biochemistry lectures. Use bullet points for meal suggestions, bold macro numbers. ${BASE_RULES}`,
  },

  recovery: {
    id: "recovery",
    name: "RestCoach",
    tagline: "Recovery, sleep, and injury prevention",
    systemPrompt: `You are RestCoach, a recovery and longevity specialist for Stride. Your domain is everything between workouts: sleep quality, stress management, mobility, active recovery, deload planning, and injury prevention. You look at the user's recent training volume and frequency to flag overtraining risk and prescribe appropriate rest. Be calm, measured, and science-backed — recovery is often neglected and you make the case for it without shaming hard training. Use bullet points for recovery protocols. ${BASE_RULES}`,
  },

  mindset: {
    id: "mindset",
    name: "MindCoach",
    tagline: "Motivation, habits, and consistency",
    systemPrompt: `You are MindCoach, a performance mindset coach for Stride. Your domain is the mental side of fitness: habit formation, motivation, dealing with setbacks, goal clarity, and building long-term consistency. You look at the user's adherence patterns — logged meals, workout frequency — to identify where consistency is breaking down and why. Be empathetic but direct. You don't let users off the hook with excuses, but you do help them understand the real barriers. Use short, punchy sentences. Avoid generic motivational platitudes — be specific to their actual data. ${BASE_RULES}`,
  },
};

export function getCoach(type?: string): CoachConfig {
  return COACHES[(type as CoachType) ?? "overall"] ?? COACHES.overall;
}

const KEYWORDS: Record<CoachType, string[]> = {
  diet: [
    "breakfast", "lunch", "dinner", "snack", "meal", "meals", "food", "eat", "ate", "eaten", "eating",
    "protein", "carb", "carbs", "fat", "fats", "calorie", "calories", "kcal", "macro", "macros",
    "nutrition", "diet", "recipe", "cook", "cooked", "cooking", "ingredient", "ingredients",
    "portion", "portions", "grams", "g ", "oz ", "lb ", "serving", "servings",
    "vegetable", "vegetables", "fruit", "fruits", "meat", "chicken", "beef", "fish", "salmon",
    "rice", "bread", "pasta", "salad", "soup", "smoothie", "yogurt", "egg", "eggs",
    "cheese", "milk", "sugar", "salt", "oil", "butter", "oats", "cereal", "pancake",
    "pizza", "burger", "sandwich", "taco", "sushi", "steak", "pork", "tofu", "bean", "beans",
    "nut", "nuts", "seed", "seeds", "avocado", "banana", "apple", "orange", "berry", "berries",
    "spinach", "broccoli", "carrot", "potato", "sweet potato", "quinoa", "lentil", "hummus",
    "hungry", "full", "thirsty", "beverage", "drink", "coffee", "tea", "juice", "soda",
    "intermittent fasting", "keto", "paleo", "vegan", "vegetarian", "gluten", "dairy",
    "vitamin", "mineral", "fiber", "cholesterol", "sodium", "saturated", "unsaturated",
    "deficit", "surplus", "maintenance", "bulking", "cutting", "recomp",
  ],
  workout: [
    "workout", "workouts", "exercise", "exercises", "train", "training", "gym",
    "lift", "lifting", "lifted", "run", "ran", "running", "jog", "jogging", "jogged",
    "cardio", "strength", "rep", "reps", "set", "sets", "squat", "squats", "squatted",
    "deadlift", "deadlifts", "deadlifted", "bench", "bench press", "press", "pressing",
    "overhead press", "pull", "pull-up", "pullup", "chin-up", "chinup", "push-up", "pushup",
    "dip", "dips", "row", "rows", "curl", "curls", "extension", "extensions",
    "lunge", "lunges", "plank", "crunch", "crunches", "sit-up", "situp",
    "muscle", "muscles", "muscular", "hypertrophy", "iron",
    "weight", "weights", "kg", "kilogram", "pound", "pounds", "lb", "lbs",
    "dumbbell", "dumbbells", "barbell", "kettlebell", "kettlebells",
    "treadmill", "elliptical", "rowing", "rower", "swim", "swimming", "swam",
    "cycling", "cycle", "bike", "biking", "biked", "spin", "spinning",
    "hike", "hiking", "hiked", "climb", "climbing", "yoga", "pilates",
    "crossfit", "hiit", "tabata", "circuit", "warmup", "warm-up", "cooldown", "cool-down",
    "stretch", "stretching", "sweat", "sweating", "burn", "burned", "burning",
    "pr", "personal record", "pb", "one rep max", "1rm", "rm ",
    "volume", "intensity", "frequency", "progressive overload", "periodization",
    "superset", "drop set", "dropset", "amrap", "emom", "failure", "concentric", "eccentric",
    "hamstring", "quad", "quads", "quadtriceps", "bicep", "biceps", "tricep", "triceps",
    "delt", "delts", "deltoid", "deltoids", "lat", "lats", "latissimus", "pec", "pecs",
    "glute", "glutes", "gluteal", "calf", "calves", "ab", "abs", "core", "oblique",
    "trap", "traps", "trapezius", "rotator cuff", "forearm", "forearms",
    "powerlifting", "bodybuilding", "olympic", "strongman", "calisthenics",
    "resistance", "band", "bands", "machine", "machines", "cable", "cables",
  ],
  recovery: [
    "sleep", "slept", "sleeping", "rest", "resting", "rested", "recover", "recovery",
    "injury", "injuries", "injured", "pain", "pains", "painful", "sore", "soreness",
    "tight", "tightness", "stiff", "stiffness", "cramp", "cramps", "spasm",
    "stretch", "stretching", "stretched", "flexibility", "mobility",
    "massage", "massaged", "foam roll", "foam rolling", "roller", "myofascial",
    "ice", "icing", "iced", "heat", "heating", "sauna", "steam", "cold plunge", "cryotherapy",
    "deload", "deloading", "overtraining", "overreaching", "under-recovered",
    "fatigue", "fatigued", "tired", "exhausted", "exhaustion", "burnt out", "burnout",
    "nap", "naps", "napping", "rest day", "off day", "active recovery",
    "immunity", "immune", "sick", "illness", "inflammation", "inflammatory",
    "rehab", "rehabilitation", "physical therapy", "pt ", "physio", "physiotherapy",
    "ache", "aching", "strain", "sprain", "tear", "torn", "fracture", "broken",
    "knee", "shoulder", "back pain", "lower back", "hip", "ankle", "wrist", "elbow",
    "neck", "spine", "disc", "herniated", "tendon", "tendonitis", "tendinitis",
    "ligament", "meniscus", "rotator cuff", "labrum", "bursitis", "fasciitis",
    "compression", "elevation", "r.i.c.e", "rice protocol",
    "hydration", "hydrate", "hydrating", "dehydrated", "electrolyte", "electrolytes",
    "magnesium", "zinc", "melatonin", "cbd", "anti-inflammatory",
  ],
  mindset: [
    "motivation", "motivated", "motivate", "demotivated", "unmotivated",
    "habit", "habits", "habitual", "routine", "routines", "ritual", "rituals",
    "discipline", "disciplined", "willpower", "self-control", "self control",
    "goal", "goals", "goal-setting", "objective", "objectives", "target", "targets",
    "mental", "mentally", "psychology", "psychological", "cognitive",
    "focus", "focused", "unfocused", "distracted", "distraction", "concentration",
    "mindset", "mind", "mentality", "headspace", "state of mind",
    "stress", "stressed", "stressor", "stressful", "anxiety", "anxious", "anxiousness",
    "worry", "worried", "worrying", "nervous", "nervousness", "panic", "overthinking",
    "confident", "confidence", "self-confidence", "self esteem", "self-esteem", "self worth",
    "insecure", "insecurity", "doubt", "self-doubt", "imposter", "impostor",
    "procrastination", "procrastinate", "procrastinating", "lazy", "laziness",
    "excuse", "excuses", "justification", "reason", "reasons",
    "guilty", "guilt", "shame", "ashamed", "embarrassed", "regret", "regretful",
    "proud", "pride", "accomplishment", "achievement", "achieved", "accomplished",
    "fail", "failed", "failure", "failing", "success", "successful", "succeed",
    "progress", "progressive", "regress", "regression", "plateau", "plateaued",
    "stuck", "struggle", "struggling", "struggled", "challenge", "challenging",
    "overcome", "overcame", "obstacle", "obstacles", "barrier", "barriers",
    "resilience", "resilient", "grit", "perseverance", "persist", "persistence",
    "determination", "determined", "driven", "drive", "ambition", "ambitious",
    "burnout", "burnt out", "overwhelmed", "overwhelm", "overwhelming",
    "balance", "balanced", "unbalanced", "harmony", "holistic", "wellness",
    "mindful", "mindfulness", "meditation", "meditate", "breathing", "breathe",
    "visualization", "visualize", "affirmation", "affirm", "mantra", "journaling",
    "therapy", "therapist", "counseling", "counselor", "mental health",
    "comparison", "compare", "comparing", "social media", "perfection", "perfectionist",
    "consistency", "consistent", "inconsistent", "adherence", "compliance", "commitment",
    "committed", "dedication", "dedicated", "accountability", "accountable", "partner",
  ],
  overall: [],
};

/**
 * Classify a user message into the most appropriate coach type.
 * Uses weighted keyword matching. Falls back to "overall" when no strong signal.
 */
export function classifyCoachType(message: string): CoachType {
  const text = message.toLowerCase();
  let best: CoachType = "overall";
  let bestScore = 0;

  for (const [type, words] of Object.entries(KEYWORDS) as [CoachType, string[]][]) {
    if (type === "overall") continue;
    let score = 0;
    for (const word of words) {
      if (text.includes(word)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }

  return best;
}
