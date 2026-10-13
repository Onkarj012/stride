import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { PACE_KG_PER_WEEK } from '@stride/core'
import { motion, radii } from '@stride/ui-tokens'
import { MONTHS_LONG } from '@/lib/format'
import {
  HEIGHT_CM,
  WEIGHT_KG,
  clamp,
  dateParts,
  daysLabel,
  deviceUnits,
  heightLabel,
  kgLabel,
  rateLabel,
  round1,
  stepCm,
  stepDate,
  stepKg,
  weightNumber,
  weightToKg,
  type Activity,
  type DietType,
  type Goal,
  type Pace,
  type Sex,
  type Units,
} from '@/lib/profile'
import { font, themedStyles, useTheme } from '@/theme'
import { Stepper } from './Controls'
import { Icon } from './Icon'
import { Tap } from './Tap'

type Choice<T extends string> = { value: T; label: string; detail?: string }
export type TargetValue = { targetWeightKg: number; pace: Pace }

const CM_PER_INCH = 2.54

// A typed number, with a comma or dot as the decimal mark, or null when it is not above zero.
function parsePositive(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Keeps a target on the far side of today's weight, 0.1 kg short of it, as the server requires.
function boundTarget(kg: number, goal: 'lose' | 'gain', weightKg: number): number {
  return goal === 'lose' ? Math.min(kg, round1(weightKg - 0.1)) : Math.max(kg, round1(weightKg + 0.1))
}

// Full-width tappable rows, as in the mock's goal step. The chosen row turns ink with a Polo radio.
function ChoiceRows<T extends string>({ options, value, onChange }: { options: Choice<T>[]; value: T | null; onChange: (v: T) => void }) {
  const t = useTheme()
  const s = useStyles()
  return (
    <View style={s.list}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            scale={motion.press.rowScale}
            style={[s.row, on && s.rowOn]}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
          >
            <View style={s.rowText}>
              <Text style={[s.rowLabel, on && s.rowLabelOn]}>{o.label}</Text>
              {o.detail ? <Text style={[s.rowDetail, on && s.rowDetailOn]}>{o.detail}</Text> : null}
            </View>
            <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={14} color={t.c.onPolo} /> : null}</View>
          </Tap>
        )
      })}
    </View>
  )
}

// Card holding one or more field rows, like the mock's basics card.
function FieldCard({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <View style={s.fieldCard}>{children}</View>
}

// One labelled control inside a field card. Rows after the first get a divider above.
function FieldRow({ label, divider = false, children }: { label: string; divider?: boolean; children: ReactNode }) {
  const s = useStyles()
  return (
    <View style={[s.field, divider && s.fieldLine]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  )
}

export const GOAL_OPTIONS: Choice<Goal>[] = [
  { value: 'lose', label: 'Lose fat, slowly', detail: 'Keeps your strength.' },
  { value: 'maintain', label: 'Stay where I am', detail: 'Eat to your real burn, train well.' },
  { value: 'gain', label: 'Build muscle', detail: 'Small surplus, progressive lifting.' },
]

// Lose, maintain or gain.
export function GoalInput({ value, onChange }: { value: Goal | null; onChange: (v: Goal) => void }) {
  return <ChoiceRows options={GOAL_OPTIONS} value={value} onChange={onChange} />
}

export const SEX_OPTIONS: Choice<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

// Sex for the starting formula.
export function SexInput({ value, onChange }: { value: Sex | null; onChange: (v: Sex) => void }) {
  return <ChoiceRows options={SEX_OPTIONS} value={value} onChange={onChange} />
}

// Day, month and year steppers for a YYYY-MM-DD date.
export function DobInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { year, month, day } = dateParts(value)
  return (
    <FieldCard>
      <FieldRow label="Day">
        <Stepper value={String(day)} label="day" onStep={(dir) => onChange(stepDate(value, 'day', dir))} />
      </FieldRow>
      <FieldRow label="Month" divider>
        <Stepper value={MONTHS_LONG[month - 1] ?? ''} label="month" onStep={(dir) => onChange(stepDate(value, 'month', dir))} />
      </FieldRow>
      <FieldRow label="Year" divider>
        <Stepper value={String(year)} label="year" onStep={(dir) => onChange(stepDate(value, 'year', dir))} />
      </FieldRow>
    </FieldCard>
  )
}

// Height in cm, shown in cm or ft/in, stepped by 1 cm or 1 inch. Typed as cm, or as total inches in imperial.
export function HeightInput({ value, onChange, units = deviceUnits() }: { value: number; onChange: (cm: number) => void; units?: Units }) {
  // Turns a typed height into cm and keeps it inside the bounds.
  function typeHeight(text: string) {
    const n = parsePositive(text)
    if (n === null) return
    const cm = units === 'metric' ? n : n * CM_PER_INCH
    onChange(clamp(Math.round(cm), HEIGHT_CM.min, HEIGHT_CM.max))
  }
  const typeText = units === 'metric' ? String(value) : String(Math.round(value / CM_PER_INCH))
  return (
    <FieldCard>
      <FieldRow label="Height">
        <Stepper
          value={heightLabel(value, units)}
          typeText={typeText}
          label="height"
          onStep={(dir) => onChange(stepCm(value, dir, units))}
          onType={typeHeight}
        />
      </FieldRow>
    </FieldCard>
  )
}

// Weight in kg, shown in kg or lb, stepped by 0.1 kg or 1 lb. Tap the number to type it.
export function WeightInput({ value, onChange, units = deviceUnits() }: { value: number; onChange: (kg: number) => void; units?: Units }) {
  // Turns a typed weight in the user's unit into kg and keeps it inside the bounds.
  function typeWeight(text: string) {
    const n = parsePositive(text)
    if (n !== null) onChange(clamp(weightToKg(n, units), WEIGHT_KG.min, WEIGHT_KG.max))
  }
  return (
    <FieldCard>
      <FieldRow label="Weight">
        <Stepper
          value={kgLabel(value, units)}
          typeText={weightNumber(value, units)}
          label="weight"
          onStep={(dir) => onChange(stepKg(value, dir, units))}
          onType={typeWeight}
        />
      </FieldRow>
    </FieldCard>
  )
}

export const ACTIVITY_OPTIONS: Choice<Activity>[] = [
  { value: 'sedentary', label: 'Mostly sitting', detail: 'Desk job, little exercise.' },
  { value: 'light', label: 'Lightly active', detail: 'On my feet some, a walk or two.' },
  { value: 'moderate', label: 'Moderately active', detail: 'Train a few times a week.' },
  { value: 'active', label: 'Active', detail: 'Physical job or hard training most days.' },
  { value: 'very_active', label: 'Very active', detail: 'Physical job plus daily training.' },
]

// How active a usual week is.
export function ActivityInput({ value, onChange }: { value: Activity | null; onChange: (v: Activity) => void }) {
  return <ChoiceRows options={ACTIVITY_OPTIONS} value={value} onChange={onChange} />
}

export const DIET_OPTIONS: Choice<DietType>[] = [
  { value: 'veg', label: 'Veg' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_veg', label: 'Non-veg' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'jain', label: 'Jain' },
]

// Diet type from the five options.
export function DietInput({ value, onChange }: { value: DietType | null; onChange: (v: DietType) => void }) {
  return <ChoiceRows options={DIET_OPTIONS} value={value} onChange={onChange} />
}

export const PACES: Choice<Pace>[] = [
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'steady', label: 'Steady' },
  { value: 'fast', label: 'Fast' },
]

// Target weight, kept on the far side of the current weight, then the pace that gets there.
export function TargetPaceInput({
  value,
  onChange,
  goal,
  weightKg,
  units = deviceUnits(),
}: {
  value: TargetValue
  onChange: (v: TargetValue) => void
  goal: 'lose' | 'gain'
  weightKg: number
  units?: Units
}) {
  const s = useStyles()
  // Stops the target on the wrong side of today's weight, which the server would reject.
  function stepTarget(dir: -1 | 1) {
    onChange({ ...value, targetWeightKg: boundTarget(stepKg(value.targetWeightKg, dir, units), goal, weightKg) })
  }
  // Turns a typed target in the user's unit into kg, kept inside the bounds and on the far side of today's weight.
  function typeTarget(text: string) {
    const n = parsePositive(text)
    if (n === null) return
    onChange({ ...value, targetWeightKg: boundTarget(clamp(weightToKg(n, units), WEIGHT_KG.min, WEIGHT_KG.max), goal, weightKg) })
  }
  const options = PACES.map((p) => ({ ...p, detail: rateLabel(PACE_KG_PER_WEEK[goal][p.value], units) }))
  return (
    <View>
      <FieldCard>
        <FieldRow label="Target weight">
          <Stepper
            value={kgLabel(value.targetWeightKg, units)}
            typeText={weightNumber(value.targetWeightKg, units)}
            label="target weight"
            onStep={stepTarget}
            onType={typeTarget}
          />
        </FieldRow>
      </FieldCard>
      <Text style={s.caption}>Pace</Text>
      <ChoiceRows options={options} value={value.pace} onChange={(pace) => onChange({ ...value, pace })} />
    </View>
  )
}

// Training days per week, 0 to 7.
export function TrainingDaysInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <FieldCard>
      <FieldRow label="Days a week">
        <Stepper value={daysLabel(value)} label="training days" onStep={(dir) => onChange(clamp(value + dir, 0, 7))} />
      </FieldRow>
    </FieldCard>
  )
}

const useStyles = themedStyles((t) => ({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  rowOn: { backgroundColor: t.c.ink },
  rowText: { flex: 1 },
  rowLabel: { ...font('section'), color: t.c.ink },
  rowLabelOn: { color: t.c.bg },
  rowDetail: { ...font('secondary'), color: t.c.ink3, marginTop: 2 },
  rowDetailOn: { color: t.c.bg, opacity: 0.65 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: t.c.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: t.c.polo, borderColor: t.c.polo },
  fieldCard: { backgroundColor: t.c.card, borderRadius: radii.card, boxShadow: t.shadow.card, paddingHorizontal: 16 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 64 },
  fieldLine: { borderTopWidth: 1, borderTopColor: t.c.line },
  fieldLabel: { ...font('bodyStrong'), color: t.c.ink, flexShrink: 1 },
  caption: { ...font('eyebrow'), color: t.c.ink3, marginTop: 24, marginBottom: 10, marginHorizontal: 2 },
}))
