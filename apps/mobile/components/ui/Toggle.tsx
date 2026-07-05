import { Pressable } from 'react-native'
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated'
import { useTheme, LAVENDER } from '../theme'

interface ToggleProps {
  value: boolean
  onChange: (next: boolean) => void
  onColor?: string
}

export function Toggle({ value, onChange, onColor = LAVENDER }: ToggleProps) {
  const t = useTheme()
  const tx = useSharedValue(value ? 20 : 0)
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }))

  function handlePress() {
    const next = !value
    tx.value = withSpring(next ? 20 : 0, { stiffness: 260, damping: 28 })
    onChange(next)
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={{
        width: 44, height: 24, borderRadius: 12, padding: 2,
        backgroundColor: value ? onColor : t.dimBgMid,
        justifyContent: 'center',
      }}
    >
      <Animated.View style={[{
        width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
      }, knobStyle]} />
    </Pressable>
  )
}
