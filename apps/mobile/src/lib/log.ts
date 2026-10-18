import { ConvexError } from 'convex/values'
import { scaleMacroTargets } from '@stride/core'
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

// Fallback daily targets while the backend has no target for the user yet.
export const DEFAULT_TARGETS = { kcal: 1890, proteinG: 110, carbsG: 215, fatG: 60 }

// Range for progress_v2.summary on Today, Log and Progress, so Convex shares one subscription.
export const SUMMARY_DAYS = 14

// Daily targets from the backend kcal target, with the default macro split scaled to it; defaults when there is none.
export function targetsFor(kcal: number | null): typeof DEFAULT_TARGETS {
  return scaleMacroTargets(kcal, DEFAULT_TARGETS)
}

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

// The `message` field of a ConvexError payload, if it has one.
function convexMessage(err: unknown): string | null {
  if (!(err instanceof ConvexError)) return null
  const data: unknown = err.data
  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') return data.message
  return null
}

// Plain line for each server error code. null means the server message is already written for users.
const CODE_MESSAGES: Readonly<Record<string, string | null>> = {
  UNAUTHENTICATED: 'You are signed out. Sign in again.',
  NOT_FOUND: "That's no longer there.",
  UPLOAD_NOT_FOUND: "That photo didn't upload. Try again.",
  PHOTO_TOO_LARGE: 'That photo is too large. Try again from a little further away.',
  NOT_AN_IMAGE: "That file isn't a photo. Pick a photo and try again.",
  STALE_REVISION: 'This changed somewhere else. Reload and try again.',
  ALREADY_DELETED: "That's already deleted.",
  LEDGER_CLEARING: 'Your data is being cleared. Try again in a moment.',
  ONBOARDING_REQUIRED: 'Finish setting up your profile first.',
  MESSAGE_BUSY: 'Still working on your last message.',
  REPLY_STREAMING: 'Wait for the reply to finish, then regenerate it.',
  NOTHING_TO_REGENERATE: 'Nothing to regenerate yet.',
  PHOTO_REGENERATE: "Photo replies can't be regenerated yet.",
  REGENERATE_UNAVAILABLE: "This reply can't be regenerated right now.",
  VOICE_RESEND: 'Send the voice note again.',
  MESSAGE_EMPTY: 'Type a message or add a photo first.',
  DRAFT_ITEM: null,
  DRAFT_EMPTY: 'Nothing left to log. Discard the draft instead.',
  DRAFT_CLOSED: 'That draft was already saved or discarded.',
  DIET_REQUIRED: 'Pick at least one diet.',
  INVALID_HEIGHT: 'Height should be between 100 and 250 cm.',
  INVALID_DOB: 'Check your date of birth.',
  INVALID_TRAINING_DAYS: 'Training days should be a whole number from 0 to 7.',
  INVALID_TARGET_WEIGHT: 'Target weight should be between 30 and 300 kg.',
  TARGET_NOT_BELOW: 'For losing weight, pick a target below your current weight.',
  TARGET_NOT_ABOVE: 'For gaining weight, pick a target above your current weight.',
  INVALID_WEIGHT: "That weight doesn't look right. Check it and try again.",
  INVALID_SET: "That weight, rep, or effort value isn't allowed.",
  INVALID_GRAMS: "That amount doesn't look right. Enter the grams.",
  INVALID_BARCODE: "That barcode doesn't look right. Try scanning again.",
  FOOD_DB_UNAVAILABLE: "The food database isn't responding. Try again later.",
  INVALID_FOOD: "Check the food's name and nutrition numbers.",
  FOOD_LIMIT: "You've reached the limit for personal foods.",
  LIMIT_REACHED: "That's too much for one day or workout.",
  END_BEFORE_START: 'That end time is before the start time.',
  SESSION_FINISHED: 'This workout is already finished.',
  INVALID_TEXT: "That's empty or too long. Shorten it and try again.",
  INVALID_DATE: "That date or time doesn't look right.",
  ACCOUNT_DELETE_FAILED: "Couldn't delete your account right now. Try again later.",
  BUDGET_EXCEEDED: "Today's AI allowance is used up. Barcode scans still work, and it resets tomorrow.",
  RATE_LIMITED: "That's a lot at once. Give it a minute, then try again.",
  INPUT_TOO_LARGE: "That's too long for me. Try something shorter.",
  OWN_KEY_INVALID: 'Your OpenRouter key was rejected. Check it in Settings.',
  OWN_KEY_NO_CREDITS: "Your OpenRouter key is out of credits. Top it up, or remove it in Settings to use Stride's AI.",
  AI_UNAVAILABLE: 'The AI is unavailable right now. Try again later, or add your own OpenRouter key in Settings.',
  KEY_FORMAT: "That doesn't look like an OpenRouter key.",
  KEY_REJECTED: 'OpenRouter rejected that key.',
  KEY_CHECK_FAILED: "Couldn't reach OpenRouter to check the key. Try again.",
  KEY_SAVE_CANCELLED: 'Your data was cleared. Add the key again.',
}

// Fallback text patterns for errors with no known code, such as plain Errors in dev. The first match wins.
const PLAIN_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  // Draft item lines are already written for users; '$&' keeps the matched text as is.
  [/Item \d+[^\n]*/, '$&'],
  [/Groq|transcription/i, "I couldn't make out that recording. Try again, or type it."],
  [/Connection lost|Network request failed|network|WebSocket|offline/i, 'No connection. Check your internet and try again.'],
  [/Unauthenticated/, 'You are signed out. Sign in again.'],
  [/CLERK_SECRET_KEY|Clerk delete failed/, "Couldn't delete your account right now. Try again later."],
  [/doesn't look like an OpenRouter key/, "That doesn't look like an OpenRouter key."],
  [/OpenRouter rejected that key/, 'OpenRouter rejected that key.'],
  [/Couldn't reach OpenRouter/, "Couldn't reach OpenRouter to check the key. Try again."],
  [/Your data is being cleared/, 'Your data is being cleared. Try again in a moment.'],
  [/Finish onboarding first/, 'Finish setting up your profile first.'],
  [/already being handled/, 'Still working on your last message.'],
  [/Wait for the reply to finish/, 'Wait for the reply to finish, then regenerate it.'],
  [/Nothing to regenerate yet/, 'Nothing to regenerate yet.'],
  [/Photo replies can't be regenerated/, "Photo replies can't be regenerated yet."],
  [/can't be regenerated right now/, "This reply can't be regenerated right now."],
  [/Send the voice note again/, 'Send the voice note again.'],
  [/Message is empty/, 'Type a message or add a photo first.'],
  [/Photo not found|Upload not found/, "That photo didn't upload. Try again."],
  [/Photo is too large/, 'That photo is too large. Try again from a little further away.'],
  [/not an image/, "That file isn't a photo. Pick a photo and try again."],
  [/Unknown (entry_id|food_id|food)|not found/i, "That's no longer there."],
  [/newer revision|changed since|Reload and retry/, 'This changed somewhere else. Reload and try again.'],
  [/can't undo/, "That can't be undone anymore."],
  [/Nothing left to log/, 'Nothing left to log. Discard the draft instead.'],
  [/could not be parsed/, 'This entry could not be parsed. Edit it before saving.'],
  [/heightCm must be/, 'Height should be between 100 and 250 cm.'],
  [/targetWeightKg must be below/, 'For losing weight, pick a target below your current weight.'],
  [/targetWeightKg must be above/, 'For gaining weight, pick a target above your current weight.'],
  [/targetWeightKg must be/, 'Target weight should be between 30 and 300 kg.'],
  [/kg must be within/, "That weight doesn't look right. Check it and try again."],
  [/weightKg must|reps must|rpe must/, "That weight, rep, or effort value isn't allowed."],
  [/dob must be/, 'Check your date of birth.'],
  [/trainingDaysPerWeek/, 'Training days should be a whole number from 0 to 7.'],
  [/Pick at least one diet/, 'Pick at least one diet.'],
  [/unrealistically high/, "That's more calories than makes sense. Check the amount."],
  [/grams must be|cannot turn that amount/, "That amount doesn't look right. Enter the grams."],
  [/Barcode must be/, "That barcode doesn't look right. Try scanning again."],
  [/Open Food Facts/, "The food database isn't responding. Try again later."],
  [/Food name must be|Nutrients must be|Macros cannot exceed/, "Check the food's name and nutrition numbers."],
  [/personal foods/, "You've reached the limit for personal foods."],
  [/Session exceeds|Day exceeds|holds at most/, "That's too much for one day or workout."],
  [/must not precede|at or after startedAt/, 'That end time is before the start time.'],
  [/Session is finished/, 'This workout is already finished.'],
  [/already deleted|is deleted/, "That's already deleted."],
  [/muscles/, 'Check the muscle groups and try again.'],
  [/must be 1-\d+ characters|Title must be|name must be|query must be/, "That's empty or too long. Shorten it and try again."],
  [/YYYY-MM-DD|calendar date|HH:MM|Timestamp must|epoch|date and time must/, "That date or time doesn't look right."],
]

// One plain sentence for any error thrown by a Convex call or an upload.
export function plainError(err: unknown): string {
  // Checked by name: transpiled Error subclasses do not always keep instanceof.
  if (err instanceof Error && err.name === 'PlainError') return err.message
  const code = convexCode(err)
  if (code !== null && Object.hasOwn(CODE_MESSAGES, code)) {
    const line = CODE_MESSAGES[code]
    // null means the server message is already user-facing. Fall through to the patterns if it is missing.
    if (line !== null) return line
    const message = convexMessage(err)
    if (message) return message
  }
  const raw = err instanceof Error ? err.message : String(err)
  // Stack frames are dropped so their file names cannot match a pattern.
  const text = `${code ?? ''} ${raw.split(/\n\s+at /)[0]}`
  for (const [pattern, line] of PLAIN_MESSAGES) {
    const found = pattern.exec(text)
    if (found) return found[0].replace(pattern, line)
  }
  console.warn('[stride]', raw)
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

// Total kcal of the lines, summed unrounded and rounded once; null when any line is still unknown.
export function linesKcal(lines: LogLine[]): number | null {
  let sum = 0
  for (const line of lines) {
    if (line.kcal === null) return null
    sum += line.kcal
  }
  return Math.round(sum)
}
