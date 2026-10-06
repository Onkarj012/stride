import { useEffect, useId, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Ellipse, G, Mask, Path, Rect } from 'react-native-svg'
import { motion } from '@stride/ui-tokens'
import { font, useTheme } from '@/theme'

export type PoloMood = 'idle' | 'happy' | 'sleep' | 'wow'

const BODY =
  'M32 8.5c3.2 0 5.4-2.6 8.2-2.2 2.6.4 3 3.4 1.3 5.2 9.6 3.4 16 12.4 16 23.2 0 14-11 24.3-25.5 24.3S6.5 48.7 6.5 34.7C6.5 20.3 17.6 8.5 32 8.5z'

const ease = Easing.inOut(Easing.quad)
const { hop: HOP_MS } = motion.mascot

// Eye shapes cut out of the body for each mood; blink squashes the open eyes.
function Eyes({ mood, blink }: { mood: PoloMood; blink: boolean }) {
  if (mood === 'happy')
    return (
      <G fill="none" stroke="#000" strokeWidth={3.4} strokeLinecap="round">
        <Path d="M20.5 34.5q4-5.5 8 0" />
        <Path d="M35.5 34.5q4-5.5 8 0" />
      </G>
    )
  if (mood === 'sleep')
    return (
      <G fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round">
        <Path d="M21 34q3.5 2.6 7 0" />
        <Path d="M36 34q3.5 2.6 7 0" />
      </G>
    )
  if (mood === 'wow')
    return (
      <G fill="#000">
        <Circle cx={24.5} cy={32.5} r={5.2} />
        <Circle cx={39.5} cy={32.5} r={5.2} />
      </G>
    )
  const ry = blink ? 0.5 : 5
  return (
    <G fill="#000">
      <Ellipse cx={24.5} cy={33} rx={3.6} ry={ry} />
      <Ellipse cx={39.5} cy={33} rx={3.6} ry={ry} />
    </G>
  )
}

// Blinks the open eyes now and then while idle, like the mock.
function useBlink(active: boolean): boolean {
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!active) return
    let reopen: ReturnType<typeof setTimeout> | undefined
    const timer = setInterval(() => {
      if (Math.random() >= motion.mascot.blinkChance) return
      setClosed(true)
      reopen = setTimeout(() => setClosed(false), motion.mascot.blink)
    }, motion.mascot.blinkEvery)
    return () => {
      clearInterval(timer)
      if (reopen) clearTimeout(reopen)
      setClosed(false)
    }
  }, [active])
  return active && closed
}

type PoloProps = {
  size: number
  mood?: PoloMood
  // Change this number to make Polo hop once.
  hop?: number
}

// Polo, the flat coral mascot: breathes while idle, sleeps with a drifting z, hops on cue.
export function Polo({ size, mood = 'idle', hop = 0 }: PoloProps) {
  const t = useTheme()
  const maskId = `polo${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const blink = useBlink(mood === 'idle')

  const breath = useSharedValue(0)
  const jump = useSharedValue(0)
  const zz = useSharedValue(0)

  useEffect(() => {
    const half = (mood === 'sleep' ? motion.mascot.sleepBreathe : motion.mascot.breathe) / 2
    breath.value = 0
    breath.value = withRepeat(withTiming(1, { duration: half, easing: Easing.inOut(Easing.sin) }), -1, true)
    zz.value = 0
    if (mood === 'sleep') zz.value = withRepeat(withTiming(1, { duration: motion.mascot.zz, easing: ease }), -1)
    return () => {
      cancelAnimation(breath)
      cancelAnimation(zz)
    }
  }, [mood, breath, zz])

  useEffect(() => {
    if (hop === 0) return
    const step = (to: number, share: number) => withTiming(to, { duration: HOP_MS * share, easing: ease })
    jump.value = 0
    jump.value = withSequence(step(0.18, 0.18), step(0.48, 0.3), step(0.72, 0.24), step(0.86, 0.14), step(1, 0.14))
  }, [hop, jump])

  const hopStyle = useAnimatedStyle(() => {
    const p = jump.value
    const stops = [0, 0.18, 0.48, 0.72, 0.86, 1]
    return {
      transform: [
        { translateY: interpolate(p, stops, [0, 2, -16, 0, 0, 0]) * (size / 40) },
        { scaleX: interpolate(p, stops, [1, 1.12, 0.92, 1.1, 0.97, 1]) },
        { scaleY: interpolate(p, stops, [1, 0.86, 1.1, 0.9, 1.03, 1]) },
      ],
    }
  })

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 + 0.035 * breath.value }, { scaleY: 1 - 0.025 * breath.value }],
  }))

  const zzStyle = useAnimatedStyle(() => ({
    opacity: interpolate(zz.value, [0, 0.3, 1], [0, 1, 0]),
    transform: [
      { translateX: interpolate(zz.value, [0, 1], [0, 8]) },
      { translateY: interpolate(zz.value, [0, 1], [4, -12]) },
    ],
  }))

  return (
    <Animated.View style={[{ width: size, height: size }, hopStyle]} accessibilityLabel="Polo" accessible>
      <Animated.View style={[StyleSheet.absoluteFill, styles.body, breathStyle]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <Mask id={maskId} maskUnits="userSpaceOnUse" x={-10} y={-10} width={84} height={84}>
              <Rect x={-10} y={-10} width={84} height={84} fill="#fff" />
              <Eyes mood={mood} blink={blink} />
            </Mask>
          </Defs>
          <Path d={BODY} fill={t.c.polo} mask={`url(#${maskId})`} />
        </Svg>
      </Animated.View>
      {mood === 'sleep' ? (
        <View style={styles.zzWrap}>
          <Animated.Text style={[styles.zz, { color: t.c.ink3 }, zzStyle]}>z</Animated.Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  body: { transformOrigin: '50% 92%' },
  zzWrap: { position: 'absolute', right: -6, top: -8, pointerEvents: 'none' },
  zz: { ...font('avatar'), fontSize: 11, lineHeight: 11 },
})
