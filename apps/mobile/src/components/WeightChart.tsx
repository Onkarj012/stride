import { useEffect, useState } from 'react'
import { View, type GestureResponderEvent } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'
import { daysBetween } from '@stride/core'
import { weightNumber, type Units } from '@/lib/profile'
import { useTheme } from '@/theme'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const HEIGHT = 160
const TOP = 10
const PLOT = 128
const EDGE = 8

export type WeightPoint = { localDate: string; kg: number; trendKg: number }

type WeightChartProps = {
  points: WeightPoint[]
  from: string
  to: string
  units: Units
  // Called with the weigh-in under the finger while scrubbing, and null when the finger lifts.
  onScrub: (point: WeightPoint | null) => void
}

// Weigh-ins as dots and the EMA trend as a coral line that draws in, laid out by date so gaps show (mock #/progress).
export function WeightChart({ points, from, to, units, onScrub }: WeightChartProps) {
  const t = useTheme()
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<WeightPoint | null>(null)
  const draw = useSharedValue(0)

  const span = Math.max(1, daysBetween(from, to))
  const values = points.flatMap((p) => [p.kg, p.trendKg])
  const mn = Math.floor(Math.min(...values) * 2) / 2 - 0.2
  const mx = Math.ceil(Math.max(...values) * 2) / 2 + 0.2
  const X = (date: string) => EDGE + (daysBetween(from, date) / span) * Math.max(0, width - EDGE * 2)
  const Y = (kg: number) => TOP + ((mx - kg) / (mx - mn)) * PLOT

  const xy = points.map((p) => ({ x: X(p.localDate), y: Y(p.trendKg) }))
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
  const length = xy.reduce((sum, p, i) => {
    const prev = xy[i - 1]
    return prev ? sum + Math.hypot(p.x - prev.x, p.y - prev.y) : sum
  }, 0)
  const firstX = xy[0]?.x ?? 0
  const lastX = xy.at(-1)?.x ?? 0
  const ticks = [...new Set([mx - 0.2, (mx + mn) / 2, mn + 0.2].map((v) => Math.round(v * 2) / 2))]

  useEffect(() => {
    draw.value = 0
    draw.value = withTiming(1, { duration: 900, easing: Easing.bezier(0.3, 0.7, 0.2, 1) })
  }, [line, draw])

  const trendProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }))

  // Picks the weigh-in nearest the finger.
  function scrub(e: GestureResponderEvent) {
    const x = e.nativeEvent.locationX
    let best = points[0]
    for (const p of points) if (best && Math.abs(X(p.localDate) - x) < Math.abs(X(best.localDate) - x)) best = p
    if (!best) return
    setActive(best)
    onScrub(best)
  }

  // Clears the scrub marker and tip.
  function release() {
    setActive(null)
    onScrub(null)
  }

  return (
    <View
      style={{ height: HEIGHT, marginTop: 14 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={scrub}
      onResponderMove={scrub}
      onResponderRelease={release}
      onResponderTerminate={release}
      accessibilityRole="image"
      accessibilityLabel={`Weight chart, ${points.length} weigh-ins`}
    >
      {width > 0 ? (
        // The wrapper takes the touches, so locationX is measured against it and not an SVG child.
        <View style={{ pointerEvents: 'none' }}>
          <Svg width={width} height={HEIGHT}>
            {ticks.map((tick) => (
              <Line key={`l${tick}`} x1={0} x2={width} y1={Y(tick)} y2={Y(tick)} stroke={t.c.line} strokeWidth={1} />
            ))}
            {ticks.map((tick) => (
              <SvgText key={`t${tick}`} x={width - 6} y={Y(tick) - 4} textAnchor="end" fontSize={10.5} fill={t.c.ink3}>
                {weightNumber(tick, units)}
              </SvgText>
            ))}
            {xy.length > 1 ? <Path d={`${line}L${lastX},150L${firstX},150Z`} fill={t.c.polo} opacity={0.06} /> : null}
            {points.map((p) => (
              <Circle key={p.localDate} cx={X(p.localDate)} cy={Y(p.kg)} r={2.6} fill={t.c.ink3} opacity={0.55} />
            ))}
            {xy.length > 1 ? (
              <AnimatedPath
                d={line}
                fill="none"
                stroke={t.c.polo}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={[length, length]}
                animatedProps={trendProps}
              />
            ) : null}
            {active ? (
              <>
                <Line x1={X(active.localDate)} x2={X(active.localDate)} y1={0} y2={150} stroke={t.c.ink} strokeWidth={1} opacity={0.35} />
                <Circle cx={X(active.localDate)} cy={Y(active.trendKg)} r={4.5} fill={t.c.bg} stroke={t.c.polo} strokeWidth={2.5} />
              </>
            ) : null}
          </Svg>
        </View>
      ) : null}
    </View>
  )
}
