import { Text, View } from 'react-native'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'
import { radii } from '@stride/ui-tokens'
import { font, themedStyles } from '@/theme'
import { Button } from './Controls'

type UsualMeal = FunctionReturnType<typeof api.usual_meals.list>[number]

/** Offers the caller's saved templates for immediate logging or editing. */
export function UsualMealPicker({ enabled, busyMealId, onLog, onManage, onCancel }: {
  enabled: boolean
  busyMealId: Id<'usual_meals'> | null
  onLog: (mealId: Id<'usual_meals'>) => void
  onManage: () => void
  onCancel: () => void
}) {
  const s = useStyles()
  const meals = useQuery(api.usual_meals.list, enabled ? {} : 'skip')
  return (
    <View style={s.card}>
      <Text style={s.title}>Your usual meals</Text>
      <Text style={s.note}>Each log uses current food data and can be undone.</Text>
      {meals?.map((meal) => <MealRow key={meal._id} meal={meal} busy={busyMealId === meal._id} disabled={busyMealId !== null} onLog={() => onLog(meal._id)} />)}
      {meals?.length === 0 ? <Text style={s.note}>No saved meals yet.</Text> : null}
      <View style={s.actions}>
        <Button label="Manage meals" variant="ghost" onPress={onManage} />
        <Button label="Back" onPress={onCancel} />
      </View>
    </View>
  )
}

// Shows a template's fixed amounts and keeps missing food references out of the log action.
function MealRow({ meal, busy, disabled, onLog }: { meal: UsualMeal; busy: boolean; disabled: boolean; onLog: () => void }) {
  const s = useStyles()
  const available = meal.items.length > 0 && meal.items.every((item) => item.available)
  const detail = meal.items.map((item) => `${item.foodName} ${item.grams} g${item.estimated ? ' · estimated' : ''}${item.available ? '' : ' · missing'}`).join(', ')
  return (
    <View style={s.meal}>
      <View style={s.mealText}>
        <Text style={s.mealName}>{meal.name}</Text>
        <Text style={s.note}>{detail}</Text>
      </View>
      <Button label="Log" variant="coral" size="sm" busy={busy} disabled={!available || disabled} onPress={onLog} />
    </View>
  )
}

const useStyles = themedStyles((t) => ({
  card: { marginTop: 18, padding: 16, borderRadius: radii.md, backgroundColor: t.c.card, boxShadow: t.shadow.card, gap: 12 },
  title: { ...font('emptyTitle'), color: t.c.ink, fontSize: 21 },
  note: { ...font('caption'), color: t.c.ink3, lineHeight: 18 },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.c.line },
  mealText: { flex: 1, gap: 4 },
  mealName: { ...font('bodyStrong'), color: t.c.ink },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
}))
