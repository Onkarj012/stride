import { useEffect } from 'react'
import { Text, View } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { router } from 'expo-router'
import type { ErrorBoundaryProps } from 'expo-router'
import { layout } from '@stride/ui-tokens'
import { Button } from '@/components/Controls'
import { Polo } from '@/components/Polo'
import { plainError } from '@/lib/log'
import { font, themedStyles } from '@/theme'

// Friendly screen instead of a red box when a route throws. Reports the error to Sentry, with a retry and a way back when there is history.
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const s = useStyles()
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])
  return (
    <View style={s.center}>
      <Polo size={64} mood="wow" hop={1} />
      <Text style={s.title}>Something slipped.</Text>
      <Text style={s.body}>{plainError(error)}</Text>
      <Button label="Try again" onPress={() => void retry()} style={s.button} />
      {router.canGoBack() ? <Button label="Back" variant="ghost" onPress={() => router.back()} style={s.back} /> : null}
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg, paddingHorizontal: layout.screenX },
  title: { ...font('emptyTitle'), color: t.c.ink, marginTop: 16 },
  body: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 6 },
  button: { marginTop: 18 },
  back: { marginTop: 8 },
}))
