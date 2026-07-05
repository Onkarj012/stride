import { Pressable } from 'react-native'
import { Icon, type IconName } from '../Icon'
import { useTheme, TAP_MIN } from '../theme'

type Variant = 'card' | 'ghost'

interface IconButtonProps {
  icon: IconName
  onPress: () => void
  size?: number
  variant?: Variant
  iconSize?: number
  iconColor?: string
  marginLeft?: number
}

export function IconButton({
  icon,
  onPress,
  size = 36,
  variant = 'card',
  iconSize,
  iconColor,
  marginLeft,
}: IconButtonProps) {
  const t = useTheme()
  const bg = variant === 'card' ? t.card : 'transparent'
  const shadow = variant === 'card' ? t.cardShadow : {}
  const ic = iconColor ?? t.textMuted
  const is = iconSize ?? Math.round(size * 0.5)

  return (
    <Pressable
      onPress={onPress}
      hitSlop={Math.max(0, (TAP_MIN - size) / 2)}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        ...shadow,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
        ...(marginLeft !== undefined && { marginLeft }),
      })}
    >
      <Icon name={icon} size={is} color={ic} />
    </Pressable>
  )
}
