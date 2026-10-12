import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { radii } from '@stride/ui-tokens'
import { clockOf, formatClock, formatNumber } from '@/lib/format'
import { SLOT_NAMES, type EntryView, type MealSlot } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'
import { Tag } from './Controls'
import { Icon } from './Icon'

export type Meal = { slot: MealSlot; firstAt: number; entries: EntryView[]; kcal: number; protein: number; estimated: boolean }

// Groups a day's entries into one meal per slot, ordered by when each meal started.
export function groupMeals(entries: EntryView[]): Meal[] {
  const bySlot = new Map<MealSlot, Meal>()
  for (const e of entries) {
    const meal = bySlot.get(e.slot)
    if (meal) {
      meal.entries.push(e)
      meal.firstAt = Math.min(meal.firstAt, e.loggedAt)
      meal.estimated ||= e.flags.includes('estimated')
    } else
      bySlot.set(e.slot, {
        slot: e.slot,
        firstAt: e.loggedAt,
        entries: [e],
        kcal: e.mealNutrients.kcal,
        protein: e.mealNutrients.protein,
        estimated: e.flags.includes('estimated'),
      })
  }
  return [...bySlot.values()].sort((a, b) => a.firstAt - b.firstAt)
}

// One meal row: time, slot (with an est. tag for photo items), its foods, and kcal. Tap opens the meal sheet.
export function MealRow({ meal, first, onPress }: { meal: Meal; first: boolean; onPress?: () => void }) {
  const s = useStyles()
  return (
    <Animated.View entering={FadeInDown.springify().stiffness(300).damping(17)}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [s.meal, !first && s.divider, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${SLOT_NAMES[meal.slot]}, ${formatNumber(meal.kcal)} kcal`}
      >
        <Text style={s.time}>{formatClock(clockOf(meal.firstAt))}</Text>
        <View style={s.main}>
          <View style={s.nameRow}>
            <Text style={s.name}>{SLOT_NAMES[meal.slot]}</Text>
            {meal.estimated ? <Tag text="est." tone="est" /> : null}
          </View>
          <Text style={s.items}>{meal.entries.map((e) => e.foodName).join(' · ')}</Text>
        </View>
        <Text style={s.kcal}>{formatNumber(meal.kcal)}</Text>
      </Pressable>
    </Animated.View>
  )
}

// Ghost row inviting the next meal; opens the compose sheet.
export function NextMealRow({ slot, around, first, onPress }: { slot: MealSlot; around: string; first: boolean; onPress: () => void }) {
  const t = useTheme()
  const s = useStyles()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.meal, !first && s.divider, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Log ${SLOT_NAMES[slot]}`}
    >
      <Text style={s.time}>~{around}</Text>
      <View style={s.main}>
        <Text style={[s.name, { color: t.c.ink3 }]}>{SLOT_NAMES[slot]}</Text>
        <Text style={[s.items, { color: t.c.ink3 }]}>Tap to log</Text>
      </View>
      <View style={s.ghostPlus}>
        <Icon name="plus" size={16} color={t.c.ink2} />
      </View>
    </Pressable>
  )
}

const useStyles = themedStyles((t) => ({
  meal: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14, paddingHorizontal: 4 },
  divider: { borderTopWidth: 1, borderTopColor: t.c.line },
  pressed: { backgroundColor: t.c.card2, borderRadius: radii.sm },
  time: { ...font('caption'), color: t.c.ink3, width: 48, paddingTop: 2, fontVariant: ['tabular-nums'] },
  main: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...font('bodyStrong'), color: t.c.ink },
  items: { ...font('secondary'), color: t.c.ink2, marginTop: 3 },
  kcal: { ...font('value'), color: t.c.ink, paddingTop: 1 },
  ghostPlus: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: t.c.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}))
