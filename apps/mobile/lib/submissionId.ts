import { useCallback, useRef } from 'react'

/** Random id used to make a chat submission idempotent on the backend. */
export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

/** Keeps one id for a logical attempt until the caller confirms it landed. */
export function useSubmissionId(): { idFor: (key: string) => string; clear: () => void } {
  const ref = useRef<{ key: string; id: string } | null>(null)

  // Returns the retained id for this key, or starts a new one.
  const idFor = useCallback((key: string) => {
    if (ref.current?.key === key) return ref.current.id
    const id = newSubmissionId()
    ref.current = { key, id }
    return id
  }, [])

  // Forgets the retained id once the submission has landed.
  const clear = useCallback(() => {
    ref.current = null
  }, [])

  return { idFor, clear }
}
