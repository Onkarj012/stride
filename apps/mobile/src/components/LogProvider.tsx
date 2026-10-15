import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { newSubmissionId, plainError, type DraftId, type EntryId, type MealSlot } from '@/lib/log'
import { BurnSheet } from './BurnSheet'
import { Compose, type ComposeMode, type ComposePrefill } from './Compose'
import { MealSheet } from './MealSheet'
import { Sheet } from './Sheet'
import { Toast, type ToastMessage } from './Toast'
import { LogContext, type LogApi } from './useLog'

type SheetContent =
  | { kind: 'compose'; mode: ComposeMode; defaultSlot?: MealSlot; draftId?: DraftId; prefill?: ComposePrefill }
  | { kind: 'meal'; localDate: string; slot: MealSlot }
  | { kind: 'burn'; milestone: boolean }

// One sheet opening. Its session number changes on every show, so each opening mounts fresh.
type Opening = SheetContent & { session: number }

// Hosts the one bottom sheet and the toast above the tabs, and hands out the actions to open them.
export function LogProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Opening | null>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const next = useRef<Opening | null>(null)
  const session = useRef(0)
  const toastId = useRef(0)
  const undoRevision = useMutation(api.entries.undoRevision)

  const show = useCallback(
    (wanted: SheetContent) => {
      setMessage(null)
      session.current += 1
      const opening = { ...wanted, session: session.current }
      if (open) {
        // Swap content by closing first so the new sheet slides in fresh.
        next.current = opening
        setOpen(false)
        return
      }
      // Drop any opening queued behind a close that is still running, so it cannot pop up later.
      next.current = null
      setContent(opening)
      setOpen(true)
    },
    [open],
  )

  const close = useCallback(() => setOpen(false), [])

  // Closes the sheet only if the opening that asked is still the one on screen.
  const closeOpening = useCallback((id: number) => () => {
    if (id === session.current) setOpen(false)
  }, [])

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
      return Promise.all(entryIds.map((entryId, i) => undoRevision({ submissionId: `${base}-${i}`, entryId }))).then(
        () => {
          toast({ title: 'Undone. Nothing lost.', sub: "It's back the way it was." })
          return true
        },
        (err: unknown) => {
          toast({ title: "Couldn't undo that.", sub: plainError(err) })
          return false
        },
      )
    },
    [undoRevision, toast],
  )

  const value = useMemo<LogApi>(
    () => ({
      compose: (mode = 'text', defaultSlot, prefill) => show({ kind: 'compose', mode, defaultSlot, prefill }),
      openDraft: (draftId) => show({ kind: 'compose', mode: 'text', draftId }),
      openMeal: (localDate, slot) => show({ kind: 'meal', localDate, slot }),
      openBurn: (milestone) => show({ kind: 'burn', milestone }),
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
        {content?.kind === 'compose' ? (
          <Compose key={content.session} initialMode={content.mode} defaultSlot={content.defaultSlot} initialDraftId={content.draftId} prefill={content.prefill} onClose={closeOpening(content.session)} />
        ) : null}
        {content?.kind === 'meal' ? (
          <MealSheet key={content.session} localDate={content.localDate} slot={content.slot} onClose={closeOpening(content.session)} />
        ) : null}
        {content?.kind === 'burn' ? <BurnSheet key={content.session} milestone={content.milestone} onClose={closeOpening(content.session)} /> : null}
      </Sheet>
      <Toast message={message} onDone={toastDone} />
    </LogContext.Provider>
  )
}
