import { memo, useEffect, useMemo, useRef, useState } from 'react'
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
const BASE = 150

export type WeightPoint = { localDate: string; kg: number; trendKg: number }

type WeightChartProps = {
  points: WeightPoint[]
  from: string
  to: string
  units: Units
  // Called with the weigh-in under the finger while scrubbing, and null when the finger lifts.
  onScrub: (point: WeightPoint | null) => void
}

type Spot = { x: number; y: number }
type Pin = Spot & { date: string }

type Plot = {
  dots: Pin[]
  trend: Pin[]
  line: string
  fill: string
  length: number
  ticks: { value: number; y: number }[]
}

// Lays out every weigh-in once, so scrubbing compares numbers and never parses dates.
function layoutPlot(points: WeightPoint[], from: string, to: string, width: number): Plot {
  const span = Math.max(1, daysBetween(from, to))
  const values = points.flatMap((p) => [p.kg, p.trendKg])
  const mn = Math.floor(Math.min(...values) * 2) / 2 - 0.2
  const mx = Math.ceil(Math.max(...values) * 2) / 2 + 0.2
  const x = (date: string) => EDGE + (daysBetween(from, date) / span) * Math.max(0, width - EDGE * 2)
  const y = (kg: number) => TOP + ((mx - kg) / (mx - mn)) * PLOT

  const dots = points.map((p) => ({ date: p.localDate, x: x(p.localDate), y: y(p.kg) }))
  const trend = points.map((p) => ({ date: p.localDate, x: x(p.localDate), y: y(p.trendKg) }))
  const line = trend.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
  const length = trend.reduce((sum, p, i) => {
    const prev = trend[i - 1]
    return prev ? sum + Math.hypot(p.x - prev.x, p.y - prev.y) : sum
  }, 0)
  const firstX = trend[0]?.x ?? 0
  const lastX = trend.at(-1)?.x ?? 0
  const ticks = [...new Set([mx - 0.2, (mx + mn) / 2, mn + 0.2].map((v) => Math.round(v * 2) / 2))].map((value) => ({ value, y: y(value) }))

  return { dots, trend, line, fill: `${line}L${lastX},${BASE}L${firstX},${BASE}Z`, length, ticks }
}

// Index of the point whose x is closest to the finger, or -1 when there are none.
function nearest(spots: Spot[], x: number): number {
  let best = -1
  let gap = Infinity
  spots.forEach((s, i) => {
    const d = Math.abs(s.x - x)
    if (d < gap) {
      gap = d
      best = i
    }
  })
  return best
}

type StaticPlotProps = {
  plot: Plot
  width: number
  units: Units
  grid: string
  muted: string
  trendColor: string
}

// Gridlines, labels, dots, fill and the trend line that draws in. Memoized so scrubbing never redraws it.
const StaticPlot = memo(function StaticPlot({ plot, width, units, grid, muted, trendColor }: StaticPlotProps) {
  const draw = useSharedValue(0)
  const length = plot.length
  const trendProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }))

  useEffect(() => {
    draw.value = 0
    draw.value = withTiming(1, { duration: 900, easing: Easing.bezier(0.3, 0.7, 0.2, 1) })
  }, [plot.line, draw])

  return (
    <Svg width={width} height={HEIGHT}>
      {plot.ticks.map(({ value, y }) => (
        <Line key={`l${value}`} x1={0} x2={width} y1={y} y2={y} stroke={grid} strokeWidth={1} />
      ))}
      {plot.ticks.map(({ value, y }) => (
        <SvgText key={`t${value}`} x={width - 6} y={y - 4} textAnchor="end" fontSize={10.5} fill={muted}>
          {weightNumber(value, units)}
        </SvgText>
      ))}
      {plot.trend.length > 1 ? <Path d={plot.fill} fill={trendColor} opacity={0.06} /> : null}
      {plot.dots.map((p) => (
        <Circle key={p.date} cx={p.x} cy={p.y} r={2.6} fill={muted} opacity={0.55} />
      ))}
      {plot.trend.length > 1 ? (
        <AnimatedPath
          d={plot.line}
          fill="none"
          stroke={trendColor}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[length, length]}
          animatedProps={trendProps}
        />
      ) : null}
    </Svg>
  )
})

// The guide line and ring on the weigh-in under the finger. Only this part re-renders while scrubbing.
function ScrubMarker({ width, spot, ink, trendColor, bg }: { width: number; spot: Spot; ink: string; trendColor: string; bg: string }) {
  return (
    <Svg width={width} height={HEIGHT} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Line x1={spot.x} x2={spot.x} y1={0} y2={BASE} stroke={ink} strokeWidth={1} opacity={0.35} />
      <Circle cx={spot.x} cy={spot.y} r={4.5} fill={bg} stroke={trendColor} strokeWidth={2.5} />
    </Svg>
  )
}

// Weigh-ins as dots and the EMA trend as a coral line that draws in, laid out by date so gaps show (mock #/progress).
export function WeightChart({ points, from, to, units, onScrub }: WeightChartProps) {
  const t = useTheme()
  const [width, setWidth] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)
  // Date of the weigh-in last sent to onScrub, so moves within the same point stay silent.
  const reported = useRef<string | null>(null)
  const plot = useMemo(() => layoutPlot(points, from, to, width), [points, from, to, width])

  // Picks the weigh-in nearest the finger and reports it only when it changes.
  function scrub(e: GestureResponderEvent) {
    const i = nearest(plot.trend, e.nativeEvent.locationX)
    const best = points[i]
    const pin = plot.trend[i]
    if (!best || !pin || best.localDate === reported.current) return
    reported.current = best.localDate
    setSpot(pin)
    onScrub(best)
  }

  // Clears the scrub marker and tip.
  function release() {
    if (reported.current === null) return
    reported.current = null
    setSpot(null)
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
          <StaticPlot plot={plot} width={width} units={units} grid={t.c.line} muted={t.c.ink3} trendColor={t.c.polo} />
          {spot ? <ScrubMarker width={width} spot={spot} ink={t.c.ink} trendColor={t.c.polo} bg={t.c.bg} /> : null}
        </View>
      ) : null}
    </View>
  )
}
