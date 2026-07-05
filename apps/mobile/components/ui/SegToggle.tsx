import { Pressable, Text, View } from 'react-native'
import { useTheme, SPACE, RADIUS } from '../theme'
import * as Haptics from '../../lib/haptics'

interface SegOption<T extends string> {
  id: T
  label: string
}

interface SegToggleProps<T extends string> {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
}

export function SegToggle<T extends string>({ value, options, onChange }: SegToggleProps<T>) {
  const t = useTheme()
  return (
    <View style={[
      { flexDirection: 'row', backgroundColor: t.card, borderRadius: RADIUS.md, padding: SPACE.xs },
      t.cardShadow,
    ]}>
      {options.map(o => (
        <Pressable
          key={o.id}
          onPress={() => { Haptics.selectionAsync(); onChange(o.id) }}
          style={{
            flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, alignItems: 'center',
            backgroundColor: value === o.id ? t.buttonPrimaryBg : 'transparent',
          }}
        >
          <Text style={{
            fontFamily: 'Manrope_700Bold',
            fontSize: 13,
            color: value === o.id ? t.buttonPrimaryText : t.textMuted,
          }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
