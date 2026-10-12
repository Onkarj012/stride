import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { localDate, nextLocalMidnight } from '@stride/core'
import { deviceTimeZone } from './log'

// Keeps today's date in the device zone current at midnight and after app resume.
export function useLocalToday(): string {
  const [today, setToday] = useState(() => localDate(Date.now(), deviceTimeZone()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    // Refreshes today's date and schedules the next boundary from core.
    function refresh() {
      clearTimeout(timer)
      const now = Date.now()
      const zone = deviceTimeZone()
      setToday(localDate(now, zone))
      timer = setTimeout(refresh, Math.max(1, nextLocalMidnight(now, zone) - Date.now()))
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
