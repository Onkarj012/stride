import { Placeholder, Screen, ScreenTitle } from '@/components/Screen'

// Progress tab: weight trend, burn and strength arrive in slices 7 and 8.
export default function ProgressScreen() {
  return (
    <Screen>
      <ScreenTitle eyebrow="Progress" title="Your trend" />
      <Placeholder
        title="Give it two weeks."
        body="Weigh in most mornings and log what you eat. Your weight trend and real daily burn show up here."
      />
    </Screen>
  )
}
