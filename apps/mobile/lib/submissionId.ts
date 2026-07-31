import { useCallback, useRef } from 'react'

export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
}

/** Keeps one id for a logical attempt until the caller confirms it landed. */
export function useSubmissionId(): { idFor: (key: string) => string; clear: () => void } {
  const ref = useRef<{ key: string; id: string } | null>(null)

  const idFor = useCallback((key: string) => {
    if (ref.current?.key === key) return ref.current.id
    const id = newSubmissionId()
    ref.current = { key, id }
    return id
  }, [])

  const clear = useCallback(() => {
    ref.current = null
  }, [])

  return { idFor, clear }
}
