import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { layout, motion, radii } from '@stride/ui-tokens'
import { font, themedStyles, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Polo } from './Polo'
import { Tap } from './Tap'

const TAB_ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'today', label: 'Today' },
  log: { icon: 'log', label: 'Log history' },
  progress: { icon: 'progress', label: 'Progress' },
  coach: { icon: 'coach', label: 'Coach' },
}

const PERCH_OFFSET = layout.dockPadding + (layout.dockButton - layout.perchSize) / 2

// Polo sleeps on the dock late at night, matching the night Today screen.
function isNight(now: Date): boolean {
  const h = now.getHours()
  return h >= 22 || h < 5
}

// One dock tab: icon brightens when active.
function DockTab({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  const t = useTheme()
  const s = useStyles()
  const lit = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    lit.value = withTiming(active ? 1 : 0, { duration: motion.duration.color })
  }, [active, lit])
  const iconStyle = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * lit.value }))

  return (
    <Tap
      onPress={onPress}
      style={s.tab}
      scale={motion.press.iconScale}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={iconStyle}>
        <Icon name={icon} color={t.c.dockInk} />
      </Animated.View>
    </Tap>
  )
}

// The v5 dock: four tabs with a springy pill, Polo perched above the active tab, and the input bar stub.
export function Dock({ state, navigation }: BottomTabBarProps) {
  const t = useTheme()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const index = state.index
  const [hops, setHops] = useState(0)
  const [night] = useState(() => isNight(new Date()))

  const pill = useSharedValue(index * layout.dockButton)
  const perch = useSharedValue(index * layout.dockButton + PERCH_OFFSET)

  useEffect(() => {
    pill.value = withSpring(index * layout.dockButton, motion.spring.bouncy)
    perch.value = withSpring(index * layout.dockButton + PERCH_OFFSET, motion.spring.bouncy)
    setHops((n) => n + 1)
  }, [index, pill, perch])

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pill.value }] }))
  const perchStyle = useAnimatedStyle(() => ({ transform: [{ translateX: perch.value }] }))

  return (
    <View style={[s.wrap, { bottom: Math.max(layout.dockInsetBottom, insets.bottom + 8) }]}>
      <Animated.View style={[s.perch, perchStyle]}>
        <Polo size={layout.perchSize} mood={night ? 'sleep' : 'idle'} hop={hops} />
      </Animated.View>
      <View style={s.dock}>
        <View style={s.nav} accessibilityRole="tablist">
          <Animated.View style={[s.pill, pillStyle]} />
          {state.routes.map((route, i) => {
            const meta = TAB_ICONS[route.name]
            if (!meta) return null
            const active = i === index
            return (
              <DockTab
                key={route.key}
                icon={meta.icon}
                label={meta.label}
                active={active}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                  if (!active && !event.defaultPrevented) navigation.navigate(route.name, route.params)
                }}
              />
            )
          })}
        </View>
        <Tap style={s.field} scale={motion.press.rowScale} accessibilityRole="button" accessibilityLabel="Log anything">
          <Text style={s.placeholder} numberOfLines={1}>
            Log anything
          </Text>
          <Pressable style={s.mic} accessibilityRole="button" accessibilityLabel="Voice">
            <Icon name="mic" color={t.c.dockInk} />
          </Pressable>
        </Tap>
      </View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  wrap: { position: 'absolute', left: layout.dockInsetX, right: layout.dockInsetX, pointerEvents: 'box-none' },
  perch: {
    position: 'absolute',
    left: 0,
    bottom: layout.perchLift,
    width: layout.perchSize,
    height: layout.perchSize,
    pointerEvents: 'none',
  },
  dock: {
    height: layout.dockHeight,
    borderRadius: radii.dock,
    backgroundColor: t.c.dock,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.dockPadding,
    gap: 2,
    boxShadow: t.shadow.dock,
  },
  nav: { flexDirection: 'row', width: layout.dockButton * 4 },
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: layout.dockButton,
    height: layout.dockButtonHeight,
    borderRadius: radii.field,
    backgroundColor: t.c.dockIndicator,
  },
  tab: { width: layout.dockButton, height: layout.dockButtonHeight, alignItems: 'center', justifyContent: 'center' },
  field: {
    flex: 1,
    minWidth: 0,
    height: layout.dockButtonHeight,
    borderRadius: radii.field,
    backgroundColor: t.c.dockField,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    gap: 4,
  },
  placeholder: { ...font('input'), flex: 1, color: t.c.dock3 },
  mic: { width: 36, height: 36, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
}))
