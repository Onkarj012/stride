import { describe, expect, it, vi, afterEach } from 'vitest'
import { ConvexError } from 'convex/values'
import { PlainError, linesKcal, plainError, repeatItems, type EntryId, type EntryView, type FoodId, type LogLine } from './log'

// Native modules that cannot load in Node. plainError and linesKcal never call them.
vi.mock('expo-localization', () => ({ getCalendars: () => [] }))
vi.mock('expo-file-system', () => ({ File: class {} }))

afterEach(() => vi.restoreAllMocks())

// A card line with every field set, so tests only vary kcal.
function logLine(kcal: number | null): LogLine {
  return { text: 'egg', foodName: 'Egg', grams: 50, kcal, reasons: [], estimated: false }
}

describe('plainError', () => {
  it('maps a known ConvexError code to its plain line', () => {
    expect(plainError(new ConvexError({ code: 'NOT_FOUND' }))).toBe("That's no longer there.")
  })

  it('shows the server message for a workout code', () => {
    const err = new ConvexError({ code: 'WORKOUT_NEEDS_REVIEW', message: 'Fix every workout item and choose a target before saving.' })
    expect(plainError(err)).toBe('Fix every workout item and choose a target before saving.')
  })

  it('uses the server message for DRAFT_ITEM', () => {
    const err = new ConvexError({ code: 'DRAFT_ITEM', message: 'Item 2: Rice has no kcal, so set grams instead' })
    expect(plainError(err)).toBe('Item 2: Rice has no kcal, so set grams instead')
  })

  it('returns a PlainError message as is', () => {
    expect(plainError(new PlainError('Photo upload failed (500). Try again.'))).toBe('Photo upload failed (500). Try again.')
  })

  it('maps a network failure to the no-connection line', () => {
    expect(plainError(new Error('Network request failed'))).toBe('No connection. Check your internet and try again.')
  })

  it('ignores stack frames when matching patterns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = new Error('Something broke\n    at fetchNetwork (network.ts:1:1)')
    expect(plainError(err)).toBe('Something went wrong. Try again.')
    expect(warn).toHaveBeenCalled()
  })

  it('falls back to a generic line for an unknown error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(plainError(new Error('kaboom'))).toBe('Something went wrong. Try again.')
    expect(warn).toHaveBeenCalledWith('[stride]', 'kaboom')
  })
})

describe('linesKcal', () => {
  it('returns null while any line has no kcal', () => {
    expect(linesKcal([logLine(100), logLine(null)])).toBeNull()
  })

  it('sums unrounded kcal and rounds once at the total', () => {
    // 100.4 + 200.4 = 300.8 rounds to 301; rounding each line first would give 300.
    expect(linesKcal([logLine(100.4), logLine(200.4)])).toBe(301)
  })
})

// A past day's entry; only the fields that matter for repeating it vary.
function pastEntry(over: Partial<EntryView>): EntryView {
  return {
    _id: 'e1' as EntryId,
    entryKey: 'e1' as EntryId,
    mealNutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodiumMg: 0 },
    revision: 3,
    localDate: '2026-11-01',
    slot: 'breakfast',
    loggedAt: 1_000,
    foodId: 'f1' as FoodId,
    foodName: 'Poha',
    grams: 180,
    nutrients: { kcal: 230, protein: 4, carbs: 40, fat: 6, fiber: 2, sugar: 1, sodiumMg: 300 },
    source: 'db',
    confidence: 1,
    flags: [],
    createdBy: 'user',
    ...over,
  }
}

describe('repeatItems', () => {
  it('copies food, grams, slot, source and labels, and leaves the date to the server', () => {
    const items = repeatItems([
      pastEntry({}),
      pastEntry({ foodId: 'f2' as FoodId, grams: 120, slot: 'breakfast', source: 'ai', confidence: 0.6, flags: ['photo', 'estimated'] }),
    ])
    expect(items).toEqual([
      { foodId: 'f1', grams: 180, source: 'db', slot: 'breakfast', confidence: 1, flags: [] },
      { foodId: 'f2', grams: 120, source: 'ai', slot: 'breakfast', confidence: 0.6, flags: ['photo', 'estimated'] },
    ])
    for (const item of items) {
      expect(item).not.toHaveProperty('localDate')
      expect(item).not.toHaveProperty('loggedAt')
    }
  })
})
