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

const KEYWORDS: Record<CoachType, string[]> = {
  diet: ["breakfast","lunch","dinner","snack","meal","meals","food","eat","ate","eaten","eating","protein","carb","carbs","fat","fats","calorie","calories","kcal","macro","macros","nutrition","diet","recipe","cook","cooked","cooking","ingredient","portion","grams","g ","oz ","lb ","serving","vegetable","fruit","meat","chicken","beef","fish","salmon","rice","bread","pasta","salad","soup","smoothie","yogurt","egg","eggs","cheese","milk","sugar","oil","butter","oats","pizza","burger","sandwich","taco","sushi","steak","pork","tofu","bean","beans","nut","nuts","avocado","banana","apple","berry","spinach","broccoli","carrot","potato","quinoa","lentil","hummus","hungry","full","beverage","drink","coffee","tea","juice","keto","paleo","vegan","vegetarian","vitamin","fiber","cholesterol","deficit","surplus","bulking","cutting"],
  workout: ["workout","workouts","exercise","exercises","train","training","gym","lift","lifting","run","ran","running","jog","cardio","strength","rep","reps","set","sets","squat","deadlift","bench","press","pull","pull-up","push-up","dip","row","curl","lunge","plank","muscle","muscles","hypertrophy","iron","weight","weights","kg","kilogram","pound","pounds","dumbbell","barbell","kettlebell","treadmill","cycling","bike","swim","yoga","crossfit","hiit","circuit","stretch","pr","personal record","1rm","volume","intensity","progressive overload","superset","bicep","tricep","lat","glute","core","ab","abs"],
  recovery: ["sleep","slept","rest","resting","recover","recovery","injury","injured","pain","sore","soreness","tight","stiff","cramp","stretch","flexibility","mobility","massage","foam roll","ice","heat","sauna","cold plunge","deload","overtraining","fatigue","fatigued","tired","exhausted","nap","rest day","active recovery","sick","inflammation","rehab","knee","shoulder","back pain","hip","ankle","wrist","tendon","tendinitis","ligament","hydration","electrolyte","magnesium"],
  mindset: ["motivation","motivated","demotivated","habit","habits","routine","discipline","willpower","goal","goals","mental","mentally","focus","focused","mindset","stress","stressed","anxiety","anxious","worry","worried","confident","confidence","insecure","procrastination","procrastinate","lazy","excuse","excuses","guilty","guilt","proud","fail","failed","failure","success","progress","stuck","struggle","resilience","grit","perseverance","determination","burnout","overwhelmed","balance","mindful","mindfulness","meditation","consistency","consistent","accountability","commitment"],
  overall: [],
};

export function getCoach(type?: string): CoachConfig {
  return COACHES[(type as CoachType) ?? "overall"] ?? COACHES.overall;
}

export function classifyCoachType(message: string): CoachType {
  const text = message.toLowerCase();
  let best: CoachType = "overall";
  let bestScore = 0;
  for (const [type, words] of Object.entries(KEYWORDS) as [CoachType, string[]][]) {
    if (type === "overall") continue;
    let score = 0;
    for (const word of words) {
      if (text.includes(word)) score++;
    }
    if (score > bestScore) { bestScore = score; best = type; }
  }
  return best;
}
