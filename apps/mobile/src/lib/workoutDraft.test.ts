import { describe, expect, it } from 'vitest'
import { fieldText, saveBlocker, type WorkoutItem } from './workoutDraft'

const strength: WorkoutItem = { key: 'item-1', name: 'Bench', kind: 'strength', candidateIds: [], sets: [{ weightKg: 60, reps: 8 }], problems: [] }
const cardio: WorkoutItem = { key: 'item-2', name: 'Walk', kind: 'cardio', candidateIds: [], sets: [], cardio: { durationMin: 10 }, problems: [] }

describe('saveBlocker', () => {
  it('lets a complete review save', () => {
    expect(saveBlocker([strength, cardio])).toBeNull()
  })

  it('stops the save while an item has a problem', () => {
    expect(saveBlocker([{ ...strength, problems: ['Lists have different lengths.'] }])).toBe('Bench: Lists have different lengths.')
  })

  it('stops the save while a set has no weight or reps', () => {
    expect(saveBlocker([{ ...strength, sets: [{ weightKg: 60 }] }])).toBe('Bench: add the weight and reps for every set.')
  })

  it('stops the save for cardio with neither minutes nor km', () => {
    expect(saveBlocker([{ ...cardio, cardio: { reportedKcal: 60 } }])).toBe('Walk: add minutes or km.')
  })
})

describe('fieldText', () => {
  it('shows a pound weight converted to kg with two decimals', () => {
    expect(fieldText(22 * 0.45359237)).toBe('9.98')
    expect(fieldText(1.609344)).toBe('1.61')
  })

  it('keeps whole and short numbers as typed, and blank for no value', () => {
    expect(fieldText(60)).toBe('60')
    expect(fieldText(42.5)).toBe('42.5')
    expect(fieldText(undefined)).toBe('')
  })
})
