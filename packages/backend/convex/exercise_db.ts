/**
 * Static exercise reference database with MET values.
 * Seeded from the Compendium of Physical Activities.
 * ~100 exercises covering strength, cardio, flexibility, and sport.
 */

export interface ExerciseMeta {
  canonical_name: string;
  aliases: string[];
  met_value: number;
  is_compound: boolean;
  muscle_groups: string[];
  category: "strength" | "cardio" | "flexibility" | "sport";
  rough?: boolean;
}

export interface ParsedExercise {
  name: string;
  sets: { weight: string; reps: string }[];
}

interface ExerciseDBEntry {
  canonical_name: string;
  aliases: string[];
  met_value: number;
  is_compound: boolean;
  muscle_groups: string[];
  category: "strength" | "cardio" | "flexibility" | "sport";
}

// Compendium of Physical Activities MET values (2011 update)
// MET = metabolic equivalent (1 MET = 3.5 mL O₂/kg/min)
const EXERCISE_DB: ExerciseDBEntry[] = [
  // ─── Strength: Compound ───────────────────────────────────────────────
  { canonical_name: "Barbell Back Squat", aliases: ["back squat", "squat", "barbell squat", "squats"], met_value: 5.0, is_compound: true, muscle_groups: ["quadriceps", "hamstrings", "glutes", "core"], category: "strength" },
  { canonical_name: "Barbell Front Squat", aliases: ["front squat"], met_value: 5.0, is_compound: true, muscle_groups: ["quadriceps", "glutes", "core"], category: "strength" },
  { canonical_name: "Barbell Deadlift", aliases: ["deadlift", "conventional deadlift", "deadlifts"], met_value: 6.0, is_compound: true, muscle_groups: ["hamstrings", "glutes", "back", "traps"], category: "strength" },
  { canonical_name: "Romanian Deadlift", aliases: ["rdl", "romanian deadlift", "stiff leg deadlift"], met_value: 5.5, is_compound: true, muscle_groups: ["hamstrings", "glutes", "lower back"], category: "strength" },
  { canonical_name: "Sumo Deadlift", aliases: ["sumo deadlift"], met_value: 6.0, is_compound: true, muscle_groups: ["hamstrings", "glutes", "adductors"], category: "strength" },
  { canonical_name: "Barbell Bench Press", aliases: ["bench press", "bench", "barbell bench", "flat bench"], met_value: 4.5, is_compound: true, muscle_groups: ["chest", "triceps", "shoulders"], category: "strength" },
  { canonical_name: "Incline Bench Press", aliases: ["incline bench", "incline press"], met_value: 4.5, is_compound: true, muscle_groups: ["upper chest", "shoulders", "triceps"], category: "strength" },
  { canonical_name: "Decline Bench Press", aliases: ["decline bench", "decline press"], met_value: 4.5, is_compound: true, muscle_groups: ["lower chest", "triceps"], category: "strength" },
  { canonical_name: "Overhead Press", aliases: ["ohp", "shoulder press", "military press", "strict press", "barbell overhead press"], met_value: 4.5, is_compound: true, muscle_groups: ["shoulders", "triceps", "core"], category: "strength" },
  { canonical_name: "Push Press", aliases: ["push press"], met_value: 5.0, is_compound: true, muscle_groups: ["shoulders", "triceps", "legs"], category: "strength" },
  { canonical_name: "Barbell Row", aliases: ["barbell row", "bent over row", "bent-over row", "barbell rows", "rows"], met_value: 4.8, is_compound: true, muscle_groups: ["back", "biceps", "lats"], category: "strength" },
  { canonical_name: "Pendlay Row", aliases: ["pendlay row"], met_value: 5.0, is_compound: true, muscle_groups: ["back", "lats", "biceps"], category: "strength" },
  { canonical_name: "Pull Up", aliases: ["pull up", "pullups", "pull-ups", "chin up", "chinup", "chin-ups"], met_value: 5.5, is_compound: true, muscle_groups: ["back", "biceps", "lats"], category: "strength" },
  { canonical_name: "Weighted Pull Up", aliases: ["weighted pull up", "weighted pullups"], met_value: 6.0, is_compound: true, muscle_groups: ["back", "biceps", "lats"], category: "strength" },
  { canonical_name: "Dip", aliases: ["dips", "parallel bar dip", "tricep dip", "chest dip"], met_value: 5.0, is_compound: true, muscle_groups: ["chest", "triceps", "shoulders"], category: "strength" },
  { canonical_name: "Weighted Dip", aliases: ["weighted dip", "weighted dips"], met_value: 5.5, is_compound: true, muscle_groups: ["chest", "triceps", "shoulders"], category: "strength" },
  { canonical_name: "Barbell Lunge", aliases: ["barbell lunge", "lunges", "walking lunge", "lunges with barbell"], met_value: 5.0, is_compound: true, muscle_groups: ["quadriceps", "glutes", "hamstrings"], category: "strength" },
  { canonical_name: "Bulgarian Split Squat", aliases: ["bulgarian split squat", "bulgarian squat", "split squat"], met_value: 5.0, is_compound: true, muscle_groups: ["quadriceps", "glutes"], category: "strength" },
  { canonical_name: "Power Clean", aliases: ["power clean", "clean", "hang clean"], met_value: 8.0, is_compound: true, muscle_groups: ["full body", "traps", "legs"], category: "strength" },
  { canonical_name: "Clean and Jerk", aliases: ["clean and jerk", "c&j", "clean jerk"], met_value: 9.0, is_compound: true, muscle_groups: ["full body", "shoulders", "legs"], category: "strength" },
  { canonical_name: "Snatch", aliases: ["snatch", "barbell snatch"], met_value: 9.0, is_compound: true, muscle_groups: ["full body", "shoulders", "legs", "back"], category: "strength" },
  { canonical_name: "Dumbbell Bench Press", aliases: ["dumbbell bench press", "db bench", "db press", "dumbbell press"], met_value: 4.5, is_compound: true, muscle_groups: ["chest", "triceps", "shoulders"], category: "strength" },
  { canonical_name: "Dumbbell Shoulder Press", aliases: ["dumbbell shoulder press", "db shoulder press", "seated db press"], met_value: 4.5, is_compound: true, muscle_groups: ["shoulders", "triceps"], category: "strength" },
  { canonical_name: "Dumbbell Row", aliases: ["dumbbell row", "db row", "one arm row", "single arm row"], met_value: 4.3, is_compound: true, muscle_groups: ["back", "biceps", "lats"], category: "strength" },
  { canonical_name: "Goblet Squat", aliases: ["goblet squat", "dumbbell squat"], met_value: 5.0, is_compound: true, muscle_groups: ["quadriceps", "glutes", "core"], category: "strength" },
  { canonical_name: "Kettlebell Swing", aliases: ["kettlebell swing", "kb swing", "swings"], met_value: 7.0, is_compound: true, muscle_groups: ["glutes", "hamstrings", "core", "shoulders"], category: "strength" },
  { canonical_name: "Thruster", aliases: ["thruster", "dumbbell thruster", "barbell thruster"], met_value: 7.5, is_compound: true, muscle_groups: ["full body", "quadriceps", "shoulders"], category: "strength" },
  { canonical_name: "T-Bar Row", aliases: ["t bar row", "t-bar row", "landmine row"], met_value: 4.8, is_compound: true, muscle_groups: ["back", "lats", "biceps"], category: "strength" },

  // ─── Strength: Isolation ──────────────────────────────────────────────
  { canonical_name: "Bicep Curl", aliases: ["bicep curl", "barbell curl", "dumbbell curl", "bicep curls", "curls", "db curl"], met_value: 3.5, is_compound: false, muscle_groups: ["biceps"], category: "strength" },
  { canonical_name: "Hammer Curl", aliases: ["hammer curl", "hammer curls"], met_value: 3.5, is_compound: false, muscle_groups: ["biceps", "forearms"], category: "strength" },
  { canonical_name: "Tricep Extension", aliases: ["tricep extension", "tricep pushdown", "tricep press", "skull crusher", "skull crushers"], met_value: 3.5, is_compound: false, muscle_groups: ["triceps"], category: "strength" },
  { canonical_name: "Tricep Pushdown", aliases: ["tricep pushdown", "cable pushdown", "rope pushdown"], met_value: 3.5, is_compound: false, muscle_groups: ["triceps"], category: "strength" },
  { canonical_name: "Lateral Raise", aliases: ["lateral raise", "side raise", "side lateral"], met_value: 3.5, is_compound: false, muscle_groups: ["shoulders"], category: "strength" },
  { canonical_name: "Front Raise", aliases: ["front raise", "front delt raise"], met_value: 3.5, is_compound: false, muscle_groups: ["shoulders"], category: "strength" },
  { canonical_name: "Rear Delt Fly", aliases: ["rear delt fly", "rear fly", "reverse fly", "bent over fly"], met_value: 3.5, is_compound: false, muscle_groups: ["shoulders", "upper back"], category: "strength" },
  { canonical_name: "Leg Curl", aliases: ["leg curl", "hamstring curl", "lying leg curl", "seated leg curl"], met_value: 3.5, is_compound: false, muscle_groups: ["hamstrings"], category: "strength" },
  { canonical_name: "Leg Extension", aliases: ["leg extension", "quad extension"], met_value: 3.5, is_compound: false, muscle_groups: ["quadriceps"], category: "strength" },
  { canonical_name: "Leg Press", aliases: ["leg press", "machine leg press"], met_value: 5.0, is_compound: true, muscle_groups: ["quadriceps", "glutes", "hamstrings"], category: "strength" },
  { canonical_name: "Calf Raise", aliases: ["calf raise", "calf raises", "standing calf raise", "seated calf raise"], met_value: 3.5, is_compound: false, muscle_groups: ["calves"], category: "strength" },
  { canonical_name: "Chest Fly", aliases: ["chest fly", "pec fly", "dumbbell fly", "cable fly", "pec deck"], met_value: 3.5, is_compound: false, muscle_groups: ["chest"], category: "strength" },
  { canonical_name: "Lat Pulldown", aliases: ["lat pulldown", "pulldown", "lat pull down"], met_value: 4.0, is_compound: true, muscle_groups: ["back", "lats", "biceps"], category: "strength" },
  { canonical_name: "Seated Cable Row", aliases: ["seated cable row", "cable row", "seated row"], met_value: 4.0, is_compound: true, muscle_groups: ["back", "biceps"], category: "strength" },
  { canonical_name: "Face Pull", aliases: ["face pull", "face pulls"], met_value: 3.5, is_compound: false, muscle_groups: ["shoulders", "upper back", "rotator cuff"], category: "strength" },
  { canonical_name: "Cable Crossover", aliases: ["cable crossover", "cable fly", "cable cross"], met_value: 3.5, is_compound: false, muscle_groups: ["chest"], category: "strength" },
  { canonical_name: "Hip Thrust", aliases: ["hip thrust", "barbell hip thrust", "glute bridge"], met_value: 4.5, is_compound: true, muscle_groups: ["glutes", "hamstrings"], category: "strength" },
  { canonical_name: "Glute Bridge", aliases: ["glute bridge", "barbell glute bridge"], met_value: 4.0, is_compound: true, muscle_groups: ["glutes", "hamstrings"], category: "strength" },
  { canonical_name: "Ab Wheel Rollout", aliases: ["ab wheel", "ab rollout", "ab roller"], met_value: 4.0, is_compound: true, muscle_groups: ["core", "shoulders", "back"], category: "strength" },
  { canonical_name: "Plank", aliases: ["plank", "forearm plank", "high plank"], met_value: 3.0, is_compound: true, muscle_groups: ["core", "shoulders"], category: "strength" },
  { canonical_name: "Crunches", aliases: ["crunch", "crunches", "ab crunch"], met_value: 3.5, is_compound: false, muscle_groups: ["abs"], category: "strength" },
  { canonical_name: "Leg Raise", aliases: ["leg raise", "hanging leg raise", "lying leg raise"], met_value: 3.5, is_compound: false, muscle_groups: ["abs", "hip flexors"], category: "strength" },
  { canonical_name: "Russian Twist", aliases: ["russian twist", "russian twists"], met_value: 3.5, is_compound: false, muscle_groups: ["abs", "obliques"], category: "strength" },
  { canonical_name: "Preacher Curl", aliases: ["preacher curl", "preacher curls"], met_value: 3.5, is_compound: false, muscle_groups: ["biceps"], category: "strength" },
  { canonical_name: "Concentration Curl", aliases: ["concentration curl"], met_value: 3.5, is_compound: false, muscle_groups: ["biceps"], category: "strength" },
  { canonical_name: "Wrist Curl", aliases: ["wrist curl", "wrist curls"], met_value: 2.5, is_compound: false, muscle_groups: ["forearms"], category: "strength" },
  { canonical_name: "Farmer Walk", aliases: ["farmer walk", "farmers walk", "farmer's walk", "farmer carry"], met_value: 6.0, is_compound: true, muscle_groups: ["full body", "grip", "traps"], category: "strength" },
  { canonical_name: "Shrug", aliases: ["shrug", "dumbbell shrug", "barbell shrug", "shrugs"], met_value: 3.5, is_compound: false, muscle_groups: ["traps"], category: "strength" },
  { canonical_name: "Good Morning", aliases: ["good morning", "barbell good morning"], met_value: 4.5, is_compound: true, muscle_groups: ["hamstrings", "lower back", "glutes"], category: "strength" },
  { canonical_name: "Hyperextension", aliases: ["hyperextension", "back extension", "back raise"], met_value: 3.5, is_compound: false, muscle_groups: ["lower back", "glutes"], category: "strength" },

  // ─── Cardio ───────────────────────────────────────────────────────────
  { canonical_name: "Running", aliases: ["running", "run", "jog", "jogging"], met_value: 8.0, is_compound: true, muscle_groups: ["full body", "legs", "cardiovascular"], category: "cardio" },
  { canonical_name: "Treadmill Running", aliases: ["treadmill", "treadmill run", "treadmill running"], met_value: 8.0, is_compound: true, muscle_groups: ["full body", "legs"], category: "cardio" },
  { canonical_name: "Walking", aliases: ["walking", "walk", "brisk walk"], met_value: 3.5, is_compound: false, muscle_groups: ["legs"], category: "cardio" },
  { canonical_name: "Cycling", aliases: ["cycling", "bike", "biking", "cycle", "bicycle"], met_value: 7.5, is_compound: false, muscle_groups: ["legs", "cardiovascular"], category: "cardio" },
  { canonical_name: "Stationary Bike", aliases: ["stationary bike", "exercise bike", "spin bike", "spinning"], met_value: 7.0, is_compound: false, muscle_groups: ["legs", "cardiovascular"], category: "cardio" },
  { canonical_name: "Rowing Machine", aliases: ["rowing", "rower", "rowing machine", "erg", "concept2"], met_value: 7.0, is_compound: true, muscle_groups: ["full body", "back", "legs"], category: "cardio" },
  { canonical_name: "Jump Rope", aliases: ["jump rope", "skipping", "jumping rope", "skip rope"], met_value: 11.0, is_compound: true, muscle_groups: ["full body", "calves", "cardiovascular"], category: "cardio" },
  { canonical_name: "Elliptical", aliases: ["elliptical", "cross trainer", "elliptical trainer"], met_value: 6.5, is_compound: true, muscle_groups: ["full body", "legs"], category: "cardio" },
  { canonical_name: "Stair Climbing", aliases: ["stair climbing", "stairs", "stair climber", "stair master"], met_value: 9.0, is_compound: false, muscle_groups: ["legs", "glutes", "cardiovascular"], category: "cardio" },
  { canonical_name: "Burpees", aliases: ["burpee", "burpees"], met_value: 8.0, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "cardio" },
  { canonical_name: "Mountain Climbers", aliases: ["mountain climbers", "mountain climber"], met_value: 8.0, is_compound: true, muscle_groups: ["full body", "core", "cardiovascular"], category: "cardio" },
  { canonical_name: "HIIT", aliases: ["hiit", "high intensity interval training", "interval training", "sprint intervals"], met_value: 10.0, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "cardio" },
  { canonical_name: "Swimming", aliases: ["swimming", "swim", "laps", "pool"], met_value: 8.0, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "cardio" },
  { canonical_name: "Boxing", aliases: ["boxing", "heavy bag", "punching bag", "shadow boxing"], met_value: 8.5, is_compound: true, muscle_groups: ["full body", "shoulders", "cardiovascular"], category: "cardio" },
  { canonical_name: "Jumping Jacks", aliases: ["jumping jacks", "jumping jack", "star jumps"], met_value: 7.5, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "cardio" },

  // ─── Flexibility ──────────────────────────────────────────────────────
  { canonical_name: "Yoga", aliases: ["yoga", "vinyasa", "hatha yoga", "power yoga", "yoga flow", "ashtanga"], met_value: 3.3, is_compound: false, muscle_groups: ["full body", "flexibility", "core"], category: "flexibility" },
  { canonical_name: "Pilates", aliases: ["pilates", "reformer pilates", "mat pilates"], met_value: 3.5, is_compound: false, muscle_groups: ["core", "flexibility"], category: "flexibility" },
  { canonical_name: "Stretching", aliases: ["stretching", "stretch", "static stretch", "dynamic stretch", "mobility", "warm up", "cool down"], met_value: 2.5, is_compound: false, muscle_groups: ["full body", "flexibility"], category: "flexibility" },
  { canonical_name: "Foam Rolling", aliases: ["foam rolling", "foam roller", "smr", "self myofascial release"], met_value: 2.0, is_compound: false, muscle_groups: ["full body", "flexibility"], category: "flexibility" },

  // ─── Sport ────────────────────────────────────────────────────────────
  { canonical_name: "Basketball", aliases: ["basketball", "hoops", "b-ball"], met_value: 6.5, is_compound: true, muscle_groups: ["full body", "legs", "cardiovascular"], category: "sport" },
  { canonical_name: "Soccer", aliases: ["soccer", "football", "futsal"], met_value: 7.0, is_compound: true, muscle_groups: ["full body", "legs", "cardiovascular"], category: "sport" },
  { canonical_name: "Tennis", aliases: ["tennis", "court tennis"], met_value: 7.3, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "sport" },
  { canonical_name: "Badminton", aliases: ["badminton"], met_value: 5.5, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "sport" },
  { canonical_name: "Cricket", aliases: ["cricket"], met_value: 5.0, is_compound: true, muscle_groups: ["full body"], category: "sport" },
  { canonical_name: "Volleyball", aliases: ["volleyball", "beach volleyball"], met_value: 5.5, is_compound: true, muscle_groups: ["full body"], category: "sport" },
  { canonical_name: "Martial Arts", aliases: ["martial arts", "mma", "bjj", "judo", "karate", "taekwondo", "jiu jitsu", "muay thai", "krav maga"], met_value: 9.0, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "sport" },
  { canonical_name: "CrossFit", aliases: ["crossfit", "wod", "metcon", "cross fit"], met_value: 8.5, is_compound: true, muscle_groups: ["full body", "cardiovascular"], category: "sport" },
  { canonical_name: "Calisthenics", aliases: ["calisthenics", "bodyweight", "bodyweight training", "street workout"], met_value: 5.5, is_compound: true, muscle_groups: ["full body"], category: "strength" },
  { canonical_name: "Push Up", aliases: ["push up", "pushups", "push-ups", "press up"], met_value: 5.0, is_compound: true, muscle_groups: ["chest", "triceps", "shoulders", "core"], category: "strength" },
  { canonical_name: "Sit Up", aliases: ["sit up", "sit-ups", "situps", "situp"], met_value: 5.0, is_compound: false, muscle_groups: ["abs", "hip flexors"], category: "strength" },
  { canonical_name: "Box Jump", aliases: ["box jump", "box jumps", "plyo box"], met_value: 8.0, is_compound: true, muscle_groups: ["legs", "glutes", "cardiovascular"], category: "strength" },
  { canonical_name: "Sled Push", aliases: ["sled push", "sled drag", "prowler"], met_value: 8.5, is_compound: true, muscle_groups: ["full body", "legs"], category: "strength" },
  { canonical_name: "Battle Ropes", aliases: ["battle ropes", "battle rope", "ropes"], met_value: 7.5, is_compound: true, muscle_groups: ["full body", "shoulders", "cardiovascular"], category: "strength" },
  { canonical_name: "Tire Flip", aliases: ["tire flip", "tire flips"], met_value: 8.5, is_compound: true, muscle_groups: ["full body", "legs", "back"], category: "strength" },
  { canonical_name: "Wall Ball", aliases: ["wall ball", "wall balls", "wallball"], met_value: 7.0, is_compound: true, muscle_groups: ["full body", "legs", "shoulders"], category: "strength" },
  { canonical_name: "Dumbbell Snatch", aliases: ["dumbbell snatch", "db snatch", "single arm snatch"], met_value: 7.5, is_compound: true, muscle_groups: ["full body", "shoulders", "legs"], category: "strength" },
  { canonical_name: "Dumbbell Clean and Press", aliases: ["dumbbell clean and press", "db clean and press", "dumbbell clean press"], met_value: 7.5, is_compound: true, muscle_groups: ["full body", "shoulders", "legs"], category: "strength" },
  { canonical_name: "Pull Over", aliases: ["pull over", "dumbbell pullover", "barbell pullover"], met_value: 4.0, is_compound: true, muscle_groups: ["chest", "lats", "triceps"], category: "strength" },
  { canonical_name: "Arnold Press", aliases: ["arnold press", "arnold dumbbell press"], met_value: 4.5, is_compound: false, muscle_groups: ["shoulders", "triceps"], category: "strength" },
  { canonical_name: "Turkish Get Up", aliases: ["turkish get up", "tgu", "turkish getup"], met_value: 5.5, is_compound: true, muscle_groups: ["full body", "shoulders", "core"], category: "strength" },
  { canonical_name: "Muscle Up", aliases: ["muscle up", "muscle ups", "bar muscle up", "ring muscle up"], met_value: 6.5, is_compound: true, muscle_groups: ["full body", "back", "arms"], category: "strength" },
  { canonical_name: "Handstand Push Up", aliases: ["handstand push up", "handstand pushups", "hspu"], met_value: 6.5, is_compound: true, muscle_groups: ["shoulders", "triceps", "core"], category: "strength" },
  { canonical_name: "Pistol Squat", aliases: ["pistol squat", "pistol squats", "single leg squat"], met_value: 6.0, is_compound: true, muscle_groups: ["quadriceps", "glutes", "balance"], category: "strength" },
  { canonical_name: "Nordic Curl", aliases: ["nordic curl", "nordic hamstring curl"], met_value: 5.5, is_compound: false, muscle_groups: ["hamstrings"], category: "strength" },
  { canonical_name: "Copenhagen Plank", aliases: ["copenhagen plank", "side plank raise"], met_value: 4.0, is_compound: false, muscle_groups: ["adductors", "core", "obliques"], category: "strength" },
  { canonical_name: "Suitcase Carry", aliases: ["suitcase carry", "single arm carry"], met_value: 5.0, is_compound: true, muscle_groups: ["core", "obliques", "grip"], category: "strength" },
];

// Lowercase cache for fast lookup
const NAME_INDEX = new Map<string, ExerciseDBEntry>();
for (const entry of EXERCISE_DB) {
  NAME_INDEX.set(entry.canonical_name.toLowerCase(), entry);
  for (const alias of entry.aliases) {
    if (!NAME_INDEX.has(alias.toLowerCase())) {
      NAME_INDEX.set(alias.toLowerCase(), entry);
    }
  }
}

// Broad workout labels cannot be matched to one exercise reliably. These METs
// use representative exercises from the table above and are marked as rough.
const CATEGORY_FALLBACKS: Array<{
  keywords: RegExp;
  canonical_name: string;
  met_value: number;
  muscle_groups: string[];
  category: ExerciseMeta["category"];
}> = [
  { keywords: /\b(?:cardio|aerobic)\b/, canonical_name: "Cardio", met_value: 7.5, muscle_groups: ["full body", "cardiovascular"], category: "cardio" },
  { keywords: /\b(?:full[ -]?body|total[ -]?body)\b/, canonical_name: "Full Body Workout", met_value: 6.0, muscle_groups: ["full body"], category: "strength" },
  { keywords: /\b(?:leg day|legs?|lower[ -]?body)\b/, canonical_name: "Lower Body Workout", met_value: 5.0, muscle_groups: ["quadriceps", "hamstrings", "glutes"], category: "strength" },
  { keywords: /\b(?:chest|push)\b/, canonical_name: "Chest Workout", met_value: 4.5, muscle_groups: ["chest", "triceps", "shoulders"], category: "strength" },
  { keywords: /\b(?:back|pull)\b/, canonical_name: "Back Workout", met_value: 4.8, muscle_groups: ["back", "biceps", "lats"], category: "strength" },
  { keywords: /\b(?:upper[ -]?body)\b/, canonical_name: "Upper Body Workout", met_value: 4.5, muscle_groups: ["chest", "back", "shoulders", "arms"], category: "strength" },
  { keywords: /\b(?:core|abs?|abdominals?)\b/, canonical_name: "Core Workout", met_value: 3.5, muscle_groups: ["core", "abs"], category: "strength" },
  { keywords: /\b(?:arms?|arm day|biceps?|triceps?)\b/, canonical_name: "Arm Workout", met_value: 3.5, muscle_groups: ["biceps", "triceps"], category: "strength" },
  { keywords: /\b(?:shoulders?|shoulder day|delts?)\b/, canonical_name: "Shoulder Workout", met_value: 4.0, muscle_groups: ["shoulders", "triceps"], category: "strength" },
];

/**
 * Levenshtein distance for fuzzy matching.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Lookup an exercise by name using exact alias match first, then fuzzy.
 */
export function lookupExercise(name: string): ExerciseMeta | null {
  const normalized = name.toLowerCase().trim();

  // Strip common suffixes for better matching
  const stripped = normalized
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*-\s*variation$/g, "")
    .trim();

  // Exact match
  const exact = NAME_INDEX.get(stripped);
  if (exact) return exerciseToMeta(exact);

  // Fuzzy match with threshold
  let bestDistance = Infinity;
  let bestMatch: ExerciseDBEntry | null = null;

  for (const entry of EXERCISE_DB) {
    // Check canonical
    const distCanon = levenshtein(stripped, entry.canonical_name.toLowerCase());
    if (distCanon < bestDistance) {
      bestDistance = distCanon;
      bestMatch = entry;
    }

    // Check aliases
    for (const alias of entry.aliases) {
      const distAlias = levenshtein(stripped, alias.toLowerCase());
      if (distAlias < bestDistance) {
        bestDistance = distAlias;
        bestMatch = entry;
      }
    }
  }

  // Accept fuzzy match if distance is reasonable (<= 3 edits)
  if (bestMatch && bestDistance <= 3) {
    return exerciseToMeta(bestMatch);
  }

  const categoryFallback = CATEGORY_FALLBACKS.find(({ keywords }) => keywords.test(stripped));
  if (categoryFallback) {
    return {
      canonical_name: categoryFallback.canonical_name,
      aliases: [],
      met_value: categoryFallback.met_value,
      is_compound: categoryFallback.muscle_groups.length > 2,
      muscle_groups: categoryFallback.muscle_groups,
      category: categoryFallback.category,
      rough: true,
    };
  }

  return null;
}

function exerciseToMeta(entry: ExerciseDBEntry): ExerciseMeta {
  return {
    canonical_name: entry.canonical_name,
    aliases: entry.aliases,
    met_value: entry.met_value,
    is_compound: entry.is_compound,
    muscle_groups: entry.muscle_groups,
    category: entry.category,
  };
}

/**
 * Calculate duration-weighted average MET from a list of parsed exercises.
 * Falls back to category default if an exercise isn't found.
 */
export function getWeightedMET(
  exercises: ParsedExercise[],
): number {
  if (exercises.length === 0) return 5.0;

  let totalMet = 0;
  let count = 0;

  for (const ex of exercises) {
    const meta = lookupExercise(ex.name);
    const met = meta ? meta.met_value : 5.0; // Default to 5.0 MET for unknown strength
    totalMet += met * Math.max(1, ex.sets.length);
    count += Math.max(1, ex.sets.length);
  }

  return count > 0 ? Math.round((totalMet / count) * 10) / 10 : 5.0;
}

/**
 * Get exercise metadata for all parsed exercises.
 * Returns metadata for matched exercises, null for unmatched.
 */
export function matchExercises(
  exercises: ParsedExercise[],
): Array<ExerciseMeta & { matched: boolean }> {
  return exercises.map((ex) => {
    const meta = lookupExercise(ex.name);
    if (meta) return { ...meta, matched: true };
    return {
      canonical_name: ex.name,
      aliases: [],
      met_value: 5.0,
      is_compound: false,
      muscle_groups: [],
      category: "strength" as const,
      matched: false,
    };
  });
}

/**
 * Get the dominant exercise category (most common).
 */
export function getDominantCategory(
  exerciseMetas: Array<{ category: string }>,
): string {
  const counts: Record<string, number> = {};
  for (const meta of exerciseMetas) {
    counts[meta.category] = (counts[meta.category] || 0) + 1;
  }
  let maxCat = "strength";
  let maxCount = 0;
  for (const [cat, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxCat = cat;
    }
  }
  return maxCat;
}
