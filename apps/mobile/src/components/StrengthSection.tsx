import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { router } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import { layout, motion, radii } from '@stride/ui-tokens'
import { formatDayTitle, formatNumber } from '@/lib/format'
import { formatKg, muscleName, type StrengthStats } from '@/lib/strength'
import { useLocalToday } from '@/lib/useLocalToday'
import { font, themedStyles, useTheme } from '@/theme'
import { Button, Thinking } from './Controls'
import { Polo } from './Polo'
import { Section } from './Screen'

const AnimatedRect = Animated.createAnimatedComponent(Rect)
const TREND_POINTS = 8
const SPARK_W = 84
const SPARK_H = 30
const BAND = { low: 10, high: 20 }
const SCALE_MIN = 22

type Lift = StrengthStats['exercises'][number]

// Progress block (mock #/progress strength card): e1RM trend per top lift, this week's hard sets per muscle, and the way into a workout.
export function StrengthSection() {
  const s = useStyles()
  const today = useLocalToday()
  const stats = useQuery(api.strength.stats, { weeks: 1, localDate: today })
  const open = useQuery(api.strength.activeSession, {})
  const start = <Button label={open ? 'Resume workout' : 'Start workout'} icon="play" size="block" onPress={() => router.push('/workout')} style={s.start} />
  const saved = <Button label="Saved workouts" variant="ghost" size="block" onPress={() => router.push({ pathname: '/workout', params: { view: 'history' } })} style={s.start} />

  if (stats === undefined)
    return (
      <View>
        <Section title="Strength" />
        <Thinking label="Adding up your lifts…" />
      </View>
    )

  const lifts = stats.exercises.filter((lift) => lift.trend.length > 0).slice(0, 4)
  const muscles = [...(stats.weeklyVolume.at(-1)?.muscles ?? [])].sort((a, b) => b.sets - a.sets).slice(0, 6)
  const scale = Math.max(SCALE_MIN, ...muscles.map((m) => m.sets))

  // Only a user with no sets at all gets the empty card; bodyweight or high-rep sets still count toward volume.
  if (stats.exercises.length === 0)
    return (
      <View>
        <Section title="Strength" />
        <View style={[s.card, s.empty]}>
          <Polo size={52} hop={1} />
          <Text style={s.emptyTitle}>{stats.historyLimited ? 'No recent lifts.' : 'No lifts yet.'}</Text>
          <Text style={s.emptyBody}>{stats.historyLimited ? `The most recent ${formatNumber(stats.historySetLimit)} saved sets have no lifts to show. Older workouts are still available below.` : 'Log a workout and your estimated 1-rep max and weekly sets show up here.'}</Text>
          {start}
          {saved}
        </View>
      </View>
    )

  return (
    <View>
      <Section title="Strength" />
      <View style={s.card}>
        {stats.historyLimited ? <Text style={s.faint}>Showing the most recent {formatNumber(stats.historySetLimit)} saved sets. Trends and weekly counts may omit older sets.</Text> : null}
        {lifts.length > 0 ? (
          <>
            <Text style={s.eyebrow}>Estimated 1-rep max</Text>
            <View style={s.lifts}>
              {lifts.map((lift, i) => (
                <LiftRow key={lift.exerciseId} lift={lift} last={i === lifts.length - 1} />
              ))}
            </View>
          </>
        ) : null}
        <Text style={[s.eyebrow, lifts.length > 0 && s.volTitle]}>Hard sets this week</Text>
        {muscles.length === 0 ? (
          <Text style={s.faint}>No sets yet this week.</Text>
        ) : (
          <>
            {muscles.map((m) => (
              <VolumeRow key={m.muscle} name={muscleName(m.muscle)} sets={m.sets} scale={scale} />
            ))}
            <Text style={s.faint}>Shaded band is 10 to 20 sets, the useful range for most people.</Text>
          </>
        )}
        {start}
        {saved}
      </View>
    </View>
  )
}

// One lift: name and recency, a sparkline of its recent daily best e1RM, the latest value and change.
function LiftRow({ lift, last }: { lift: Lift; last: boolean }) {
  const t = useTheme()
  const s = useStyles()
  const points = lift.trend.slice(-TREND_POINTS)
  const values = points.map((p) => p.e1rmKg)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const x = (i: number) => (points.length === 1 ? SPARK_W - 4 : 4 + (i * (SPARK_W - 8)) / (points.length - 1))
  const y = (v: number) => SPARK_H - 4 - ((v - lo) / (hi - lo || 1)) * (SPARK_H - 8)
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const latest = values.at(-1) ?? 0
  const change = points.length > 1 ? latest - (values[0] ?? latest) : null
  const lastDate = points.at(-1)?.localDate

  return (
    <View style={[s.lift, !last && s.liftLine]}>
      <View style={s.grow}>
        <Text style={s.liftName} numberOfLines={1}>
          {lift.name}
        </Text>
        <Text style={s.liftSub}>
          {points.length} {points.length === 1 ? 'day' : 'days'}
          {lastDate ? ` · last ${formatDayTitle(lastDate)}` : ''}
        </Text>
      </View>
      <Svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
        {points.length > 1 ? <Path d={path} fill="none" stroke={t.c.ink} strokeOpacity={0.8} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /> : null}
        <Circle cx={x(points.length - 1)} cy={y(latest)} r={2.6} fill={t.c.polo} />
      </Svg>
      <View style={s.liftValue}>
        <Text style={s.liftKg}>{formatKg(latest)} kg</Text>
        <Text style={[s.liftDelta, change !== null && change > 0 ? { color: t.c.fat } : null]}>
          {change === null ? 'first' : change > 0 ? `+${formatKg(change)} kg` : change < 0 ? `${formatKg(change)} kg` : 'holding'}
        </Text>
      </View>
    </View>
  )
}

// One muscle: hard sets this week as a springy bar over the 10 to 20 set band.
function VolumeRow({ name, sets, scale }: { name: string; sets: number; scale: number }) {
  const t = useTheme()
  const s = useStyles()
  const [width, setWidth] = useState(0)
  const grown = useSharedValue(0)
  useEffect(() => {
    grown.value = withSpring((sets / scale) * width, motion.spring.bouncy)
  }, [sets, scale, width, grown])
  const bar = useAnimatedProps(() => ({ width: Math.max(0, grown.value) }))

  return (
    <View style={s.vol} accessible accessibilityLabel={`${name}, ${formatKg(sets)} hard sets`}>
      <Text style={s.volName} numberOfLines={1}>
        {name}
      </Text>
      <View style={s.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={8}>
            <Rect x={0} y={0} width={width} height={8} rx={4} fill={t.c.card2} />
            <Rect x={(BAND.low / scale) * width} y={0} width={((BAND.high - BAND.low) / scale) * width} height={8} fill={t.c.fat} fillOpacity={0.18} />
            <AnimatedRect x={0} y={0} height={8} rx={4} fill={t.c.ink} fillOpacity={0.8} animatedProps={bar} />
          </Svg>
        ) : null}
      </View>
      <Text style={s.volCount}>{formatKg(sets)}</Text>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1, minWidth: 0 },
  card: { backgroundColor: t.c.card, borderRadius: radii.card, padding: layout.cardPadding, boxShadow: t.shadow.card },
  empty: { alignItems: 'center', paddingVertical: 26 },
  emptyTitle: { ...font('emptyTitle'), color: t.c.ink, marginTop: 12 },
  emptyBody: { ...font('callout'), color: t.c.ink2, textAlign: 'center', marginTop: 6 },
  eyebrow: { ...font('eyebrow'), color: t.c.ink3 },
  lifts: { marginTop: 6 },
  lift: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  liftLine: { borderBottomWidth: 1, borderBottomColor: t.c.line },
  liftName: { ...font('bodyStrong'), color: t.c.ink },
  liftSub: { ...font('caption'), color: t.c.ink3, marginTop: 1 },
  liftValue: { alignItems: 'flex-end', minWidth: 64 },
  liftKg: { ...font('value'), fontSize: 19, color: t.c.ink, fontVariant: ['tabular-nums'] },
  liftDelta: { ...font('label'), fontSize: 11.5, fontFamily: font('calloutStrong').fontFamily, color: t.c.ink3 },
  volTitle: { marginTop: 20, marginBottom: 2 },
  vol: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  volName: { ...font('secondary'), fontSize: 13, color: t.c.ink, width: 86 },
  track: { flex: 1, height: 8 },
  volCount: { ...font('calloutStrong'), fontSize: 13, color: t.c.ink, width: 30, textAlign: 'right', fontVariant: ['tabular-nums'] },
  faint: { ...font('label'), color: t.c.ink3, marginTop: 10 },
  start: { marginTop: 18 },
}))
