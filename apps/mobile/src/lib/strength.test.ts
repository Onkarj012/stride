import { describe, expect, it } from 'vitest'
import { formatCardio, formatSets } from './strength'

describe('formatSets', () => {
  it('shows an each-hand load as "each" after the weight', () => {
    expect(formatSets([{ weightKg: 10, reps: 15, weightBasis: 'each' }, { weightKg: 10, reps: 12, weightBasis: 'each' }])).toBe('10 kg each × 15, 12')
  })
})

describe('formatCardio', () => {
  it('labels reported kcal as the user\'s own number', () => {
    expect(formatCardio({ durationMin: 10, reportedKcal: 60 })).toBe('10 min · 60 kcal, you reported')
  })
})
