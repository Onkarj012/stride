import { useEffect, useRef, useState } from 'react'
import { Text, View, type LayoutRectangle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { addDays, daysBetween } from '@stride/core'
import { api } from 'stride-backend/convex/_generated/api'
import { motion, radii } from '@stride/ui-tokens'
import { formatRate, useBurnMilestone } from '@/components/BurnSheet'
import { Tag, Thinking } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { useLog } from '@/components/LogProvider'
import { Polo } from '@/components/Polo'
import { Screen, ScreenTitle } from '@/components/Screen'
import { StrengthSection } from '@/components/StrengthSection'
import { Tap } from '@/components/Tap'
import { WeightChart, type WeightPoint } from '@/components/WeightChart'
import { formatDayTitle, formatNumber, weekdayOf } from '@/lib/format'
import { SUMMARY_DAYS } from '@/lib/log'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'

type Summary = FunctionReturnType<typeof api.progress_v2.summary>

const RANGES = [
  { label: '2W', days: SUMMARY_DAYS },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
] as const
const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DEFAULT_TIP = "Dots are weigh-ins. The line is the trend, so one salty dinner doesn't count."

// Progress tab (mock #/progress): weight trend, daily burn, target for the week, then strength.
export default function ProgressScreen() {
  const s = useStyles()
  const [range, setRange] = useState<number>(SUMMARY_DAYS)
  const today = useLocalToday()
  const fresh = useQuery(api.progress_v2.summary, { rangeDays: range, localDate: today })
  // Keep showing the last range while a new one loads, so switching doesn't blank the screen.
  const kept = useRef<{ summary: Summary; range: number } | undefined>(undefined)
  if (fresh !== undefined) kept.current = { summary: fresh, range }
  const loaded = kept.current
  const summary = loaded?.summary
  useBurnMilestone(summary?.snapshot != null)

  return (
    <Screen>
      <ScreenTitle eyebrow="Progress" title="Your trend" aside={<RangeSwitch value={range} onChange={setRange} />} />
      {loaded === undefined ? (
        <Thinking label="Reading your weigh-ins…" />
      ) : (
        <>
          <WeightCard key={loaded.range} summary={loaded.summary} range={loaded.range} />
          <BurnCard summary={loaded.summary} />
          <WeekCard summary={loaded.summary} />
        </>
      )}

      <View style={s.strengthSpot}>
        <StrengthSection />
      </View>
    </Screen>
  )
}

// 2W / 1M / 3M segmented switch with a card pill that springs to the chosen range.
function RangeSwitch({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  const s = useStyles()
  const [boxes, setBoxes] = useState<Record<number, LayoutRectangle>>({})
  const left = useSharedValue(0)
  const width = useSharedValue(0)
  const box = boxes[value]

  useEffect(() => {
    if (!box) return
    // The first placement jumps; later ones spring like the mock's .seg pill.
    if (width.value === 0) {
      left.value = box.x
      width.value = box.width
      return
    }
    left.value = withSpring(box.x, motion.spring.bouncy)
    width.value = withSpring(box.width, motion.spring.bouncy)
  }, [box, left, width])

  const pill = useAnimatedStyle(() => ({ left: left.value, width: width.value, opacity: width.value === 0 ? 0 : 1 }))

  return (
    <View style={s.seg}>
      <Animated.View style={[s.segPill, pill]} />
      {RANGES.map((r) => (
        <Tap
          key={r.days}
          scale={0.94}
          onPress={() => onChange(r.days)}
          onLayout={(e) => {
            const layout = e.nativeEvent.layout
            setBoxes((b) => ({ ...b, [r.days]: layout }))
          }}
          style={s.segButton}
          accessibilityRole="button"
          accessibilityState={{ selected: r.days === value }}
        >
          <Text style={[s.segText, r.days === value && s.segOn]}>{r.label}</Text>
        </Tap>
      ))}
    </View>
  )
}

// "in 9 days" or "in 3 weeks" for the span the weigh-ins actually cover.
function spanText(days: number): string {
  if (days < 14) return `in ${days} ${days === 1 ? 'day' : 'days'}`
  return `in ${Math.round(days / 7)} weeks`
}

// Weight trend card: latest trend, change over the range, weekly rate and the chart.
function WeightCard({ summary, range }: { summary: Summary; range: number }) {
  const s = useStyles()
  const [scrub, setScrub] = useState<WeightPoint | null>(null)
  const { weights, latestTrendKg, weeklyRateKg, localDate } = summary
  const first = weights[0]
  const last = weights.at(-1)

  if (!first || !last || latestTrendKg === null)
    return (
      <View style={[s.card, s.empty]}>
        <Polo size={56} hop={1} />
        <Text style={s.emptyTitle}>No weigh-ins {latestTrendKg === null ? 'yet' : 'in this range'}.</Text>
        <Text style={s.emptyBody}>Weigh in on Today most mornings. Dots and a trend line show up here.</Text>
      </View>
    )

  const change = last.trendKg - first.trendKg
  const covered = daysBetween(first.localDate, last.localDate)
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>Weight trend</Text>
      <Text style={[s.big, s.bigTop]}>
        {latestTrendKg.toFixed(1)}
        <Text style={s.bigUnit}> kg</Text>
      </Text>
      <Text style={s.delta}>
        {weights.length < 2 ? (
          'One weigh-in so far. The trend needs a few more.'
        ) : (
          <>
            <Text style={s.deltaStrong}>
              {change < -0.05 ? '−' : change > 0.05 ? '+' : ''}
              {Math.abs(change).toFixed(1)} kg
            </Text>{' '}
            {spanText(covered)}
            {weeklyRateKg !== null ? ` · ${formatRate(weeklyRateKg)}` : ''}
          </>
        )}
      </Text>
      <WeightChart points={weights} from={addDays(localDate, 1 - range)} to={localDate} onScrub={setScrub} />
      <Text style={s.tip} numberOfLines={1}>
        {scrub ? (
          <>
            <Text style={s.tipStrong}>{formatDayTitle(scrub.localDate)}</Text> · trend {scrub.trendKg.toFixed(1)} kg · scale
            said {scrub.kg.toFixed(1)}
          </>
        ) : (
          DEFAULT_TIP
        )}
      </Text>
    </View>
  )
}

// A labelled gate requirement with a bar that springs to how far along it is.
function GateRow({ label, value, fill, done, index }: { label: string; value: string; fill: number; done: boolean; index: number }) {
  const t = useTheme()
  const s = useStyles()
  const grow = useSharedValue(0)
  useEffect(() => {
    grow.value = withDelay(index * 80, withSpring(Math.max(0, Math.min(1, fill)), motion.spring.smooth))
  }, [fill, index, grow])
  const bar = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }))
  return (
    <View style={s.gateRow}>
      <View style={s.gateHead}>
        <Text style={s.gateLabel}>{label}</Text>
        <View style={s.gateValue}>
          {done ? <Icon name="check" size={14} color={t.c.fat} /> : null}
          <Text style={s.gateValueText}>{value}</Text>
        </View>
      </View>
      <View style={s.track}>
        <Animated.View style={[s.trackFill, done && { backgroundColor: t.c.fat }, bar]} />
      </View>
    </View>
  )
}

// Daily burn card: the learned number once a snapshot exists, otherwise honest progress toward the D11 gate.
function BurnCard({ summary }: { summary: Summary }) {
  const t = useTheme()
  const s = useStyles()
  const { openBurn } = useLog()
  const { snapshot, gate } = summary

  if (snapshot)
    return (
      <Tap style={s.card} scale={0.98} onPress={() => openBurn(false)} accessibilityRole="button" accessibilityHint="How your burn is worked out">
        <View style={s.cardHead}>
          <View style={s.grow}>
            <Text style={s.eyebrow}>Your daily burn</Text>
            <Text style={[s.big, s.bigTop]}>
              {formatNumber(snapshot.estimate)}
              <Text style={s.bigUnit}> kcal / day</Text>
            </Text>
          </View>
          <Tag text="Learned" />
        </View>
        <Text style={s.delta}>Worked out from your last {snapshot.windowDays} days of logs and weigh-ins.</Text>
        <View style={s.confRow}>
          <Text style={s.conf}>{Math.round(snapshot.confidence * 100)}% of days logged</Text>
          <View style={s.grow} />
          <Text style={s.how}>How?</Text>
          <Icon name="chevron" size={16} color={t.c.ink} />
        </View>
      </Tap>
    )

  const needsProfile = gate.reasons.includes('missing_baseline')
  const dataReady = !gate.reasons.some((r) => r !== 'missing_baseline')
  const minPct = Math.round(gate.minLoggedFraction * 100)
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>Your daily burn</Text>
      <Text style={s.cardTitle}>{dataReady && !needsProfile ? 'Almost ready' : 'Still learning'}</Text>
      <Text style={s.delta}>
        {dataReady && !needsProfile
          ? 'You have enough data. Your first real burn number arrives with the next early-morning update.'
          : `It needs ${gate.minDays} days with ${gate.minWeighIns} weigh-ins and ${minPct}% of days logged. Nothing is guessed in the meantime.`}
      </Text>
      <GateRow
        index={0}
        label="Days of data"
        value={`${Math.min(gate.windowDays, gate.minDays)} of ${gate.minDays}`}
        fill={gate.windowDays / gate.minDays}
        done={gate.windowDays >= gate.minDays}
      />
      <GateRow
        index={1}
        label="Weigh-ins"
        value={`${Math.min(gate.weighIns, gate.minWeighIns)} of ${gate.minWeighIns}`}
        fill={gate.weighIns / gate.minWeighIns}
        done={gate.weighIns >= gate.minWeighIns}
      />
      <GateRow
        index={2}
        label="Days logged"
        value={gate.windowDays === 0 ? `needs ${minPct}%` : `${gate.loggedDays} of ${gate.windowDays} · needs ${minPct}%`}
        fill={gate.windowDays === 0 ? 0 : gate.loggedFraction / gate.minLoggedFraction}
        done={gate.windowDays > 0 && gate.loggedFraction >= gate.minLoggedFraction}
      />
      {needsProfile ? (
        <Text style={s.note}>Also needs your height, age, sex and activity level, plus one weigh-in.</Text>
      ) : null}
    </View>
  )
}

// One day's bar: grows from the floor with a spring, coral for today, dashed when nothing was logged.
function DayBar({ height, today, empty, index }: { height: number; today: boolean; empty: boolean; index: number }) {
  const s = useStyles()
  const h = useSharedValue(0)
  useEffect(() => {
    h.value = withDelay(index * 50, withSpring(height, motion.spring.bouncy))
  }, [height, index, h])
  const style = useAnimatedStyle(() => ({ height: h.value }))
  if (empty) return <View style={s.barEmpty} />
  return <Animated.View style={[s.bar, today && s.barToday, style]} />
}

const BARS_HEIGHT = 100

// Target card (mock "This week"): the current daily target, where it comes from, and the last 7 days against it.
function WeekCard({ summary }: { summary: Summary }) {
  const s = useStyles()
  const { localDate, target } = summary
  const from = addDays(localDate, -6)
  const days = useQuery(api.day_totals.dayTotalsInRange, { from, to: localDate })
  const byDate = new Map((days ?? []).filter((d) => d.entryCount > 0).map((d) => [d.localDate, d.nutrients.kcal]))
  const past = [...byDate].filter(([date]) => date < localDate).map(([, kcal]) => kcal)
  const avg = past.length > 0 ? past.reduce((a, b) => a + b, 0) / past.length : null
  const top = Math.max(target?.kcal ?? 0, ...byDate.values()) * 1.1 || 1
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={s.grow}>
          <Text style={s.eyebrow}>Daily target</Text>
          {target ? (
            <Text style={[s.big, s.bigTop, s.bigSmall]}>
              {formatNumber(target.kcal)}
              <Text style={s.bigUnit}> kcal / day</Text>
            </Text>
          ) : (
            <Text style={s.cardTitle}>No target yet</Text>
          )}
        </View>
        {avg !== null ? (
          <Text style={s.faint}>
            avg {formatNumber(avg)} · {past.length} {past.length === 1 ? 'day' : 'days'}
          </Text>
        ) : null}
      </View>
      <Text style={s.delta}>
        {target === null
          ? 'Finish your profile and weigh in once to get one.'
          : target.source === 'adaptive'
            ? `From your real burn and your goal. Set ${formatDayTitle(target.appliedLocalDate)}, updates once a week.`
            : `From the formula for now. Set ${formatDayTitle(target.appliedLocalDate)}. Your real burn takes over after two weeks.`}
      </Text>
      <View style={s.week}>
        {target ? (
          <View style={[s.targetLine, { bottom: (target.kcal / top) * BARS_HEIGHT + 22 }]}>
            <Text style={s.targetLabel}>{formatNumber(target.kcal)}</Text>
          </View>
        ) : null}
        {week.map((date, i) => {
          const kcal = byDate.get(date)
          return (
            <View key={date} style={s.col}>
              <DayBar index={i} height={kcal === undefined ? 0 : (kcal / top) * BARS_HEIGHT} today={date === localDate} empty={kcal === undefined} />
              <Text style={s.colLabel}>{date === localDate ? 'Now' : WEEK_LETTERS[weekdayOf(date)]}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  card: {
    marginTop: 14,
    backgroundColor: t.c.card,
    borderRadius: radii.card,
    boxShadow: t.shadow.card,
    padding: 18,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  faint: { ...font('caption'), color: t.c.ink3, marginTop: 2 },
  big: { ...font('screenTitle'), fontSize: 44, lineHeight: 46, color: t.c.ink, fontVariant: ['tabular-nums'] },
  bigSmall: { fontSize: 34, lineHeight: 38 },
  bigTop: { marginTop: 8 },
  bigUnit: { ...font('heroUnit'), color: t.c.ink3, letterSpacing: 0 },
  cardTitle: { ...font('cardTitle'), color: t.c.ink, marginTop: 6 },
  delta: { ...font('secondary'), fontSize: 13, color: t.c.ink2, marginTop: 6 },
  deltaStrong: { fontFamily: font('bodyStrong').fontFamily, color: t.c.ink },
  tip: { ...font('caption'), color: t.c.ink2, marginTop: 4 },
  tipStrong: { fontFamily: font('bodyStrong').fontFamily, color: t.c.ink },
  empty: { alignItems: 'center', paddingVertical: 26 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, marginTop: 6, textAlign: 'center' },
  seg: { flexDirection: 'row', backgroundColor: t.c.card2, borderRadius: radii.pill, padding: 3 },
  segPill: { position: 'absolute', top: 3, bottom: 3, borderRadius: radii.pill, backgroundColor: t.c.card, boxShadow: t.shadow.card },
  segButton: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: radii.pill },
  segText: { ...font('buttonSmall'), color: t.c.ink2 },
  segOn: { color: t.c.ink },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  conf: { ...font('caption'), color: t.c.ink2 },
  how: { ...font('calloutStrong'), fontSize: 13, color: t.c.ink },
  gateRow: { marginTop: 14 },
  gateHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gateLabel: { ...font('label'), color: t.c.ink2 },
  gateValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gateValueText: { ...font('label'), fontFamily: font('bodyStrong').fontFamily, color: t.c.ink, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: t.c.card2, marginTop: 6, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: t.c.polo },
  note: { ...font('caption'), color: t.c.ink3, marginTop: 14 },
  week: { flexDirection: 'row', alignItems: 'flex-end', height: BARS_HEIGHT + 30, marginTop: 18 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: '100%' },
  bar: { width: 24, borderRadius: 7, backgroundColor: t.c.ink, opacity: 0.85 },
  barToday: { backgroundColor: t.c.polo, opacity: 1 },
  barEmpty: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.line2 },
  colLabel: { ...font('label'), fontSize: 11.5, color: t.c.ink3 },
  targetLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.polo, opacity: 0.7 },
  targetLabel: { ...font('tag'), fontSize: 11, color: t.c.poloInk, position: 'absolute', right: 0, top: -18, textTransform: 'none' },
  strengthSpot: { marginTop: 14 },
}))
