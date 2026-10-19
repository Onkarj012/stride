import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { inferRange, type PlannedSet, type RepRange } from '@stride/core'

// Stored on this device only. A server-side field would make the band durable across devices.
function bandKey(exerciseId: string): string {
  return `stride.band.${exerciseId}`
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

// The rep band for one exercise. Loads the saved band, or saves one inferred from `previous` the first time.
// Returns null while loading or when there is no history to infer from.
export function useRepBand(exerciseId: string, previous: PlannedSet[]): RepRange | null {
  const key = bandKey(exerciseId)
  // undefined while loading; null when nothing is saved.
  const [stored, setStored] = useState<RepRange | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setStored(undefined)
    SecureStore.getItemAsync(key)
      .then((raw) => {
        if (!cancelled) setStored(parseBand(raw))
      })
      .catch(() => {
        if (!cancelled) setStored(null)
      })
    return () => {
      cancelled = true
    }
  }, [key])

  const inferred = stored === null ? inferRange(previous) : null
  const inferredMin = inferred?.min
  const inferredMax = inferred?.max

  useEffect(() => {
    if (inferredMin === undefined || inferredMax === undefined) return
    const band = { min: inferredMin, max: inferredMax }
    setStored(band)
    void SecureStore.setItemAsync(key, JSON.stringify(band)).catch(() => undefined)
  }, [key, inferredMin, inferredMax])

  if (stored === undefined) return null
  return stored ?? inferred
}
