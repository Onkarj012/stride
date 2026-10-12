import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import { layout, motion, radii } from '@stride/ui-tokens'
import { font, themedStyles, useTheme } from '@/theme'
import { Tap } from './Tap'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const RING = 2 * Math.PI * 9
/** How long the undo stays offered after a change (D7). */
export const UNDO_MS = 10_000
const PLAIN_MS = 2600

export type ToastMessage = {
  id: number
  title: string
  sub?: string
  undo?: () => void
}

// The dark toast above the dock. With an undo it shows a 10 s ring; without one it leaves after a moment.
export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: (id: number) => void }) {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const [shown, setShown] = useState<ToastMessage | null>(message)
  const lift = useSharedValue(0)

  useEffect(() => {
    if (message) {
      setShown(message)
      lift.value = 0
      lift.value = withSpring(1, motion.spring.bouncy)
      const timer = setTimeout(() => onDone(message.id), message.undo ? UNDO_MS : PLAIN_MS)
      return () => clearTimeout(timer)
    }
    lift.value = withTiming(0, { duration: 220 })
    return undefined
  }, [message, lift, onDone])

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, lift.value * 1.6),
    transform: [{ translateY: (1 - lift.value) * 24 }, { scale: 0.96 + 0.04 * lift.value }],
  }))

  if (!shown) return null
  const dockBottom = Math.max(layout.dockInsetBottom, insets.bottom + 8)

  return (
    <Animated.View
      style={[s.toast, { bottom: dockBottom + layout.dockHeight + 14, pointerEvents: message ? 'auto' : 'none' }, style]}
      accessibilityLiveRegion="polite"
    >
      <View style={s.text}>
        <Text style={s.title}>{shown.title}</Text>
        {shown.sub ? <Text style={s.sub}>{shown.sub}</Text> : null}
      </View>
      {shown.undo ? (
        <Tap
          key={shown.id}
          style={s.undo}
          scale={motion.press.iconScale}
          onPress={() => {
            const undo = shown.undo
            onDone(shown.id)
            undo?.()
          }}
          accessibilityRole="button"
          accessibilityLabel="Undo"
        >
          <Countdown />
          <Text style={s.undoText}>Undo</Text>
        </Tap>
      ) : null}
    </Animated.View>
  )
}

// Coral ring that empties over the undo window.
function Countdown() {
  const t = useTheme()
  const left = useSharedValue(0)
  useEffect(() => {
    left.value = withTiming(RING, { duration: UNDO_MS, easing: Easing.linear })
  }, [left])
  const props = useAnimatedProps(() => ({ strokeDashoffset: left.value }))
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={11} cy={11} r={9} stroke={t.c.bg} strokeOpacity={0.25} strokeWidth={2.5} fill="none" />
      <AnimatedCircle
        cx={11}
        cy={11}
        r={9}
        stroke={t.c.polo}
        strokeWidth={2.5}
        fill="none"
        strokeDasharray={RING}
        animatedProps={props}
      />
    </Svg>
  )
}

const useStyles = themedStyles((t) => ({
  toast: {
    position: 'absolute',
    left: layout.screenX,
    right: layout.screenX,
    backgroundColor: t.c.ink,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: t.shadow.toast,
  },
  text: { flex: 1 },
  title: { ...font('callout'), lineHeight: 18, color: t.c.bg },
  sub: { ...font('caption'), fontSize: 12, color: t.c.bg, opacity: 0.6, marginTop: 2 },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: radii.pill,
    backgroundColor: t.c.toastUndo,
  },
  undoText: { ...font('calloutStrong'), color: t.c.bg },
}))
