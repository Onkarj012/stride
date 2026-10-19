import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { motion, radii } from '@stride/ui-tokens'
import {
  MAX_THALI_FOODS,
  THALI_ITEMS,
  THALI_PRESETS,
  thaliQuantity,
  thaliText,
  type ThaliCounts,
  type ThaliGroup,
  type ThaliItem,
} from '@/lib/thali'
import { font, themedStyles, useTheme } from '@/theme'
import { Button } from './Controls'
import { Tap } from './Tap'

const GROUPS: ThaliGroup[] = ['Breads', 'Rice', 'Dal', 'Sabzi', 'Sides']

// Plate builder: presets fill the counts, chips add a step, a long press takes one back, and the sentence goes to onLog.
export function ThaliPicker({ onLog, onCancel }: { onLog: (text: string) => void; onCancel: () => void }) {
  const t = useTheme()
  const s = useStyles()
  const [counts, setCounts] = useState<ThaliCounts>({})
  // Set when a tap would add a food past the extraction limit; cleared by any other change.
  const [full, setFull] = useState(false)
  const text = thaliText(counts)

  // Adds one step to an item, or takes one away and stops at zero. A new food is refused once the plate is full.
  function bump(item: ThaliItem, direction: 1 | -1) {
    const foods = Object.values(counts).filter((n) => n > 0).length
    if (direction === 1 && (counts[item.id] ?? 0) === 0 && foods >= MAX_THALI_FOODS) {
      setFull(true)
      return
    }
    setFull(false)
    setCounts((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) + direction * item.step) }))
  }

  // Replaces the plate with a preset.
  function applyPreset(next: ThaliCounts) {
    setFull(false)
    setCounts(next)
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presets}>
        {THALI_PRESETS.map((preset) => (
          <Tap
            key={preset.name}
            style={s.chip}
            scale={motion.press.cardScale}
            onPress={() => applyPreset(preset.counts)}
            accessibilityRole="button"
            accessibilityLabel={`Preset ${preset.name}`}
          >
            <Text style={s.chipText}>{preset.name}</Text>
          </Tap>
        ))}
      </ScrollView>

      {GROUPS.map((group) => (
        <View key={group}>
          <Text style={s.chipsLabel}>{group}</Text>
          <Animated.View layout={LinearTransition.springify()} style={s.chips}>
            {THALI_ITEMS.filter((item) => item.group === group).map((item) => {
              const n = counts[item.id] ?? 0
              const on = n > 0
              const badge = item.unit === 'piece' ? `×${thaliQuantity(item, n)}` : thaliQuantity(item, n)
              return (
                <Tap
                  key={item.id}
                  style={[s.chip, on && s.chipOn]}
                  scale={motion.press.cardScale}
                  onPress={() => bump(item, 1)}
                  onLongPress={() => bump(item, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name[0].toUpperCase()}${item.name.slice(1)}, ${n}`}
                >
                  <Text style={[s.chipText, { color: on ? t.c.bg : t.c.ink }]}>{item.name}</Text>
                  {on ? <Text style={[s.badge, { color: t.c.bg }]}>{badge}</Text> : null}
                </Tap>
              )
            })}
          </Animated.View>
        </View>
      ))}

      <View style={s.preview}>
        {text ? <Text style={s.previewText}>{text}</Text> : <Text style={s.previewEmpty}>Tap what's on your plate.</Text>}
        {full ? <Text style={s.previewCap}>That's the most I can log at once. Log this plate, then add the rest.</Text> : null}
      </View>
      <View style={s.row}>
        <Button label="Back" variant="ghost" onPress={onCancel} />
        <Button label="Log thali" variant="coral" icon="up" iconAfter disabled={!text} onPress={() => onLog(text)} style={s.grow} />
      </View>
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  grow: { flex: 1 },
  presets: { flexDirection: 'row', gap: 8, marginTop: 16, paddingRight: 4 },
  chipsLabel: { ...font('label'), color: t.c.ink3, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  chipOn: { backgroundColor: t.c.ink },
  chipText: { ...font('secondary'), fontFamily: font('bodyStrong').fontFamily, color: t.c.ink },
  badge: { ...font('caption'), fontFamily: font('bodyStrong').fontFamily },
  preview: {
    marginTop: 20,
    padding: 16,
    minHeight: 64,
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  previewText: { ...font('bodyStrong'), lineHeight: 22, color: t.c.ink },
  previewEmpty: { ...font('caption'), color: t.c.ink3 },
  previewCap: { ...font('caption'), color: t.c.ink3, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8, marginTop: 14 },
}))
