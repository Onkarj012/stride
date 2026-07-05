import { View, Pressable } from 'react-native'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Haptics from '../../lib/haptics'
import { MacroSummary } from '../../components/MacroSummary'
import { NarrativeCard } from '../../components/NarrativeCard'
import { StatChip } from '../../components/StatChip'
import { StreakCard } from '../../components/StreakCard'
import { WaterTracker } from '../../components/WaterTracker'
import { StrideMark } from '../../components/StrideMark'
import { Icon } from '../../components/Icon'
import { useTheme } from '../../components/theme'
import { AppText, IconButton } from '../../components/ui'
import { MACRO_TOTALS, MACRO_TARGET, STATS, STREAK, INSIGHTS } from '../../data'

export default function TodayScreen() {
  const router = useRouter()
  const t = useTheme()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <View>
            <AppText variant="h1" style={{ lineHeight: 36 }}>Good evening</AppText>
            <AppText variant="small" color={t.textMuted} style={{ marginTop: 2 }}>Wednesday, June 25</AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 }}>
            <IconButton
              icon="calendar"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/history') }}
              size={40}
              iconSize={20}
            />
            <IconButton
              icon="settings"
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/settings') }}
              size={40}
              iconSize={20}
            />
            {/* Account avatar — always accent-colored, uses t.accent */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/account') }}
              style={({ pressed }) => ({
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: t.accent,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon name="user" size={19} color={t.fabIcon} />
            </Pressable>
          </View>
        </View>

        <NarrativeCard {...INSIGHTS.today} />
        <MacroSummary totals={MACRO_TOTALS} target={MACRO_TARGET} />

        {/* Stat chips */}
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {STATS.map((s, i) => (
            <StatChip key={s.label} {...s} index={i} />
          ))}
        </View>

        <StreakCard days={STREAK.days} quote={STREAK.quote} />
        <WaterTracker initial={1200} target={2500} unit="ml" />

        {/* Ask Stry CTA */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/stry') }}
          style={({ pressed }) => ({
            backgroundColor: t.accent,
            borderRadius: 20,
            padding: 20,
            shadowColor: t.accent,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.3,
            shadowRadius: 18,
            elevation: 8,
            overflow: 'hidden',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <StrideMark size={28} color={t.fabIcon} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={t.fabIcon} style={{ fontSize: 15 }}>
                Tell Stry about your day
              </AppText>
              <AppText variant="caption" color={t.fabIcon} style={{ fontSize: 13, marginTop: 2, opacity: 0.7 }}>
                Type, speak, or snap a photo to log
              </AppText>
            </View>
            <Icon name="chevronRight" size={20} color={t.fabIcon} />
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
