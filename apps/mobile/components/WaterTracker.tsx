import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTheme, SKY } from './theme'
import { AppText, ProgressBar } from './ui'

interface WaterTrackerProps {
  initial?: number
  target?: number
  unit?: 'ml' | 'oz'
}

export function WaterTracker({ initial = 1200, target = 2500, unit = 'ml' }: WaterTrackerProps) {
  const [current, setCurrent] = useState(initial)
  const t = useTheme()
  const step = unit === 'ml' ? 250 : 8
  const pct = Math.min(current / target, 1)

  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 20 }, t.cardShadow]}>
      <AppText variant="overline" style={{ marginBottom: 16 }}>Water intake</AppText>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <AppText variant="hero" style={{ fontSize: 34, letterSpacing: -1 }}>{current.toLocaleString()}</AppText>
            <AppText variant="label" color={t.textMuted} style={{ fontSize: 16 }}>{unit}</AppText>
          </View>
          <AppText variant="small" color={t.textSubtle} style={{ marginTop: 4 }}>
            of {target.toLocaleString()} {unit} goal
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
          <Pressable
            onPress={() => setCurrent(c => Math.max(0, c - step))}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: t.dimBgMid,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AppText variant="h2" color={t.text} style={{ lineHeight: 28 }}>−</AppText>
          </Pressable>
          <Pressable
            onPress={() => setCurrent(c => Math.min(target, c + step))}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: SKY,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AppText variant="h2" color={t.text} style={{ fontSize: 22, lineHeight: 28 }}>+</AppText>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 20 }}>
        <ProgressBar value={pct} color={SKY} height={10} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <AppText variant="caption" color={t.textSubtle} style={{ fontFamily: 'Manrope_700Bold', fontSize: 11 }}>0</AppText>
        <AppText variant="caption" color={SKY} style={{ fontFamily: 'Manrope_700Bold', fontSize: 11 }}>{Math.round(pct * 100)}%</AppText>
        <AppText variant="caption" color={t.textSubtle} style={{ fontFamily: 'Manrope_700Bold', fontSize: 11 }}>{target.toLocaleString()}</AppText>
      </View>
    </View>
  )
}
