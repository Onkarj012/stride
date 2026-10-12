import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { localDate } from '@stride/core'
import { deviceTimeZone } from './log'

// Keeps today's date in the device zone current at midnight and after app resume.
export function useLocalToday(): string {
  const [today, setToday] = useState(() => localDate(Date.now(), deviceTimeZone()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    // Finds the next date boundary through the shared resolver, including DST changes.
    function refresh() {
      clearTimeout(timer)
      const now = Date.now()
      const zone = deviceTimeZone()
      const date = localDate(now, zone)
      setToday(date)
      let before = now
      let after = now + 26 * 60 * 60 * 1000
      while (after - before > 1) {
        const middle = Math.floor((before + after) / 2)
        if (localDate(middle, zone) === date) before = middle
        else after = middle
      }
      timer = setTimeout(refresh, Math.max(1, after - Date.now()))
    }
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => {
      clearTimeout(timer)
      subscription.remove()
    }
  }, [])

  return today
}
