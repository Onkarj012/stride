import type { FunctionReturnType } from 'convex/server'
import type { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'

export type WorkoutDraftId = Id<'workout_drafts'>
export type WorkoutDraftView = FunctionReturnType<typeof api.workouts.draft>
export type WorkoutItem = WorkoutDraftView['draft']['items'][number]

// The first item problem that stops a save, in plain words, or null when every item is complete.
export function saveBlocker(items: WorkoutItem[]): string | null {
  for (const item of items) {
    const [problem] = item.problems
    if (problem !== undefined) return `${item.name}: ${problem}`
    if (item.kind === 'strength' && item.sets.some((set) => set.weightKg === undefined || set.reps === undefined))
      return `${item.name}: add the weight and reps for every set.`
    if (item.kind === 'cardio' && item.cardio?.durationMin === undefined && item.cardio?.distanceKm === undefined)
      return `${item.name}: add minutes or km.`
  }
  return null
}
