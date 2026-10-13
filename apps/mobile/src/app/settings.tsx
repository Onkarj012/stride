import { router } from 'expo-router'
import { RoundButton } from '@/components/Controls'
import { Screen, ScreenTitle } from '@/components/Screen'
import { TimeZoneGate } from '@/components/TimeZoneGate'

// Settings route. A placeholder until the settings task fills it in: title and a back control.
export default function SettingsScreen() {
  return (
    <TimeZoneGate>
      <Screen>
        <RoundButton icon="back" label="Back" onPress={() => router.back()} />
        <ScreenTitle eyebrow="You" title="Settings" />
      </Screen>
    </TimeZoneGate>
  )
}
