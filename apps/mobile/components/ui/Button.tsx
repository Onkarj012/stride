import { Pressable, Text, View } from 'react-native'
import { Icon, type IconName } from '../Icon'
import { useTheme, TAP_MIN, SPACE, RADIUS } from '../theme'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'sm'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  icon?: IconName
  iconPosition?: 'left' | 'right'
  disabled?: boolean
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
}: ButtonProps) {
  const t = useTheme()

  const bg = variant === 'primary'
    ? t.buttonPrimaryBg
    : variant === 'secondary'
    ? t.buttonSecondaryBg
    : 'transparent'

  const textColor = variant === 'primary'
    ? t.buttonPrimaryText
    : variant === 'secondary'
    ? t.buttonSecondaryText
    : t.buttonGhostText

  const iconColor = textColor
  const py = size === 'sm' ? SPACE.sm : SPACE.md
  const fontSize = size === 'sm' ? 13 : 15

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE.sm,
        minHeight: TAP_MIN,
        paddingHorizontal: SPACE.lg,
        paddingVertical: py,
        borderRadius: RADIUS.md,
        backgroundColor: bg,
        opacity: disabled ? 0.4 : pressed ? 0.82 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}
    >
      {icon && iconPosition === 'left' && (
        <Icon name={icon} size={size === 'sm' ? 16 : 18} color={iconColor} sw={2.4} />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontFamily: 'Manrope_800ExtraBold',
          fontSize,
          color: textColor,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      {icon && iconPosition === 'right' && (
        <Icon name={icon} size={size === 'sm' ? 16 : 18} color={iconColor} sw={2.4} />
      )}
    </Pressable>
  )
}
