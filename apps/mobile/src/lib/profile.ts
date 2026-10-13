import { createContext } from 'react'
import { getLocales } from 'expo-localization'
import type { FunctionArgs } from 'convex/server'
import type { api } from 'stride-backend/convex/_generated/api'

type SaveProfileArgs = FunctionArgs<typeof api.progress_v2.saveProfile>
export type Goal = SaveProfileArgs['goal']
export type Sex = SaveProfileArgs['sex']
export type Activity = SaveProfileArgs['activity']
export type DietType = SaveProfileArgs['dietType']
export type Pace = NonNullable<SaveProfileArgs['pace']>
export type Units = 'metric' | 'imperial'
export type DatePart = 'day' | 'month' | 'year'

const LB_PER_KG = 2.20462
const CM_PER_INCH = 2.54
export const WEIGHT_KG = { min: 30, max: 300 }
export const HEIGHT_CM = { min: 100, max: 250 }

// Lets the onboarding screen stay mounted after the profile is saved, so its reveal step can show.
export const HoldOnboardingContext = createContext<(hold: boolean) => void>(() => {})

// Metric when the device uses metric units; lb and ft/in otherwise.
export function deviceUnits(): Units {
  return getLocales()[0]?.measurementSystem === 'metric' ? 'metric' : 'imperial'
}

// Keeps a number inside a range.
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// Rounds to one decimal place.
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// Weight in the user's unit, e.g. "78.4 kg" or "173 lb".
export function kgLabel(kg: number, units: Units): string {
  return units === 'metric' ? `${kg.toFixed(1)} kg` : `${Math.round(kg * LB_PER_KG)} lb`
}

// Height in the user's unit, e.g. "176 cm" or "5 ft 9 in".
export function heightLabel(cm: number, units: Units): string {
  if (units === 'metric') return `${cm} cm`
  const inches = Math.round(cm / CM_PER_INCH)
  return `${Math.floor(inches / 12)} ft ${inches % 12} in`
}

// Weekly rate in the user's unit, e.g. "0.5 kg a week".
export function rateLabel(kgPerWeek: number, units: Units): string {
  const value = units === 'metric' ? kgPerWeek : kgPerWeek * LB_PER_KG
  return `${Number(value.toFixed(2))} ${units === 'metric' ? 'kg' : 'lb'} a week`
}

// One step of weight (0.1 kg or 1 lb), returned in kg.
export function stepKg(kg: number, dir: -1 | 1, units: Units): number {
  const next = units === 'metric' ? kg + dir * 0.1 : (Math.round(kg * LB_PER_KG) + dir) / LB_PER_KG
  return clamp(round1(next), WEIGHT_KG.min, WEIGHT_KG.max)
}

// One step of height (1 cm or 1 inch), returned in cm.
export function stepCm(cm: number, dir: -1 | 1, units: Units): number {
  const next = units === 'metric' ? cm + dir : (Math.round(cm / CM_PER_INCH) + dir) * CM_PER_INCH
  return clamp(Math.round(next), HEIGHT_CM.min, HEIGHT_CM.max)
}

// Year, month and day from a YYYY-MM-DD string.
export function dateParts(value: string): { year: number; month: number; day: number } {
  const [year = 2000, month = 1, day = 1] = value.split('-').map(Number)
  return { year, month, day }
}

// Steps one part of a YYYY-MM-DD date. The day stays inside its month, and the year stays between 1900 and this year.
export function stepDate(value: string, part: DatePart, dir: -1 | 1): string {
  const { year, month, day } = dateParts(value)
  const nextYear = part === 'year' ? clamp(year + dir, 1900, new Date().getFullYear()) : year
  const nextMonth = part === 'month' ? clamp(month + dir, 1, 12) : month
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
  const nextDay = clamp(part === 'day' ? day + dir : day, 1, lastDay)
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`
}

// Splits a full name at the first space into Clerk's first and last name.
export function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim()
  const space = trimmed.indexOf(' ')
  if (space === -1) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1).trim() }
}

// Target weight on the far side of today's weight for the goal. Keeps the saved target when it already sits there, else starts 5 kg away.
export function startTargetKg(goal: 'lose' | 'gain', targetKg: number | undefined, weightKg: number): number {
  if (targetKg !== undefined && (goal === 'lose' ? targetKg < weightKg : targetKg > weightKg)) return targetKg
  return clamp(round1(weightKg + (goal === 'lose' ? -5 : 5)), WEIGHT_KG.min, WEIGHT_KG.max)
}
