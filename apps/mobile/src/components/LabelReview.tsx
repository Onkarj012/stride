import { useState } from 'react'
import { Image, Text, TextInput, View } from 'react-native'
import { useMutation } from 'convex/react'
import { api } from 'stride-backend/convex/_generated/api'
import type { Id } from 'stride-backend/convex/_generated/dataModel'
import type { LabelBasis, LabelEnergyUnit, LabelNutritionCandidate, LabelServingUnit } from 'stride-backend/convex/label_foods'
import { motion, radii } from '@stride/ui-tokens'
import { font, themedStyles, useTheme } from '@/theme'
import { Button } from './Controls'
import { Tap } from './Tap'
import { plainError } from '@/lib/log'

type NutrientField = 'energy' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'sodiumMg'

/** Reviews extracted package values and saves them only after an explicit confirmation. */
export function LabelReview({ storageId, photoUri, candidate, onSaved, onCancel }: {
  storageId: Id<'_storage'>
  photoUri: string
  candidate: LabelNutritionCandidate
  onSaved: (foodId: Id<'foods'>, name: string) => void
  onCancel: () => void
}) {
  const t = useTheme()
  const s = useStyles()
  const saveFood = useMutation(api.label_foods.saveReviewedLabel)
  const [name, setName] = useState(candidate.name ?? '')
  const [basis, setBasis] = useState<LabelBasis | null>(candidate.basis)
  const [servingAmount, setServingAmount] = useState(candidate.servingAmount === null ? '' : String(candidate.servingAmount))
  const [servingUnit, setServingUnit] = useState<LabelServingUnit | null>(candidate.servingUnit)
  const [density, setDensity] = useState('')
  const [energyUnit, setEnergyUnit] = useState<LabelEnergyUnit | null>(candidate.energyUnit)
  const [values, setValues] = useState<Record<NutrientField, string>>({
    energy: textValue(candidate.energy),
    protein: textValue(candidate.protein),
    carbs: textValue(candidate.carbs),
    fat: textValue(candidate.fat),
    fiber: textValue(candidate.fiber),
    sugar: textValue(candidate.sugar),
    sodiumMg: textValue(candidate.sodiumMg),
  })
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Saves the values the user checked against the printed panel.
  async function save() {
    setProblem(null)
    setBusy(true)
    try {
      if (!basis || !energyUnit) throw new Error('Choose the label basis and energy unit.')
      const field = (key: NutrientField) => numberOrNull(values[key])
      const foodId = await saveFood({
        storageId,
        name: name.trim(),
        basis,
        servingAmount: numberOrNull(servingAmount),
        servingUnit,
        densityGramsPer100ml: numberOrNull(density),
        energy: field('energy'),
        energyUnit,
        protein: field('protein'),
        carbs: field('carbs'),
        fat: field('fat'),
        fiber: field('fiber'),
        sugar: field('sugar'),
        sodiumMg: field('sodiumMg'),
      })
      onSaved(foodId, name.trim())
    } catch (error) {
      setProblem(plainError(error))
      setBusy(false)
    }
  }

  const needsDensity = basis === 'per_100ml' || servingUnit === 'ml'
  return (
    <View style={s.card}>
      <Text style={s.title}>Check the label values</Text>
      <Text style={s.note}>Read from the package photo. Check every number before saving. This food stays unverified.</Text>
      <Image source={{ uri: photoUri }} style={s.photo} accessibilityLabel="Nutrition panel photo" />
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Food name" placeholderTextColor={t.c.ink3} accessibilityLabel="Food name" />
      <Text style={s.label}>The panel gives values</Text>
      <ChoiceRow choices={[['per_100g', 'per 100 g'], ['per_100ml', 'per 100 ml'], ['per_serving', 'per serving']]} value={basis} onChange={setBasis} />
      <Text style={s.label}>Serving size, if shown</Text>
      <View style={s.row}>
        <TextInput style={[s.input, s.flex]} value={servingAmount} onChangeText={setServingAmount} keyboardType="decimal-pad" placeholder="Serving amount" placeholderTextColor={t.c.ink3} accessibilityLabel="Serving amount" />
        <ChoiceRow choices={[["g", "g"], ["ml", "ml"]]} value={servingUnit} onChange={setServingUnit} />
      </View>
      {needsDensity ? <Field label="Grams in 100 ml" value={density} onChange={setDensity} /> : null}
      <Text style={s.label}>Energy unit</Text>
      <ChoiceRow choices={[["kcal", "kcal"], ["kJ", "kJ"]]} value={energyUnit} onChange={setEnergyUnit} />
      <View style={s.fields}>
        <Field label={`Energy (${energyUnit ?? 'kcal or kJ'})`} value={values.energy} onChange={(value) => setField(setValues, 'energy', value)} />
        <Field label="Protein (g)" value={values.protein} onChange={(value) => setField(setValues, 'protein', value)} />
        <Field label="Carbohydrate (g)" value={values.carbs} onChange={(value) => setField(setValues, 'carbs', value)} />
        <Field label="Fat (g)" value={values.fat} onChange={(value) => setField(setValues, 'fat', value)} />
        <Field label="Fiber (g), optional" value={values.fiber} onChange={(value) => setField(setValues, 'fiber', value)} />
        <Field label="Sugar (g), optional" value={values.sugar} onChange={(value) => setField(setValues, 'sugar', value)} />
        <Field label="Sodium (mg), optional" value={values.sodiumMg} onChange={(value) => setField(setValues, 'sodiumMg', value)} />
      </View>
      {problem ? <Text style={s.error}>{problem}</Text> : null}
      <View style={s.row}>
        <Button label="Back" variant="ghost" disabled={busy} onPress={onCancel} />
        <Button label="Save personal food" variant="coral" busy={busy} onPress={() => void save()} style={s.flex} />
      </View>
    </View>
  )
}

// Shows a short set of picked values as pill buttons.
function ChoiceRow<T extends string>({ choices, value, onChange }: {
  choices: readonly (readonly [T, string])[]
  value: T | null
  onChange: (value: T) => void
}) {
  const s = useStyles()
  const t = useTheme()
  return (
    <View style={s.choices}>
      {choices.map(([key, label]) => (
        <Tap key={key} onPress={() => onChange(key)} scale={motion.press.rowScale} style={[s.choice, value === key && s.choiceOn]} accessibilityRole="button" accessibilityState={{ selected: value === key }}>
          <Text style={[s.choiceText, value === key && { color: t.c.onPolo }]}>{label}</Text>
        </Tap>
      ))}
    </View>
  )
}

// A numeric label value that stays blank when the model could not read it.
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useTheme()
  const s = useStyles()
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="Enter value" placeholderTextColor={t.c.ink3} accessibilityLabel={label} />
    </View>
  )
}

// Leaves unreadable or absent values empty instead of filling them with zero.
function textValue(value: number | null): string {
  return value === null ? '' : String(value)
}

// Parses a corrected number while leaving an empty field unresolved.
function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Changes one nutrition value without replacing the others.
function setField(setValues: (update: (current: Record<NutrientField, string>) => Record<NutrientField, string>) => void, field: NutrientField, value: string) {
  setValues((current) => ({ ...current, [field]: value }))
}

const useStyles = themedStyles((t) => ({
  card: { marginTop: 18, padding: 16, borderRadius: radii.md, backgroundColor: t.c.card, boxShadow: t.shadow.card, gap: 10 },
  title: { ...font('emptyTitle'), color: t.c.ink, fontSize: 21 },
  note: { ...font('caption'), lineHeight: 19, color: t.c.ink3 },
  photo: { height: 130, width: '100%', borderRadius: radii.sm, backgroundColor: t.c.card2 },
  input: { ...font('body'), color: t.c.ink, backgroundColor: t.c.card2, borderRadius: radii.sm, paddingVertical: 12, paddingHorizontal: 12, minWidth: 88 },
  label: { ...font('label'), color: t.c.ink2, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fields: { gap: 8 },
  field: { flex: 1, minWidth: '46%', gap: 4 },
  fieldLabel: { ...font('caption'), color: t.c.ink2 },
  flex: { flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderRadius: radii.pill, backgroundColor: t.c.card2, paddingVertical: 9, paddingHorizontal: 12 },
  choiceOn: { backgroundColor: t.c.polo },
  choiceText: { ...font('caption'), color: t.c.ink2 },
  error: { ...font('caption'), color: t.c.poloInk },
}))
