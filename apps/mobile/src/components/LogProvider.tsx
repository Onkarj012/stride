import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { newSubmissionId, plainError, type EntryId, type MealSlot } from '@/lib/log'
import { Compose, type ComposeMode } from './Compose'
import { MealSheet } from './MealSheet'
import { Sheet } from './Sheet'
import { Toast, type ToastMessage } from './Toast'

type SheetContent = { kind: 'compose'; mode: ComposeMode } | { kind: 'meal'; localDate: string; slot: MealSlot }

type LogApi = {
  compose: (mode?: ComposeMode) => void
  openMeal: (localDate: string, slot: MealSlot) => void
  toast: (message: Omit<ToastMessage, 'id'>) => void
  // Builds an undo that reverts the latest revision of each entry, with its own toast on success or failure.
  undoFor: (entryIds: EntryId[]) => () => void
  sheetOpen: boolean
}

const LogContext = createContext<LogApi | null>(null)

// The logging actions every screen shares: the compose sheet, the meal sheet and the undo toast.
export function useLog(): LogApi {
  const value = useContext(LogContext)
  if (!value) throw new Error('useLog must be used inside LogProvider')
  return value
}

// Hosts the one bottom sheet and the toast above the tabs, and hands out the actions to open them.
export function LogProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SheetContent | null>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const next = useRef<SheetContent | null>(null)
  const toastId = useRef(0)
  const undoRevision = useMutation(api.entries.undoRevision)

  const show = useCallback(
    (wanted: SheetContent) => {
      setMessage(null)
      if (open) {
        // Swap content by closing first so the new sheet slides in fresh.
        next.current = wanted
        setOpen(false)
        return
      }
      setContent(wanted)
      setOpen(true)
    },
    [open],
  )

  const close = useCallback(() => setOpen(false), [])

  const closed = useCallback(() => {
    const queued = next.current
    next.current = null
    setContent(queued)
    if (queued) setOpen(true)
  }, [])

  const toast = useCallback((m: Omit<ToastMessage, 'id'>) => {
    toastId.current += 1
    setMessage({ ...m, id: toastId.current })
  }, [])

  const toastDone = useCallback((id: number) => setMessage((m) => (m?.id === id ? null : m)), [])

  const undoFor = useCallback(
    (entryIds: EntryId[]) => () => {
      const base = newSubmissionId()
      // Each undo writes one revision per entry, so each needs its own submission id.
      Promise.all(entryIds.map((entryId, i) => undoRevision({ submissionId: `${base}-${i}`, entryId }))).then(
        () => toast({ title: 'Undone. Nothing lost.', sub: "It's back the way it was." }),
        (err: unknown) => toast({ title: "Couldn't undo that.", sub: plainError(err) }),
      )
    },
    [undoRevision, toast],
  )

  const value = useMemo<LogApi>(
    () => ({
      compose: (mode = 'text') => show({ kind: 'compose', mode }),
      openMeal: (localDate, slot) => show({ kind: 'meal', localDate, slot }),
      toast,
      undoFor,
      sheetOpen: open,
    }),
    [show, toast, undoFor, open],
  )

  return (
    <LogContext.Provider value={value}>
      {children}
      <Sheet open={open} onClose={close} onClosed={closed}>
        {content?.kind === 'compose' ? <Compose initialMode={content.mode} onClose={close} /> : null}
        {content?.kind === 'meal' ? (
          <MealSheet localDate={content.localDate} slot={content.slot} onClose={close} />
        ) : null}
      </Sheet>
      <Toast message={message} onDone={toastDone} />
    </LogContext.Provider>
  )
}
