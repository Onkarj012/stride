import { useEffect } from 'react'
import { Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated'
import { motion, radii, type } from '@stride/ui-tokens'
import { formatNumber } from '@/lib/format'
import { font, themedStyles, useTheme } from '@/theme'

const HERO = type.hero.size
const DIGIT_W = HERO * 0.6
const SEP_W = HERO * 0.24

// One rolling digit column; springs from 0 to its digit on mount and on change.
function Digit({ value, color }: { value: number; color: string }) {
  const s = useStyles()
  const y = useSharedValue(0)
  useEffect(() => {
    y.value = withSpring(-value * HERO, motion.spring.bouncy)
  }, [value, y])
  const roll = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))

  return (
    <View style={s.digit}>
      <Animated.View style={roll}>
        {Array.from({ length: 10 }, (_, d) => (
          <Text key={d} style={[s.heroText, { color }]} allowFontScaling={false}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  )
}

// The big kcal-left number as an odometer, as in the mock's hero.
export function Odometer({ value }: { value: number }) {
  const t = useTheme()
  const s = useStyles()
  const chars = formatNumber(value).split('')
  return (
    <View style={s.odo} accessible accessibilityLabel={`${formatNumber(value)}`}>
      {chars.map((ch, i) =>
        ch === ',' ? (
          <Text key={`sep${i}`} style={[s.heroText, s.sep, { color: t.c.ink }]} allowFontScaling={false}>
            ,
          </Text>
        ) : (
          <Digit key={`d${chars.length - i}`} value={Number(ch)} color={t.c.ink} />
        ),
      )}
    </View>
  )
}

// Width that springs from 0 to a percentage, used by the day bar and macro tracks.
function useGrow(percent: number, delay = 0) {
  const w = useSharedValue(0)
  useEffect(() => {
    w.value = withDelay(delay, withSpring(percent, motion.spring.bouncy))
  }, [percent, delay, w])
  return useAnimatedStyle(() => ({ width: `${Math.max(0, w.value)}%` }))
}

// One meal's slice of the day bar.
function DaySegment({ percent, first, index }: { percent: number; first: boolean; index: number }) {
  const s = useStyles()
  const grow = useGrow(percent, index * 60)
  return <Animated.View style={[s.segment, first && s.segmentFirst, grow]} />
}

// Day bar: one segment per meal, sized by its share of the day's budget.
export function DayBar({ meals, target }: { meals: { key: string; kcal: number }[]; target: number }) {
  const s = useStyles()
  const total = meals.reduce((sum, m) => sum + m.kcal, 0)
  const scale = Math.max(target, total)
  return (
    <View style={s.daybar}>
      {meals.map((m, i) => (
        <DaySegment key={m.key} percent={Math.min(100, (m.kcal / scale) * 100)} first={i === 0} index={i} />
      ))}
    </View>
  )
}

// One macro column: dot, name, grams eaten of target, and a thin growing track.
export function Macro({ name, eaten, target, color }: { name: string; eaten: number; target: number; color: string }) {
  const s = useStyles()
  const grow = useGrow(Math.min(100, (eaten / target) * 100), 120)
  return (
    <View style={s.macro}>
      <View style={s.macroKey}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.macroName}>{name}</Text>
      </View>
      <Text style={s.macroValue}>
        {Math.round(eaten)}
        <Text style={s.macroOf}> / {target} g</Text>
      </Text>
      <View style={s.track}>
        <Animated.View style={[s.fill, { backgroundColor: color }, grow]} />
      </View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  odo: { flexDirection: 'row', height: HERO, overflow: 'hidden' },
  digit: { width: DIGIT_W, height: HERO, overflow: 'hidden' },
  heroText: { ...font('hero'), height: HERO, lineHeight: HERO, textAlign: 'center', letterSpacing: 0 },
  sep: { width: SEP_W },
  daybar: {
    marginTop: 18,
    height: 14,
    borderRadius: 8,
    backgroundColor: t.c.card2,
    flexDirection: 'row',
    gap: 3,
    overflow: 'hidden',
  },
  segment: { height: '100%', backgroundColor: t.c.ink, opacity: 0.82, borderRadius: 3 },
  segmentFirst: { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  macro: { flex: 1 },
  macroKey: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: radii.pill },
  macroName: { ...font('label'), color: t.c.ink2 },
  macroValue: { ...font('metric'), color: t.c.ink, marginTop: 4 },
  macroOf: { ...font('label'), color: t.c.ink3, letterSpacing: 0 },
  track: { height: 4, borderRadius: 4, backgroundColor: t.c.card2, marginTop: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
}))
