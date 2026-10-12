import { ConvexError } from 'convex/values'
import type { FunctionReturnType } from 'convex/server'
import { getCalendars } from 'expo-localization'
import { File } from 'expo-file-system'
import type { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'

export type LogResult = FunctionReturnType<typeof api.pipeline.log.logInput>
export type LogLine = LogResult['lines'][number]
export type DraftView = NonNullable<FunctionReturnType<typeof api.pipeline.drafts.getDraft>>
export type DraftItem = DraftView['items'][number]
export type EntryView = FunctionReturnType<typeof api.entries.entriesForDay>[number]
export type MealSlot = EntryView['slot']
export type BarcodeFood = NonNullable<FunctionReturnType<typeof api.pipeline.barcode.lookupBarcode>>
export type EntryId = Id<'entries'>
export type FoodId = Id<'foods'>
export type StorageId = Id<'_storage'>
export type DraftId = Id<'drafts'>

export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner']
export const SLOT_NAMES: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' }

// Daily targets until slice 7 learns them from the user's burn.
export const DEFAULT_TARGETS = { kcal: 1890, proteinG: 110, carbsG: 215, fatG: 60 }

/** Largest photo the backend accepts, mirrored here so the app can refuse it before uploading. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
/** Longest voice note; keeps the base64 payload well under the backend's 10 MB audio limit. */
export const MAX_VOICE_MS = 60_000

// A client id for one submission. The caller keeps it for retries so the server logs it once.
export function newSubmissionId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// The device's IANA time zone (D15), from the OS calendar settings with an Intl fallback.
export function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
}

// An error whose message is already written for the user.
export class PlainError extends Error {
  name = 'PlainError'
}

// The `code` field of a ConvexError payload, if it has one.
function convexCode(err: unknown): string | null {
  if (!(err instanceof ConvexError)) return null
  const data: unknown = err.data
  if (typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string') return data.code
  return null
}

// One plain sentence for any error thrown by a Convex call or an upload.
export function plainError(err: unknown): string {
  // Checked by name: transpiled Error subclasses do not always keep instanceof.
  if (err instanceof Error && err.name === 'PlainError') return err.message
  const code = convexCode(err)
  const raw = err instanceof Error ? err.message : String(err)
  const text = `${code ?? ''} ${raw}`
  if (/BUDGET_EXCEEDED/.test(text)) return "Today's AI allowance is used up. Barcode scans still work, and it resets tomorrow."
  if (/RATE_LIMITED/.test(text)) return "That's a lot at once. Give it a minute, then try again."
  if (/INPUT_TOO_LARGE/.test(text)) return "That's too long for me. Try something shorter."
  if (/Groq|transcription/i.test(text)) return "I couldn't make out that recording. Try again, or type it."
  if (/Connection lost|Network request failed|network|WebSocket|offline/i.test(text))
    return 'No connection. Check your internet and try again.'
  if (/Unauthenticated/.test(text)) return 'You are signed out. Sign in again.'
  // Dev deployments send "Uncaught Error: <message>" with a stack; the first line is the readable part.
  const uncaught = /Uncaught (?:Convex)?Error: ([^\n]+)/.exec(raw)?.[1]?.replace(/\s+at .*$/, '').trim()
  if (uncaught) return uncaught
  return 'Something went wrong. Try again.'
}

// Reads a recorded voice note as base64 for `logInput`.
export async function readAudioBase64(uri: string): Promise<string> {
  return await new File(uri).base64()
}

// Uploads a photo to a Convex upload URL and returns its storage id.
export async function uploadPhoto(uploadUrl: string, uri: string, token: string): Promise<StorageId> {
  const file = new File(uri)
  if ((file.size ?? 0) > MAX_PHOTO_BYTES) throw new PlainError('That photo is too large. Try again from a little further away.')
  const res = await file.upload(uploadUrl, { httpMethod: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: `Bearer ${token}` } })
  if (res.status < 200 || res.status >= 300) throw new PlainError(`Photo upload failed (${res.status}). Try again.`)
  const body: unknown = JSON.parse(res.body)
  if (typeof body !== 'object' || body === null || !('storageId' in body) || typeof body.storageId !== 'string')
    throw new PlainError('Photo upload failed. Try again.')
  // Convex ids are branded strings; this one comes straight from the storage upload response.
  return body.storageId as StorageId
}

// Sum of the kcal the server computed for each line; null when any line is still unknown.
export function linesKcal(lines: LogLine[]): number | null {
  let sum = 0
  for (const line of lines) {
    if (line.kcal === null) return null
    sum += line.kcal
  }
  return sum
}
