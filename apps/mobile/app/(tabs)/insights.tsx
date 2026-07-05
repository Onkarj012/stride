import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NarrativeCard } from '../../components/NarrativeCard'
import { MacroCard } from '../../components/MacroCard'
import { StreakCard } from '../../components/StreakCard'
import { MilestoneCard } from '../../components/MilestoneCard'
import { useTheme } from '../../components/theme'
import { AppText, SegToggle } from '../../components/ui'
import { MACRO_TOTALS, STREAK, MILESTONES, INSIGHTS } from '../../data'

type Range = 'today' | 'week' | 'month'

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'Week' },
  { id: 'month', label: 'Month' },
]

export default function InsightsScreen() {
  const t = useTheme()
  const [range, setRange] = useState<Range>('week')
  const ins = INSIGHTS[range]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <AppText variant="h1">Insights</AppText>
          <AppText variant="small" color={t.textSubtle} style={{ marginTop: 2 }}>What's working, what to watch</AppText>
        </View>

        <SegToggle value={range} options={RANGE_OPTIONS} onChange={setRange} />

        <NarrativeCard key={range} type={ins.type} narrative={ins.narrative} date={ins.date} />
        <MacroCard {...MACRO_TOTALS} />
        <StreakCard days={STREAK.days} quote={STREAK.quote} />
        <MilestoneCard milestones={MILESTONES} />
      </ScrollView>
    </SafeAreaView>
  )
}
