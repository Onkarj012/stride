import { Pressable, View, Text } from 'react-native'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import { IconBadge } from './IconBadge'
import { useTheme, TAP_MIN, SPACE } from '../theme'

interface ListRowProps {
  icon: IconName
  label: string
  subtitle?: string
  value?: string
  right?: ReactNode
  onPress?: () => void
  iconBg?: string
  iconColor?: string
  showChevron?: boolean
  noBorder?: boolean
}

export function ListRow({
  icon,
  label,
  subtitle,
  value,
  right,
  onPress,
  iconBg,
  iconColor,
  showChevron,
  noBorder = false,
}: ListRowProps) {
  const t = useTheme()
  const chevron = showChevron ?? !!onPress

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: TAP_MIN,
        borderBottomWidth: noBorder ? 0 : 1,
        borderBottomColor: t.border,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        flex: 1,
        paddingVertical: SPACE.sm,
      }}>
        <IconBadge icon={icon} bg={iconBg} color={iconColor} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: 'Manrope_700Bold', fontSize: 14, color: t.text }}>
            {label}
          </Text>
          {subtitle && (
            <Text numberOfLines={1} style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: t.textSubtle, marginTop: 1 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
        {value && (
          <Text numberOfLines={1} style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: t.textMuted }}>
            {value}
          </Text>
        )}
        {chevron && <Icon name="chevronRight" size={16} color={t.textSubtle} sw={2} />}
      </View>
    </Pressable>
  )
}
