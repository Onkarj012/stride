import { Text, View } from 'react-native'
import { Tabs } from 'expo-router/js-tabs'
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs'
import type { ErrorBoundaryProps } from 'expo-router'
import { layout, motion } from '@stride/ui-tokens'
import { Button } from '@/components/Controls'
import { Dock } from '@/components/Dock'
import { LogProvider } from '@/components/LogProvider'
import { OpenSheetsProvider } from '@/components/Sheet'
import { Polo } from '@/components/Polo'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { plainError } from '@/lib/log'
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

// Tab navigator for Today, Log, Progress and Coach, drawn as the floating v5 dock (D17), under the shared log sheet.
export default function TabsLayout() {
  const t = useTheme()
  return (
    <TimeZoneGate>
      <OpenSheetsProvider>
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
      </OpenSheetsProvider>
    </TimeZoneGate>
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
