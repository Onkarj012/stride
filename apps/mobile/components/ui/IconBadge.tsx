import { View } from 'react-native'
import { Icon, type IconName } from '../Icon'
import { useTheme, TAP_MIN } from '../theme'

interface IconBadgeProps {
  icon: IconName
  size?: number
  bg?: string
  color?: string
  badgeSize?: number
}

export function IconBadge({ icon, size = 18, bg, color, badgeSize = 34 }: IconBadgeProps) {
  const t = useTheme()
  return (
    <View style={{
      width: badgeSize,
      height: badgeSize,
      borderRadius: badgeSize / 2,
      backgroundColor: bg ?? t.iconBadgeBg,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Icon name={icon} size={size} color={color ?? t.iconBadgeIcon} />
    </View>
  )
}
