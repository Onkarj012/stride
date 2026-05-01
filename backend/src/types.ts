export interface AuthUser {
  userId: string;
  email: string;
  name: string;
}

export interface MealRow {
  id: string;
  user_id: string;
  date: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
  ai_suggestion: string | null;
  meal_type?: string;
  created_at: string;
}

export interface MealResponse {
  _id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
  date: string;
  aiSuggestion: string | null;
  mealType?: string;
}

export interface WorkoutRow {
  id: string;
  user_id: string;
  date: string;
  name: string;
  sets: string;
  reps: string | null;
  weight: string | null;
  duration: string | null;
  intensity: string;
  exercises?: string | null;
  created_at: string;
}

export interface WorkoutExerciseSet {
  weight: string;
  reps: string;
}

export interface WorkoutExercise {
  name: string;
  /** New schema: array of per-set {weight, reps}. Legacy may use flat string. */
  sets: WorkoutExerciseSet[] | string;
  reps?: string;
  weight?: string;
}

export interface WorkoutResponse {
  _id: string;
  name: string;
  sets: string;
  reps: string | null;
  weight: string | null;
  duration: string | null;
  intensity: string;
  date: string;
  exercises?: WorkoutExercise[] | null;
}

export interface GoalRow {
  id: string;
  user_id: string;
  date: string;
  calorie_goal: number;
  protein_goal: number;
  carb_goal: number;
  fat_goal: number;
}

export interface GoalResponse {
  calorieGoal: number;
  proteinGoal: number;
  carbGoal: number;
  fatGoal: number;
}

export interface ProgressDay {
  date: string;
  dayLabel: string;
  calories: number;
  protein: number;
  workouts: number;
  goal: number;
}

export interface ChatMessageRow {
  role: string;
  content: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export interface TokenRow {
  id: number;
  user_id: string;
  token: string;
  created_at: string;
}

export interface MealEstimate {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WorkoutSuggestion {
  name: string;
  sets: string;
  reps: string;
  weight: string;
  duration: string;
  intensity: string;
  rationale: string;
}
