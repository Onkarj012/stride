import { useState } from 'react'
import { ScrollView, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import * as Haptics from '../lib/haptics'
import { WorkoutSessionCard } from '../components/WorkoutSessionCard'
import { MealLogCard } from '../components/MealLogCard'
import { useTheme, SKY, BUBBLEGUM, MINT, LAVENDER } from '../components/theme'
import { AppText, IconButton, ProgressBar } from '../components/ui'
import { HISTORY_DAYS, dayDetail } from '../data'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const CAL_CELL_GAP = 4
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const offset = (firstDay + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

const SPRING = { stiffness: 220, damping: 26 } as const

export default function HistoryScreen() {
  const router = useRouter()
  const [selected, setSelected] = useState(25)
  const [calYear, setCalYear] = useState(2026)
  const [calMonth, setCalMonth] = useState(6)
  const [gridWidth, setGridWidth] = useState(0)
  const t = useTheme()
  const cellSize = gridWidth > 0 ? Math.floor((gridWidth - CAL_CELL_GAP * 6) / 7) : 36

  const detail = dayDetail(selected)
  const weeks = getMonthGrid(calYear, calMonth)
  const isJune2026 = calYear === 2026 && calMonth === 6

  function prevMonth() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12) }
    else setCalMonth(m => m - 1)
  }

  function nextMonth() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1) }
    else setCalMonth(m => m + 1)
  }

  const scoreColor = (score: number) => {
    if (score === 0) return t.dimBgMid
    if (score === 1) return BUBBLEGUM
    if (score === 2) return SKY
    return MINT
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20, paddingTop: 8 }}>
          <IconButton icon="back" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back() }} size={40} variant="ghost" iconSize={24} iconColor={t.textMuted} marginLeft={-8} />
          <AppText variant="h2">History</AppText>
        </View>

        {/* Calendar */}
        <Animated.View
          entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}
          style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20, marginBottom: 20 }, t.cardShadow]}
        >
          {/* Month navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <IconButton icon="chevronLeft" onPress={prevMonth} size={36} variant="ghost" iconSize={18} iconColor={t.textMuted} />
            <View style={{ alignItems: 'center' }}>
              <AppText variant="title" style={{ fontSize: 17, letterSpacing: -0.3 }}>{MONTH_NAMES[calMonth - 1]}</AppText>
              <AppText variant="caption" style={{ marginTop: 1 }}>{calYear}</AppText>
            </View>
            <IconButton icon="chevronRight" onPress={nextMonth} size={36} variant="ghost" iconSize={18} iconColor={t.textMuted} />
          </View>

          {/* Legend */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: MINT }} />
              <AppText variant="caption" color={t.textMuted} style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 11 }}>Full day</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: SKY }} />
              <AppText variant="caption" color={t.textMuted} style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 11 }}>Partial</AppText>
            </View>
          </View>

          {/* Weekday headers */}
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            {WEEKDAYS.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                <AppText variant="overline" style={{ fontSize: 11, letterSpacing: 0 }}>{d}</AppText>
              </View>
            ))}
          </View>

          {/* Day grid — onLayout gives true container width, avoiding Dimensions() init issues on Android */}
          <View
            onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
            style={{ gap: CAL_CELL_GAP }}
          >
            {gridWidth > 0 && weeks.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row', gap: CAL_CELL_GAP }}>
                {week.map((day, di) => {
                  if (day === null) return <View key={di} style={{ width: cellSize, height: cellSize }} />
                  const entry = isJune2026 ? HISTORY_DAYS.find(h => h.day === day) : undefined
                  const score = entry?.score ?? 0
                  const isSelected = isJune2026 && selected === day
                  return (
                    <Pressable
                      key={day}
                      onPress={() => {
                        if (!isJune2026) return
                        Haptics.selectionAsync()
                        setSelected(day)
                      }}
                      style={({ pressed }) => ({
                        width: cellSize, height: cellSize, borderRadius: 10,
                        backgroundColor: isSelected ? t.accent : scoreColor(score),
                        alignItems: 'center', justifyContent: 'center',
                        transform: [{ scale: pressed ? 0.88 : 1 }],
                      })}
                    >
                      <AppText
                        variant={isSelected ? 'label' : 'caption'}
                        color={isSelected ? t.text : score >= 2 ? t.text : t.textMuted}
                        style={{ fontSize: 12, fontFamily: isSelected ? 'Manrope_800ExtraBold' : 'Manrope_700Bold' }}
                      >
                        {day}
                      </AppText>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Day detail */}
        {isJune2026 ? (
          <Animated.View key={selected} entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}>
            <AppText variant="title" style={{ letterSpacing: -0.5, marginBottom: 20 }}>June {selected}, 2026</AppText>

            <AppText variant="overline" style={{ marginBottom: 12 }}>Workout</AppText>
            {detail.workout ? (
              <WorkoutSessionCard session={detail.workout} />
            ) : (
              <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 20 }, t.cardShadow]}>
                <AppText variant="body" color={t.textMuted}>Rest day — no workout logged.</AppText>
              </View>
            )}

            <AppText variant="overline" style={{ marginTop: 20, marginBottom: 12 }}>Meals · {detail.meals.length} logged</AppText>
            <View style={{ gap: 12 }}>
              {detail.meals.map((m, i) => <MealLogCard key={i} {...m} index={i} />)}
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <View style={[{ flex: 1, backgroundColor: t.card, borderRadius: 16, padding: 16 }, t.cardShadow]}>
                <AppText variant="overline" style={{ marginBottom: 8 }}>Sleep</AppText>
                <AppText variant="hero" style={{ fontSize: 24, letterSpacing: -1 }}>
                  {detail.sleepHrs.toFixed(1)}<AppText variant="caption"> h</AppText>
                </AppText>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={Math.min(detail.sleepHrs / 8, 1)} color={SKY} height={6} animated={false} />
                </View>
              </View>
              <View style={[{ flex: 1, backgroundColor: t.card, borderRadius: 16, padding: 16 }, t.cardShadow]}>
                <AppText variant="overline" style={{ marginBottom: 8 }}>Water</AppText>
                <AppText variant="hero" style={{ fontSize: 24, letterSpacing: -1 }}>
                  {(detail.waterMl / 1000).toFixed(1)}<AppText variant="caption"> L</AppText>
                </AppText>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar value={Math.min(detail.waterMl / 2500, 1)} color={BUBBLEGUM} height={6} animated={false} />
                </View>
              </View>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.springify().stiffness(SPRING.stiffness).damping(SPRING.damping)}>
            <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 20, alignItems: 'center' }, t.cardShadow]}>
              <AppText variant="label" color={t.textMuted} style={{ textAlign: 'center', fontSize: 15 }}>
                No data for {MONTH_NAMES[calMonth - 1]} {calYear}
              </AppText>
              <AppText variant="small" color={t.textSubtle} style={{ marginTop: 4, textAlign: 'center' }}>
                Navigate to June 2026 to see logged days.
              </AppText>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
