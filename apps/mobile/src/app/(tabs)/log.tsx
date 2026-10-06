import { Text } from 'react-native'
import { Placeholder, Screen, ScreenTitle } from '@/components/Screen'
import { MONTHS_LONG } from '@/lib/format'
import { font, useTheme } from '@/theme'

// Log tab: calendar history arrives in slice 6.
export default function LogScreen() {
  const t = useTheme()
  return (
    <Screen>
      <ScreenTitle
        eyebrow="Log"
        title={MONTHS_LONG[new Date().getMonth()] ?? 'This month'}
        aside={<Text style={[font('link'), { color: t.c.ink3 }]}>One day at a time</Text>}
      />
      <Placeholder title="Your days live here." body="Once you log, each day gets a ring. Tap one to see what you ate." />
    </Screen>
  )
}
