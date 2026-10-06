import { Text } from 'react-native'
import { Placeholder, Screen, ScreenTitle } from '@/components/Screen'
import { font, useTheme } from '@/theme'

// Coach tab: chat list and chats arrive in a later slice.
export default function CoachScreen() {
  const t = useTheme()
  return (
    <Screen>
      <ScreenTitle eyebrow="Coach" title="Chats" />
      <Text style={[font('callout'), { color: t.c.ink2, marginTop: 12 }]}>
        Polo reads your logs and can fix them when you ask. Every change shows up with an undo.
      </Text>
      <Placeholder title="No chats yet." body="Ask about protein, your burn, or tonight's dinner. Chats open here soon." />
    </Screen>
  )
}
