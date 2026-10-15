import { describe, expect, it, vi } from 'vitest'
import { dobFromTyped, splitName, startTargetKg, stepDate, stepKg } from './profile'

// Native module that cannot load in Node. None of the tested functions call it.
vi.mock('expo-localization', () => ({ getLocales: () => [] }))

const TODAY = '2026-10-15'

describe('stepDate', () => {
  it('clamps the day to the end of a shorter month when the year moves', () => {
    expect(stepDate('2024-02-29', 'year', 1)).toBe('2025-02-28')
  })

  it('clamps the day when the month moves', () => {
    expect(stepDate('2024-01-31', 'month', 1)).toBe('2024-02-29')
    expect(stepDate('2024-03-31', 'month', -1)).toBe('2024-02-29')
  })

  it('stops the day at the first and last day of the month', () => {
    expect(stepDate('2024-05-31', 'day', 1)).toBe('2024-05-31')
    expect(stepDate('2024-01-01', 'day', -1)).toBe('2024-01-01')
  })
})

describe('dobFromTyped', () => {
  it('returns the date for a valid age', () => {
    expect(dobFromTyped('5', '3', '2000', TODAY)).toBe('2000-03-05')
    expect(dobFromTyped('15', '10', '2013', TODAY)).toBe('2013-10-15')
    expect(dobFromTyped('16', '10', '2013', TODAY)).toBeNull()
    expect(dobFromTyped('15', '10', '2014', TODAY)).toBeNull()
  })

  it('rejects an age over 120', () => {
    expect(dobFromTyped('1', '1', '1900', TODAY)).toBeNull()
  })

  it('rejects dates that do not exist', () => {
    expect(dobFromTyped('31', '2', '2000', TODAY)).toBeNull()
  })
})

describe('stepKg', () => {
  it('moves 0.1 kg in metric and stays inside the 30 kg floor', () => {
    expect(stepKg(70, 1, 'metric')).toBe(70.1)
    expect(stepKg(30, -1, 'metric')).toBe(30)
  })

  it('moves one whole pound in imperial, returned in kg', () => {
    // 70 kg is 154 lb. One pound up is 155 lb, which is 70.3 kg.
    expect(stepKg(70, 1, 'imperial')).toBe(70.3)
    expect(stepKg(70, -1, 'imperial')).toBe(69.4)
  })
})

describe('startTargetKg', () => {
  it('starts 5 kg below for a loss goal and above for a gain goal', () => {
    expect(startTargetKg('lose', undefined, 80)).toBe(75)
    expect(startTargetKg('gain', undefined, 60)).toBe(65)
  })

  it('keeps a saved target on the goal side and replaces one on the wrong side', () => {
    expect(startTargetKg('lose', 70, 80)).toBe(70)
    expect(startTargetKg('lose', 85, 80)).toBe(75)
  })

  it('clamps the start target to the 30 kg floor', () => {
    expect(startTargetKg('lose', undefined, 32)).toBe(30)
  })
})

describe('splitName', () => {
  it('splits at the first space', () => {
    expect(splitName('Mary Ann Smith')).toEqual({ firstName: 'Mary', lastName: 'Ann Smith' })
  })

  it('leaves last name empty for a single word', () => {
    expect(splitName('  Ada  ')).toEqual({ firstName: 'Ada', lastName: '' })
  })
})
