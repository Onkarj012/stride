import { useState, useEffect, useCallback, useRef } from 'react'

export function useRotate<T>(items: T[], interval = 5200) {
  const [index, setIndex] = useState(0)
  const paused = useRef(false)

  useEffect(() => {
    if (items.length <= 1) return
    const id = setInterval(() => {
      if (!paused.current) {
        setIndex(i => (i + 1) % items.length)
      }
    }, interval)
    return () => clearInterval(id)
  }, [items.length, interval])

  const pause = useCallback(() => { paused.current = true }, [])
  const resume = useCallback(() => { paused.current = false }, [])

  return { current: items[index], index, pause, resume }
}
