import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated'
import { useTheme } from '../theme'

interface ProgressBarProps {
  value: number
  color: string
  height?: number
  animated?: boolean
}

export function ProgressBar({ value, color, height = 6, animated: doAnimate = true }: ProgressBarProps) {
  const t = useTheme()
  const progress = useSharedValue(doAnimate ? 0 : value)

  useEffect(() => {
    if (doAnimate) {
      progress.value = withSpring(Math.min(Math.max(value, 0), 1), { stiffness: 120, damping: 20 })
    } else {
      progress.value = Math.min(Math.max(value, 0), 1)
    }
  }, [value])

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }))

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.dimBgMid, overflow: 'hidden' }}>
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: height / 2, backgroundColor: color },
          // @ts-ignore
          { transformOrigin: 'left' },
          barStyle,
        ]}
      />
    </View>
  )
}
