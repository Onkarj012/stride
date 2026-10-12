import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BackHandler, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { motion, radii } from '@stride/ui-tokens'
import { themedStyles } from '@/theme'

const CLOSE_DRAG = 70

type SheetProps = {
  open: boolean
  onClose: () => void
  // Runs once the close animation finishes, so callers can reset what the sheet showed.
  onClosed?: () => void
  children: ReactNode
}

// v5 bottom sheet: scrim, grab handle with swipe-down to close, spring in and out, lifts above the keyboard.
export function Sheet({ open, onClose, onClosed, children }: SheetProps) {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [mounted, setMounted] = useState(open)
  const y = useSharedValue(height)
  const drag = useSharedValue(0)
  const scrim = useSharedValue(0)
  const keyboard = useAnimatedKeyboard()

  if (open && !mounted) setMounted(true)

  useEffect(() => {
    if (!mounted) return
    if (open) {
      drag.value = 0
      y.value = withSpring(0, motion.spring.smooth)
      scrim.value = withTiming(1, { duration: 300 })
      return
    }
    scrim.value = withTiming(0, { duration: 250 })
    y.value = withSpring(height, { ...motion.spring.smooth, overshootClamping: true }, (finished) => {
      if (finished) scheduleOnRN(finishClose)
    })
  }, [open, mounted, height])

  // Unmounts the sheet once it has slid away.
  function finishClose() {
    setMounted(false)
    onClosed?.()
  }

  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [open, onClose])

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
        onPanResponderMove: (_, g) => {
          drag.value = Math.max(0, g.dy)
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DRAG || g.vy > 0.9) onClose()
          else drag.value = withSpring(0, motion.spring.bouncy)
        },
      }),
    [drag, onClose],
  )

  // Shrinks the sheet while the keyboard is up so its header stays on screen.
  const sheetStyle = useAnimatedStyle(() => ({
    maxHeight: Math.max(height * 0.4, height * 0.88 - keyboard.height.value),
    transform: [{ translateY: y.value + drag.value - keyboard.height.value }],
  }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }))

  if (!mounted) return null

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: open ? 'auto' : 'none' }]}>
      <Animated.View style={[s.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[s.sheet, sheetStyle]}>
        <View {...pan.panHandlers} style={s.grabZone}>
          <View style={s.grab} />
        </View>
        <ScrollView
          contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.c.bg,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    boxShadow: t.shadow.sheet,
  },
  grabZone: { paddingTop: 10, paddingBottom: 8, alignItems: 'center' },
  grab: { width: 38, height: 5, borderRadius: 5, backgroundColor: t.c.line2 },
  body: { paddingHorizontal: 20, paddingTop: 6 },
}))
