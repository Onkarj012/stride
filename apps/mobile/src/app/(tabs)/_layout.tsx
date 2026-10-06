import { Tabs } from 'expo-router/js-tabs'
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs'
import { motion } from '@stride/ui-tokens'
import { Dock } from '@/components/Dock'
import { useTheme } from '@/theme'

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

// Tab navigator for Today, Log, Progress and Coach, drawn as the floating v5 dock (D17).
export default function TabsLayout() {
  const t = useTheme()
  return (
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
  )
}
