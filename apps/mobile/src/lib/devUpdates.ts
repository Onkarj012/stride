import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'

// True only in the Stride Dev build, which takes updates from the `dev` channel.
export const isDevChannel = Updates.channel === 'dev'

// Pulls and reloads a new dev update on mount and each time the app comes to the foreground.
export function useDevUpdates(): void {
  const checking = useRef(false)

  useEffect(() => {
    if (!isDevChannel || __DEV__ || !Updates.isEnabled) return
    // Runs one check. Fetches and reloads only when an update exists.
    async function check() {
      if (checking.current) return
      checking.current = true
      try {
        const result = await Updates.checkForUpdateAsync()
        if (!result.isAvailable) return
        await Updates.fetchUpdateAsync()
        await Updates.reloadAsync()
      } catch {
        // Offline or the update server is down. The app keeps running on the bundle it has.
      } finally {
        checking.current = false
      }
    }
    void check()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check()
    })
    return () => subscription.remove()
  }, [])
}
