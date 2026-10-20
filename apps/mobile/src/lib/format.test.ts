import { describe, expect, it } from 'vitest'
import { formatClock, formatGrams, formatNumber } from './format'

describe('formatNumber', () => {
  it('groups digits in Indian style', () => {
    expect(formatNumber(1890)).toBe('1,890')
    expect(formatNumber(123456)).toBe('1,23,456')
  })

  it('keeps the sign and drops a negative zero', () => {
    expect(formatNumber(-1890)).toBe('-1,890')
    expect(formatNumber(-0.4)).toBe('0')
  })
})

describe('formatClock', () => {
  it('turns 24h time into 12h without a period', () => {
    expect(formatClock('13:40')).toBe('1:40')
    expect(formatClock('00:05')).toBe('12:05')
    expect(formatClock('12:00')).toBe('12:00')
  })

  it('adds am or pm when asked', () => {
    expect(formatClock('13:40', true)).toBe('1:40 pm')
    expect(formatClock('00:05', true)).toBe('12:05 am')
    expect(formatClock('12:00', true)).toBe('12:00 pm')
  })
})

describe('formatGrams', () => {
  it('shows one decimal under 10 g and whole grams above', () => {
    expect(formatGrams(9.26)).toBe('9.3 g')
    expect(formatGrams(42.4)).toBe('42 g')
  })
})
