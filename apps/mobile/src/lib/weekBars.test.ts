import { describe, expect, it } from 'vitest'
import { weekBarLabel } from './weekBars'

describe('weekBarLabel', () => {
  it('reads a past day with its date and kcal', () => {
    expect(weekBarLabel('2026-11-02', '2026-11-08', 1849.6, 2000)).toBe('Mon, 2 Nov, 1,850 kcal')
  })

  it('says over target when the day went past it', () => {
    expect(weekBarLabel('2026-11-03', '2026-11-08', 2310, 2000)).toBe('Tue, 3 Nov, 2,310 kcal, over target')
  })

  it('does not call a day over when it rounds to the target', () => {
    expect(weekBarLabel('2026-11-03', '2026-11-08', 2000.4, 2000)).toBe('Tue, 3 Nov, 2,000 kcal')
  })

  it('says nothing logged for an empty day', () => {
    expect(weekBarLabel('2026-11-04', '2026-11-08', undefined, 2000)).toBe('Wed, 4 Nov, nothing logged')
  })

  it('reads today as today, so far', () => {
    expect(weekBarLabel('2026-11-08', '2026-11-08', 1200, 2000)).toBe('Today, 1,200 kcal so far')
  })

  it('skips the target part when there is no target yet', () => {
    expect(weekBarLabel('2026-11-05', '2026-11-08', 2600, null)).toBe('Thu, 5 Nov, 2,600 kcal')
  })
})
