import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { PACE_KG_PER_WEEK } from '@stride/core'
import { motion, radii } from '@stride/ui-tokens'
import { MONTHS_LONG } from '@/lib/format'
import {
  clamp,
  dateParts,
  deviceUnits,
  heightLabel,
  kgLabel,
  rateLabel,
  round1,
  stepCm,
  stepDate,
  stepKg,
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

// Full-width tappable rows. The chosen row gets the Polo accent and a filled radio.
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
              <Text style={s.rowLabel}>{o.label}</Text>
              {o.detail ? <Text style={s.rowDetail}>{o.detail}</Text> : null}
            </View>
            <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={14} color={t.c.onPolo} /> : null}</View>
          </Tap>
        )
      })}
    </View>
  )
}

// One labelled control on a card, like the mock's basics rows.
function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles()
  return (
    <View style={s.field}>
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
  const s = useStyles()
  const { year, month, day } = dateParts(value)
  return (
    <View style={s.stack}>
      <FieldRow label="Day">
        <Stepper value={String(day)} label="day" onStep={(dir) => onChange(stepDate(value, 'day', dir))} />
      </FieldRow>
      <FieldRow label="Month">
        <Stepper value={MONTHS_LONG[month - 1] ?? ''} label="month" onStep={(dir) => onChange(stepDate(value, 'month', dir))} />
      </FieldRow>
      <FieldRow label="Year">
        <Stepper value={String(year)} label="year" onStep={(dir) => onChange(stepDate(value, 'year', dir))} />
      </FieldRow>
    </View>
  )
}

// Height in cm, shown in cm or ft/in, stepped by 1 cm or 1 inch.
export function HeightInput({ value, onChange, units = deviceUnits() }: { value: number; onChange: (cm: number) => void; units?: Units }) {
  return (
    <FieldRow label="Height">
      <Stepper value={heightLabel(value, units)} label="height" onStep={(dir) => onChange(stepCm(value, dir, units))} />
    </FieldRow>
  )
}

// Weight in kg, shown in kg or lb, stepped by 0.1 kg or 1 lb.
export function WeightInput({ value, onChange, units = deviceUnits() }: { value: number; onChange: (kg: number) => void; units?: Units }) {
  return (
    <FieldRow label="Weight">
      <Stepper value={kgLabel(value, units)} label="weight" onStep={(dir) => onChange(stepKg(value, dir, units))} />
    </FieldRow>
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
    const next = stepKg(value.targetWeightKg, dir, units)
    const bounded = goal === 'lose' ? Math.min(next, round1(weightKg - 0.1)) : Math.max(next, round1(weightKg + 0.1))
    onChange({ ...value, targetWeightKg: bounded })
  }
  const options = PACES.map((p) => ({ ...p, detail: rateLabel(PACE_KG_PER_WEEK[goal][p.value], units) }))
  return (
    <View>
      <FieldRow label="Target weight">
        <Stepper value={kgLabel(value.targetWeightKg, units)} label="target weight" onStep={stepTarget} />
      </FieldRow>
      <Text style={s.caption}>Pace</Text>
      <ChoiceRows options={options} value={value.pace} onChange={(pace) => onChange({ ...value, pace })} />
    </View>
  )
}

// Training days per week, 0 to 7.
export function TrainingDaysInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <FieldRow label="Days a week">
      <Stepper
        value={value === 1 ? '1 day' : `${value} days`}
        label="training days"
        onStep={(dir) => onChange(clamp(value + dir, 0, 7))}
      />
    </FieldRow>
  )
}

const useStyles = themedStyles((t) => ({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  rowOn: { backgroundColor: t.c.poloSoft, borderColor: t.c.polo },
  rowText: { flex: 1 },
  rowLabel: { ...font('bodyStrong'), color: t.c.ink },
  rowDetail: { ...font('secondary'), color: t.c.ink2, marginTop: 2 },
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
  stack: { gap: 10 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: radii.card,
    backgroundColor: t.c.card,
    boxShadow: t.shadow.card,
  },
  fieldLabel: { ...font('bodyStrong'), color: t.c.ink },
  caption: { ...font('eyebrow'), color: t.c.ink2, marginTop: 22, marginBottom: 10 },
}))
