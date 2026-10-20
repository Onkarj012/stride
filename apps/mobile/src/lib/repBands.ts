import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { inferRange, type PlannedSet, type RepRange } from '@stride/core'

// Stored on this device only. A server-side field would make the band durable across devices.
function bandKey(userId: string, exerciseId: string): string {
  return `stride.band.${userId}.${exerciseId}`
}

// Reads a saved band, ignoring anything that isn't two sane integers.
function parseBand(raw: string | null): RepRange | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('min' in value) || !('max' in value)) return null
    const { min, max } = value
    if (typeof min !== 'number' || typeof max !== 'number') return null
    if (!Number.isInteger(min) || !Number.isInteger(max)) return null
    return min >= 1 && min <= max && max <= 50 ? { min, max } : null
  } catch {
    return null
  }
}

// The rep band for one exercise, scoped to the signed-in user. Loads the saved band, or saves one inferred from `previous` the first time.
// Without a user id it reads and writes nothing and returns the inferred band. Null while loading or with no history.
export function useRepBand(userId: string | null | undefined, exerciseId: string, previous: PlannedSet[]): RepRange | null {
  // undefined while loading; null when nothing is saved or the read failed.
  const [stored, setStored] = useState<RepRange | null | undefined>(undefined)
  // True when the read failed. The saved band is unknown then, so nothing may be written over it.
  const [readFailed, setReadFailed] = useState(false)
  const signedIn = userId ? userId : null

  useEffect(() => {
    if (signedIn === null) return
    let cancelled = false
    setStored(undefined)
    setReadFailed(false)
    SecureStore.getItemAsync(bandKey(signedIn, exerciseId))
      .then((raw) => {
        if (!cancelled) setStored(parseBand(raw))
      })
      .catch(() => {
        if (!cancelled) {
          setReadFailed(true)
          setStored(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [signedIn, exerciseId])

  const inferred = stored === null ? inferRange(previous) : null
  const inferredMin = inferred?.min
  const inferredMax = inferred?.max

  useEffect(() => {
    if (signedIn === null || readFailed || inferredMin === undefined || inferredMax === undefined) return
    const band = { min: inferredMin, max: inferredMax }
    setStored(band)
    void SecureStore.setItemAsync(bandKey(signedIn, exerciseId), JSON.stringify(band)).catch(() => undefined)
  }, [signedIn, exerciseId, readFailed, inferredMin, inferredMax])

  if (signedIn === null) return inferRange(previous)
  if (stored === undefined) return null
  return stored ?? inferred
}
