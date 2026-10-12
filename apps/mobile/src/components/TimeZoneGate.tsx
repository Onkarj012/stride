import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppState, Text, View } from 'react-native'
import { useAuth } from '@clerk/expo'
import { useConvexAuth, useMutation } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { layout } from '@stride/ui-tokens'
import { deviceTimeZone, plainError } from '@/lib/log'
import { font, themedStyles } from '@/theme'
import { Button } from './Controls'
import { Polo } from './Polo'

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

// Holds signed-in screens behind the time zone sync, so date-based queries never run before the zone is stored.
export function TimeZoneGate({ children }: { children: ReactNode }) {
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

  return <>{children}</>
}

const useStyles = themedStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg, paddingHorizontal: layout.screenX },
  title: { ...font('emptyTitle'), color: t.c.ink, marginTop: 16 },
  body: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 6 },
  button: { marginTop: 18 },
}))
