import { useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'
import { radii } from '@stride/ui-tokens'
import { Button, RoundButton } from '@/components/Controls'
import { ListCard, ListRow } from '@/components/ListRow'
import { Screen, ScreenTitle, Section } from '@/components/Screen'
import { TimeZoneGate } from '@/components/TimeZoneGate'
import { plainError } from '@/lib/log'
import { font, themedStyles, useTheme } from '@/theme'

type UsualMeal = FunctionReturnType<typeof api.usual_meals.list>[number]
type Food = FunctionReturnType<typeof api.usual_meals.searchFoods>[number]
type SelectedFood = { foodId: Id<'foods'>; foodName: string; grams: string }

// Shows saved meals and lets the user build each one from current food records.
export default function UsualMealsScreen() {
  return <TimeZoneGate><UsualMeals /></TimeZoneGate>
}

// Lists saved templates and edits one explicit selection at a time.
function UsualMeals() {
  const t = useTheme()
  const s = useStyles()
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SelectedFood[]>([])
  const [editing, setEditing] = useState<Id<'usual_meals'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const enabled = useQuery(api.food_shortcuts.getEnabled, {})
  const meals = useQuery(api.usual_meals.list, enabled ? {} : 'skip')
  const foods = useQuery(api.usual_meals.searchFoods, enabled && search.trim().length > 1 ? { query: search } : 'skip')
  const setEnabled = useMutation(api.food_shortcuts.setEnabled)
  const saveMeal = useMutation(api.usual_meals.save)
  const removeMeal = useMutation(api.usual_meals.remove)

  // Starts a blank template or loads an existing one for editing.
  function editMeal(meal?: UsualMeal) {
    setEditing(meal?._id ?? null)
    setName(meal?.name ?? '')
    setSelected(meal?.items.map((item) => ({ foodId: item.foodId, foodName: item.foodName, grams: String(item.grams) })) ?? [])
    setSearch('')
    setProblem(null)
  }

  // Adds a selected food once; duplicate rows are avoided in the template.
  function addFood(food: Food) {
    setSelected((current) => current.some((item) => item.foodId === food._id)
      ? current
      : [...current, { foodId: food._id, foodName: food.name, grams: '100' }])
    setSearch('')
  }

  // Saves the fixed quantities after checking each amount.
  async function save() {
    setProblem(null)
    const items = selected.map((item) => ({ foodId: item.foodId, grams: Number(item.grams) }))
    if (items.some((item) => !Number.isFinite(item.grams) || item.grams <= 0)) {
      setProblem('Enter a positive gram amount for each food.')
      return
    }
    setBusy(true)
    try {
      await saveMeal({ name, items, ...(editing ? { mealId: editing } : {}) })
      editMeal()
    } catch (error) {
      setProblem(plainError(error))
    } finally {
      setBusy(false)
    }
  }

  // Removes one saved template after the user taps its delete row.
  async function deleteMeal(meal: UsualMeal) {
    setProblem(null)
    try {
      await removeMeal({ mealId: meal._id })
      if (editing === meal._id) editMeal()
    } catch (error) {
      setProblem(plainError(error))
    }
  }

  return (
    <Screen>
      <RoundButton icon="back" label="Back" onPress={() => router.back()} />
      <ScreenTitle eyebrow="Food" title="Usual meals" />
      {enabled === false ? (
        <View style={s.card}>
          <Text style={s.body}>Turn on saved meals and label capture to make a fixed meal such as oats with milk.</Text>
          <Button label="Turn on" variant="coral" onPress={() => void setEnabled({ enabled: true })} />
        </View>
      ) : null}
      {enabled ? (
        <>
          <Section title="Saved" link="New meal" onLink={() => editMeal()} />
          {meals?.length ? (
            <ListCard>
              {meals.map((meal, index) => (
                <View key={meal._id} style={index === meals.length - 1 ? undefined : s.rowLine}>
                  <ListRow label={meal.name} detail={meal.items.map((item) => `${item.foodName} · ${item.grams} g${item.estimated ? ' · estimated' : ''}${item.available ? '' : ' · unavailable'}`).join(', ')} onPress={() => editMeal(meal)} />
                  <ListRow label="Delete" danger onPress={() => void deleteMeal(meal)} last />
                </View>
              ))}
            </ListCard>
          ) : <Text style={s.body}>No usual meals yet. Add one below.</Text>}
          <Section title={editing ? `Edit ${editing ? name : ''}` : 'New usual meal'} />
          <View style={s.card}>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Meal name" placeholderTextColor={t.c.ink3} accessibilityLabel="Usual meal name" />
            <Text style={s.hint}>Search a food, then enter the amount in grams. Nutrients come from that food when you log.</Text>
            <TextInput style={s.input} value={search} onChangeText={setSearch} placeholder="Find a food" placeholderTextColor={t.c.ink3} accessibilityLabel="Search foods" />
            {search.trim().length > 1 ? foods?.map((food) => (
              <ListRow key={food._id} label={food.name} detail={`${Math.round(food.per100g.kcal)} kcal per 100 g${food.source === 'ai_estimate' ? ' · estimated' : ''}`} onPress={() => addFood(food)} />
            )) : null}
            {selected.map((item, index) => (
              <View key={item.foodId} style={s.selected}>
                <View style={s.selectedName}><Text style={s.foodName}>{item.foodName}</Text></View>
                <TextInput style={[s.input, s.grams]} value={item.grams} onChangeText={(grams) => setSelected((current) => current.map((row, i) => i === index ? { ...row, grams } : row))} keyboardType="decimal-pad" accessibilityLabel={`${item.foodName} grams`} />
                <Text style={s.unit}>g</Text>
                <Button label="Remove" variant="ghost" size="sm" onPress={() => setSelected((current) => current.filter((_, i) => i !== index))} />
              </View>
            ))}
            {problem ? <Text style={s.error}>{problem}</Text> : null}
            <View style={s.actions}>
              {editing ? <Button label="Cancel edit" variant="ghost" onPress={() => editMeal()} /> : null}
              <Button label={busy ? 'Saving…' : 'Save usual meal'} variant="coral" busy={busy} disabled={selected.length === 0} onPress={() => void save()} />
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  )
}

const useStyles = themedStyles((theme) => ({
  card: { marginTop: 16, padding: 16, borderRadius: radii.md, backgroundColor: theme.c.card, boxShadow: theme.shadow.card, gap: 10 },
  body: { ...font('body'), color: theme.c.ink2, marginTop: 14, lineHeight: 22 },
  hint: { ...font('caption'), color: theme.c.ink3, lineHeight: 18 },
  input: { ...font('body'), color: theme.c.ink, backgroundColor: theme.c.card2, borderRadius: radii.sm, paddingVertical: 12, paddingHorizontal: 12 },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  selectedName: { flex: 1 },
  foodName: { ...font('bodyStrong'), color: theme.c.ink },
  grams: { width: 72, textAlign: 'right' },
  unit: { ...font('caption'), color: theme.c.ink3 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  error: { ...font('caption'), color: theme.c.poloInk },
  rowLine: { borderBottomWidth: 1, borderBottomColor: theme.c.line },
}))
