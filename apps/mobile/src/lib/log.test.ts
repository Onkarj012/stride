import { describe, expect, it, vi, afterEach } from 'vitest'
import { ConvexError } from 'convex/values'
import { PlainError, linesKcal, plainError, type LogLine } from './log'

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
