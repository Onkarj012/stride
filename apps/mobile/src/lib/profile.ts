import { createContext } from 'react'
import { getLocales } from 'expo-localization'
import type { FunctionArgs } from 'convex/server'
import { KCAL_FLOOR, ageOnDate, isLocalDate } from '@stride/core'
import type { api } from 'stride-backend/convex/_generated/api'

type SaveProfileArgs = FunctionArgs<typeof api.progress_v2.saveProfile>
export type Goal = SaveProfileArgs['goal']
export type Sex = SaveProfileArgs['sex']
export type Activity = SaveProfileArgs['activity']
export type DietType = SaveProfileArgs['dietTypes'][number]
export type Pace = NonNullable<SaveProfileArgs['pace']>
export type Units = 'metric' | 'imperial'
export type DatePart = 'day' | 'month' | 'year'

export const LB_PER_KG = 2.20462
const CM_PER_INCH = 2.54
export const WEIGHT_KG = { min: 30, max: 300 }
export const HEIGHT_CM = { min: 100, max: 250 }

// Lets the onboarding screen stay mounted after the profile is saved, so its reveal step can show.
export const HoldOnboardingContext = createContext<(hold: boolean) => void>(() => {})

// Keeps the signed-in screens mounted while an account delete runs, so its error can still show.
export const HoldAppContext = createContext<(hold: boolean) => void>(() => {})

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

// Weight as a number in the user's unit, without the unit: "78.4" or "173".
export function weightNumber(kg: number, units: Units): string {
  return units === 'metric' ? kg.toFixed(1) : String(Math.round(kg * LB_PER_KG))
}

// The weight unit word, "kg" or "lb".
export function weightUnit(units: Units): string {
  return units === 'metric' ? 'kg' : 'lb'
}

// Turns a weight typed in the user's unit into kg, rounded to 0.1 for storage.
export function weightToKg(value: number, units: Units): number {
  return round1(units === 'metric' ? value : value / LB_PER_KG)
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

// Weekly rate in the user's unit with a real minus or plus sign, e.g. "−0.45 kg a week". No sign when it shows as zero.
export function signedRateLabel(kgPerWeek: number, units: Units): string {
  const shown = Number((units === 'metric' ? kgPerWeek : kgPerWeek * LB_PER_KG).toFixed(2))
  const sign = shown === 0 ? '' : shown < 0 ? '−' : '+'
  return `${sign}${rateLabel(Math.abs(kgPerWeek), units)}`
}

// Whether a target 0.1 kg past today's weight, in the goal's direction, still fits inside the allowed weights.
export function hasTargetRoom(goal: 'lose' | 'gain', weightKg: number): boolean {
  const target = round1(goal === 'lose' ? weightKg - 0.1 : weightKg + 0.1)
  return target >= WEIGHT_KG.min && target <= WEIGHT_KG.max
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

// The YYYY-MM-DD date for typed day, month and year, or null unless it is real and the age on today is 13 to 120.
export function dobFromTyped(day: string, month: string, year: string, today: string): string | null {
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return null
  const dob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  if (!isLocalDate(dob)) return null
  const age = ageOnDate(dob, today)
  return age !== null && age >= 13 && age <= 120 ? dob : null
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

// Saved units, or the device's units when none are saved.
export function savedUnits(saved: string | undefined): Units {
  return saved === 'metric' || saved === 'imperial' ? saved : deviceUnits()
}

// Training days as "1 day" or "4 days".
export function daysLabel(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}

export const DIET_LABELS: Record<DietType, string> = {
  veg: 'Vegetarian',
  eggetarian: 'Eggetarian',
  non_veg: 'Non-vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
}

// The chosen diets joined with commas, e.g. "Vegetarian, Non-vegetarian", or "Not set" when none.
export function dietsLabel(list: DietType[]): string {
  return list.length === 0 ? 'Not set' : list.map((d) => DIET_LABELS[d]).join(', ')
}

// One line on why the target moved off the formula, or null when it did not.
export function clampNote(clamped: 'pace_cap' | 'floor' | undefined, sex: Sex): string | null {
  if (clamped === 'pace_cap') return 'Capped at 1% of your weight a week to keep it safe.'
  if (clamped === 'floor') return `Raised to the ${KCAL_FLOOR[sex]} kcal minimum.`
  return null
}
