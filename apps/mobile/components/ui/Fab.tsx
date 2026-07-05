import { Pressable } from 'react-native'
import { Icon, type IconName } from '../Icon'
import { useTheme } from '../theme'

interface FabProps {
  icon: IconName
  onPress: () => void
  bottom?: number
  right?: number
}

export function Fab({ icon, onPress, bottom = 24, right = 20 }: FabProps) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        position: 'absolute',
        right,
        bottom,
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: t.fabBg,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: t.fabBg,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
        transform: [{ scale: pressed ? 0.9 : 1 }],
      })}
    >
      <Icon name={icon} size={26} color={t.fabIcon} sw={2.6} />
    </Pressable>
  )
}
