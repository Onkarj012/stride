import { View, Pressable } from 'react-native'
import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import * as Haptics from '../../lib/haptics'
import { api } from '@convex/_generated/api'
import { MacroSummary } from '../../components/MacroSummary'
import { NarrativeCard } from '../../components/NarrativeCard'
import { StatChip } from '../../components/StatChip'
import { StreakCard } from '../../components/StreakCard'
import { WaterTracker } from '../../components/WaterTracker'
import { StrideMark } from '../../components/StrideMark'
import { Icon } from '../../components/Icon'
import { useTheme } from '../../components/theme'
import { AppText, IconButton } from '../../components/ui'

type TodayBrief = {
  priority?: string
  stats?: {
    todayCals?: number
    calorieTarget?: number
    adjustedCalorieTarget?: number
    todayProtein?: number
    proteinTarget?: number
    todayCarbs?: number
    carbTarget?: number
    todayFat?: number
    fatTarget?: number
    waterMl?: number
    waterTarget?: number
    mealsLogged?: number
    workoutsLogged?: number
  }
}

function localDateStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function dailyWindow(): 'morning' | 'day' | 'evening' | 'night' {
  const hour = new Date().getHours()
  if (hour < 11) return 'morning'
  if (hour < 18) return 'day'
  if (hour < 22) return 'evening'
  return 'night'
}

function LoadingCard() {
  const t = useTheme()
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <AppText variant="body" color={t.textMuted}>Loading today…</AppText>
    </View>
  )
}

export default function TodayScreen() {
  const router = useRouter()
  const t = useTheme()
  const today = localDateStr()
  const brief = useQuery(api.insights.getTodayBrief, { today, window: dailyWindow() }) as TodayBrief | undefined
  const waterLogs = useQuery(api.wellness.getWater, { date: today }) as Array<{ ml: number; _creationTime?: number; _id: string }> | undefined
  const streak = useQuery(api.history.getStreak, { today }) as { streak: number } | undefined
  const addWater = useMutation(api.wellness.addWater)
  const deleteWater = useMutation(api.wellness.deleteWater)
  const stats = brief?.stats
  const totals = {
    kcal: Math.round(stats?.todayCals ?? 0),
    protein: Math.round(stats?.todayProtein ?? 0),
    carbs: Math.round(stats?.todayCarbs ?? 0),
    fat: Math.round(stats?.todayFat ?? 0),
  }
  const target = {
    kcal: Math.round(stats?.adjustedCalorieTarget ?? stats?.calorieTarget ?? 2000),
    protein: Math.round(stats?.proteinTarget ?? 90),
    carbs: Math.round(stats?.carbTarget ?? 200),
    fat: Math.round(stats?.fatTarget ?? 65),
  }
  const waterMl = waterLogs?.reduce((sum, row) => sum + row.ml, 0) ?? stats?.waterMl ?? 0

  async function handleRemoveWater() {
    const latest = [...(waterLogs ?? [])].sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0))[0]
    if (latest) await deleteWater({ id: latest._id as never })
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <View>
            <AppText variant="h1">Today</AppText>
            <AppText variant="small" color={t.textMuted} style={{ marginTop: 2 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 }}>
            <IconButton icon="calendar" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/history') }} size={40} iconSize={20} />
            <IconButton icon="settings" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/settings') }} size={40} iconSize={20} />
          </View>
        </View>

        {!brief ? <LoadingCard /> : <>
          <NarrativeCard
            type="daily"
            narrative={brief.priority ?? 'Tell Stry what you eat, how you train, or how you feel.'}
            date="Today"
          />
          <MacroSummary totals={totals} target={target} />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
            <StatChip label="Meals" value={String(stats?.mealsLogged ?? 0)} color="peach" />
            <StatChip label="Workouts" value={String(stats?.workoutsLogged ?? 0)} color="sky" />
            <StatChip label="Water" value={`${(waterMl / 1000).toFixed(1)}L`} color="mint" />
          </View>
          <StreakCard days={streak?.streak ?? 0} quote="Small, consistent logs make the pattern visible." />
          <WaterTracker
            current={waterMl}
            target={stats?.waterTarget ?? 2500}
            unit="ml"
            onAdd={(ml) => { void addWater({ ml, date: today }) }}
            onRemove={() => { void handleRemoveWater() }}
          />
        </>}

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/stry') }}
          style={({ pressed }) => ({
            backgroundColor: t.accent, borderRadius: 20, padding: 20,
            shadowColor: t.accent, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3,
            shadowRadius: 18, elevation: 8, overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <StrideMark size={28} color={t.fabIcon} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={t.fabIcon} style={{ fontSize: 15 }}>Tell Stry about your day</AppText>
              <AppText variant="caption" color={t.fabIcon} style={{ fontSize: 13, marginTop: 2, opacity: 0.7 }}>Type, speak, or snap a photo to log</AppText>
            </View>
            <Icon name="chevronRight" size={20} color={t.fabIcon} />
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
