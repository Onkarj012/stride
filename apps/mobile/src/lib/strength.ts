import type { FunctionReturnType } from 'convex/server'
import type { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'

export type Exercise = FunctionReturnType<typeof api.exercises.search>[number]
export type SessionDetail = FunctionReturnType<typeof api.strength.sessionDetail>
export type SetView = SessionDetail['exercises'][number]['sets'][number]
export type StrengthStats = FunctionReturnType<typeof api.strength.stats>
export type SessionId = Id<'workout_sessions'>
export type ExerciseId = Id<'exercises'>
export type SetId = Id<'sets'>

/** Heaviest load the backend accepts for one set. */
export const MAX_KG = 1000
/** Most reps the backend accepts for one set. */
export const MAX_REPS = 1000

// Kilograms with at most one decimal and no trailing ".0": 42.5, 40.
export function formatKg(kg: number): string {
  return String(Math.round(kg * 10) / 10)
}

// One set as "40×8".
export function formatSet(set: { weightKg: number; reps: number }): string {
  return `${formatKg(set.weightKg)}×${set.reps}`
}

// A run of sets as "42.5 × 8, 8, 7" when the weight holds, else "40 × 8, 42.5 × 6".
export function formatSets(sets: { weightKg: number; reps: number }[]): string {
  const first = sets[0]
  if (!first) return ''
  if (sets.every((set) => set.weightKg === first.weightKg))
    return `${formatKg(first.weightKg)} kg × ${sets.map((set) => set.reps).join(', ')}`
  return sets.map((set) => `${formatKg(set.weightKg)} × ${set.reps}`).join(', ')
}

// Total kilograms moved, shortened past a thousand: 840, 6.4k.
export function formatTonnage(kg: number): string {
  return kg < 1000 ? String(Math.round(kg)) : `${Math.round(kg / 100) / 10}k`
}

// Weight change per stepper tap: finer for dumbbells, plate pairs for everything else.
export function weightStep(exercise: Exercise): number {
  return exercise.equipment === 'dumbbell' || exercise.equipment === 'kettlebells' ? 1 : 2.5
}

// Starting weight for a lift with no history, by equipment.
export function startingWeight(exercise: Exercise): number {
  if (exercise.equipment === 'body only' || exercise.equipment === null) return 0
  if (exercise.equipment === 'dumbbell' || exercise.equipment === 'kettlebells') return 10
  return 20
}

// "middle back" as "Middle back".
export function muscleName(muscle: string): string {
  return muscle.charAt(0).toUpperCase() + muscle.slice(1)
}
