import { useCallback, useEffect, useState } from 'react'
import { AppState, Text, View } from 'react-native'
import { Tabs } from 'expo-router/js-tabs'
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs'
import type { ErrorBoundaryProps } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, motion } from '@stride/ui-tokens'
import { Button } from '@/components/Controls'
import { Dock } from '@/components/Dock'
import { LogProvider } from '@/components/LogProvider'
import { Polo } from '@/components/Polo'
import { deviceTimeZone, plainError } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'

type SceneInterpolator = NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>

// Mock's screen entrance: the incoming tab slides in from the side it lives on and fades up.
const shift: SceneInterpolator = ({ current }) => {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-motion.screenShift, 0, motion.screenShift],
          }),
        },
      ],
    },
  }
}

type ZoneState = { kind: 'pending' } | { kind: 'ready' } | { kind: 'failed'; message: string } | { kind: 'rejected' }

// Sends the device time zone on every session start and app resume (D15). Ledger reads need it set first.
function useTimeZoneSync(): { state: ZoneState; retry: () => void } {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const setTimeZone = useMutation(api.time_zone.setTimeZone)
  const [state, setState] = useState<ZoneState>({ kind: 'pending' })

  const sync = useCallback(() => {
    setTimeZone({ timeZone: deviceTimeZone() }).then(
      () => setState({ kind: 'ready' }),
      (err: unknown) => setState((s) => (s.kind === 'ready' ? s : { kind: 'failed', message: plainError(err) })),
    )
  }, [setTimeZone])

  useEffect(() => {
    if (!isAuthenticated) return
    sync()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync()
    })
    return () => sub.remove()
  }, [isAuthenticated, sync])

  const retry = useCallback(() => {
    setState({ kind: 'pending' })
    sync()
  }, [sync])

  // Clerk says signed in but Convex refused the token: no amount of waiting fixes that.
  return { state: !isLoading && !isAuthenticated ? { kind: 'rejected' } : state, retry }
}

// Tab navigator for Today, Log, Progress and Coach, drawn as the floating v5 dock (D17), under the shared log sheet.
export default function TabsLayout() {
  const t = useTheme()
  const s = useStyles()
  const { state, retry } = useTimeZoneSync()
  const { signOut } = useAuth()

  if (state.kind !== 'ready')
    return (
      <View style={s.center}>
        <Polo size={64} mood={state.kind === 'pending' ? 'idle' : 'wow'} hop={state.kind === 'pending' ? 0 : 1} />
        {state.kind === 'failed' ? (
          <>
            <Text style={s.title}>Couldn't reach Stride.</Text>
            <Text style={s.body}>{state.message}</Text>
            <Button label="Try again" onPress={retry} style={s.button} />
          </>
        ) : null}
        {state.kind === 'rejected' ? (
          <>
            <Text style={s.title}>Stride didn't accept your sign-in.</Text>
            <Text style={s.body}>Sign out and back in. If it keeps happening, the server's Clerk setup needs a look.</Text>
            <Button label="Sign out" variant="ghost" onPress={() => void signOut()} style={s.button} />
          </>
        ) : null}
      </View>
    )

  return (
    <LogProvider>
      <Tabs
        tabBar={(props) => <Dock {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: t.c.bg },
          sceneStyleInterpolator: shift,
          transitionSpec: { animation: 'spring', config: motion.spring.smooth },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="log" options={{ title: 'Log' }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
        <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      </Tabs>
    </LogProvider>
  )
}

// Friendly screen instead of a red box when a tab throws, with a way back in.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const s = useStyles()
  return (
    <View style={s.center}>
      <Polo size={64} mood="wow" hop={1} />
      <Text style={s.title}>Something slipped.</Text>
      <Text style={s.body}>{plainError(error)}</Text>
      <Button label="Try again" onPress={() => void retry()} style={s.button} />
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg, paddingHorizontal: layout.screenX },
  title: { ...font('emptyTitle'), color: t.c.ink, marginTop: 16 },
  body: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 6 },
  button: { marginTop: 18 },
}))
