import type { ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { motion } from '@stride/ui-tokens'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type TapProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  scale?: number
}

// Pressable that springs down while held and bounces back on release, like the mock's :active states.
export function Tap({ children, style, scale = motion.press.scale, onPressIn, onPressOut, ...rest }: TapProps) {
  const pressed = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }))

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        pressed.value = withSpring(scale, motion.spring.bouncy)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(1, motion.spring.bouncy)
        onPressOut?.(e)
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  )
}
