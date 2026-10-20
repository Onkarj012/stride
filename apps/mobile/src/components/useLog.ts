import { createContext, useContext } from 'react'
import type { DraftId, EntryId, MealSlot } from '@/lib/log'
import type { ComposeMode, ComposePrefill } from './Compose'
import type { ToastMessage } from './Toast'

export type LogApi = {
  // Prefill fills the box with text, or logs an already uploaded photo.
  compose: (mode?: ComposeMode, defaultSlot?: MealSlot, prefill?: ComposePrefill) => void
  openDraft: (draftId: DraftId) => void
  openMeal: (localDate: string, slot: MealSlot) => void
  // The daily-burn explainer, or the one-time milestone version of it.
  openBurn: (milestone: boolean) => void
  toast: (message: Omit<ToastMessage, 'id'>) => void
  // Builds an undo that reverts the latest revision of each entry, with its own toast on success or failure. Resolves true only if it worked.
  undoFor: (entryIds: EntryId[]) => () => Promise<boolean>
  sheetOpen: boolean
}

export const LogContext = createContext<LogApi | null>(null)

// The actions every screen shares: the compose, meal and burn sheets and the undo toast.
export function useLog(): LogApi {
  const value = useContext(LogContext)
  if (!value) throw new Error('useLog must be used inside LogProvider')
  return value
}
